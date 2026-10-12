import { LIVE_CACHE_S, MAX_STREAM_DELAY_MS, RELAY_ORIGIN, TWITCH_LOGIN, type LiveAnswer } from '@choom/stream';
import { RELAYS, RELAY_URL, httpOf } from '../shared/config';
import { VIEWER_PORT, type ToBackground, type ToContent } from '../shared/messages';
import { ViewerChannel } from './viewer-channel';

/**
 * The background service worker (MV3): every twitch.tv tab holds a port here
 * and says which channel it shows. A channel gets a relay socket only once
 * GET /live says it is sharing (cached), so the many channels that never
 * share cost a small cached request, not an open socket. One socket per
 * channel, shared by its tabs, closed shortly after the last tab leaves.
 *
 * Built to survive being stopped at any time: the content script reconnects
 * its port and says `watch` again, and a new socket starts from a snapshot.
 */
const CLOSE_AFTER_MS = 10_000;

interface Watched {
  channel: ViewerChannel;
  ports: Set<chrome.runtime.Port>;
  closeTimer: ReturnType<typeof setTimeout> | null;
}
const watched = new Map<string, Watched>();
const liveCache = new Map<string, { at: number; answer: LiveAnswer; relay: string }>();

async function askLive(relay: string, login: string): Promise<LiveAnswer | null> {
  try {
    // `default`, not `no-store`: the relay's 30 s edge cache is what keeps /live cheap at scale.
    const res = await fetch(`${httpOf(relay)}/live/${encodeURIComponent(login)}`, { cache: 'default' });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<LiveAnswer>;
    const hint = typeof body.relay === 'string' && RELAY_ORIGIN.test(body.relay) ? body.relay : undefined;
    return { live: body.live === true, delayMs: Number.isInteger(body.delayMs) && body.delayMs! >= 0 && body.delayMs! <= MAX_STREAM_DELAY_MS ? body.delayMs! : 0, ...(hint ? { relay: hint } : {}) };
  } catch {
    return null;
  }
}

/**
 * Whether a channel is sharing, and on which relay. The primary relay is asked
 * first; its `relay` hint (a host switch) is followed only to a relay in this
 * build's allowlist, never one the answer made up.
 */
async function isLive(login: string): Promise<{ answer: LiveAnswer; relay: string }> {
  const hit = liveCache.get(login);
  if (hit && Date.now() - hit.at < LIVE_CACHE_S * 1000) return hit;
  let relay = RELAY_URL;
  let answer = (await askLive(relay, login)) ?? { live: false, delayMs: 0 };
  if (!answer.live && answer.relay && answer.relay !== relay && RELAYS.includes(answer.relay)) {
    const there = await askLive(answer.relay, login);
    if (there) {
      relay = answer.relay;
      answer = there;
    }
  }
  const entry = { at: Date.now(), answer, relay };
  liveCache.set(login, entry);
  return entry;
}

const post = (port: chrome.runtime.Port, msg: ToContent) => {
  try {
    port.postMessage(msg);
  } catch {
    // The tab went away mid-send.
  }
};

function leave(port: chrome.runtime.Port, login: string | null) {
  if (!login) return;
  const w = watched.get(login);
  if (!w) return;
  w.ports.delete(port);
  if (w.ports.size === 0 && !w.closeTimer) {
    w.closeTimer = setTimeout(() => {
      w.channel.close();
      watched.delete(login);
    }, CLOSE_AFTER_MS);
  }
}

async function watch(port: chrome.runtime.Port, login: string) {
  let w = watched.get(login);
  if (!w) {
    const { answer, relay } = await isLive(login);
    if (!answer.live) return post(port, { t: 'offline', login });
    // Another port may have opened it while this one waited on /live.
    w = watched.get(login);
    if (!w) {
      const ports = new Set<chrome.runtime.Port>();
      const channel = new ViewerChannel(login, relay, (u) => {
        const msg: ToContent = u.ended ? { t: 'offline', login } : { t: 'state', login, state: u.state, delayMs: u.delayMs, live: u.live };
        for (const p of ports) post(p, msg);
        if (u.ended) {
          liveCache.delete(login);
          watched.delete(login);
        }
      });
      w = { channel, ports, closeTimer: null };
      watched.set(login, w);
      channel.open();
    }
  }
  if (w.closeTimer) {
    clearTimeout(w.closeTimer);
    w.closeTimer = null;
  }
  w.ports.add(port);
  const now = w.channel.current();
  post(port, { t: 'state', login, state: now.state, delayMs: now.delayMs, live: now.live });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== VIEWER_PORT) return;
  // Only our own content script on twitch.tv may watch.
  if (!port.sender?.url?.startsWith('https://www.twitch.tv/')) return port.disconnect();
  let current: string | null = null;
  port.onMessage.addListener((msg: ToBackground) => {
    if (msg?.t === 'beat') return;
    if (msg?.t !== 'watch') return;
    const login = typeof msg.login === 'string' && TWITCH_LOGIN.test(msg.login) ? msg.login.toLowerCase() : null;
    if (login === current) {
      // Asked again (the offline poll): only a channel not yet open needs another look.
      if (login && !watched.get(login)?.ports.has(port)) void watch(port, login);
      return;
    }
    leave(port, current);
    current = login;
    if (login) void watch(port, login);
  });
  port.onDisconnect.addListener(() => leave(port, current));
});
