import { liveChannelOf } from '../shared/channel-page';
import { LATENCY_SAMPLE, LATENCY_START } from '../shared/latency';
import { readSettings, SETTINGS_KEY, VIEWER_PORT, type ToBackground, type ToContent, type ViewerSettings } from '../shared/messages';
import { ViewerBuffer } from '../shared/viewer-buffer';
import type { StreamState } from '@choom/stream';
import { DeckPanel, channelOffline, playerContainer } from './panel';
import { CardHover } from './hover';

/**
 * The twitch.tv content script: on a channel's live page, while the tab is
 * visible, it asks the background to watch that channel and draws the
 * streamer's deck over the player, held back to match the video.
 *
 * Twitch is a single-page app, so the page is re-read every second (a raid or
 * a click to another channel changes the path without a reload).
 */
const TICK_MS = 1_000;
const BEAT_MS = 20_000;
/** A channel that is not sharing is asked about again after 1, then 2, then every 5 minutes (/live is cached 30 s). */
const OFFLINE_RETRY_MS = [60_000, 120_000, 300_000];
let offlineTries = 0;

let settings: ViewerSettings = readSettings(null);
let port: chrome.runtime.Port | null = null;
let watching: string | null = null;
let offlineAt = 0;
let relayDelayMs = 0;
let latencyMs: number | null = null;
let probeLive: boolean | null = null;
const buffer = new ViewerBuffer();
let lastDrawn: unknown = undefined;
const hover = new CardHover();
let hoverOn: HTMLElement | null = null;
let shownState: StreamState | null = null;
function onPointer(e: PointerEvent) {
  const video = document.querySelector('video');
  if (!settings.hover || !video || !hoverOn) return;
  hover.move(e.clientX, e.clientY, video, hoverOn, shownState, panel.box());
}
const offPointer = () => hover.hide();
const panel = new DeckPanel((collapsed) => {
  settings = { ...settings, collapsed };
  void chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}, false);

chrome.storage.local.get(SETTINGS_KEY).then((got) => {
  settings = readSettings(got[SETTINGS_KEY]);
  panel.setCollapsed(settings.collapsed);
  lastDrawn = undefined;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes[SETTINGS_KEY]) settings = readSettings(changes[SETTINGS_KEY].newValue);
});

function send(msg: ToBackground) {
  try {
    port?.postMessage(msg);
  } catch {
    port = null;
  }
}

function connect() {
  port = chrome.runtime.connect({ name: VIEWER_PORT });
  port.onMessage.addListener((msg: ToContent) => {
    if (msg.login !== watching) return;
    if (msg.t === 'offline') {
      offlineAt = Date.now();
      buffer.clear();
      return;
    }
    offlineTries = 0;
    relayDelayMs = msg.delayMs;
    if (msg.state) buffer.push(msg.state, Date.now(), { latencyMs, relayDelayMs, extraMs: settings.extraMs });
    else if (!msg.live) buffer.clear();
  });
  // The worker was stopped or reloaded: a new port, and the same channel again.
  port.onDisconnect.addListener(() => {
    port = null;
  });
  if (watching) send({ t: 'watch', login: watching });
}

// The page-world probe's readings: how far behind live the player is.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== LATENCY_SAMPLE) return;
  // The page world can post anything here: only a sane, finite reading counts (0..5 min).
  const ms = e.data.latencyMs;
  latencyMs = typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= 300_000 ? ms : null;
  probeLive = typeof e.data.live === 'boolean' ? e.data.live : null;
});

let lastBeat = 0;
function tick() {
  const now = Date.now();
  if (!port) connect();
  // Watch only a live channel page, in a visible tab, when the viewer wants the panel.
  const want = settings.show && document.visibilityState === 'visible' && !channelOffline() && probeLive !== false
    ? liveChannelOf(location.pathname)
    : null;
  if (want !== watching) {
    watching = want;
    offlineAt = 0;
    offlineTries = 0;
    buffer.clear();
    send({ t: 'watch', login: watching });
  } else if (watching && offlineAt && now - offlineAt > OFFLINE_RETRY_MS[Math.min(offlineTries, OFFLINE_RETRY_MS.length - 1)]) {
    offlineAt = 0;
    offlineTries++;
    send({ t: 'watch', login: watching });
  }
  if (now - lastBeat > BEAT_MS) {
    lastBeat = now;
    send({ t: 'beat' });
  }
  if (watching) window.postMessage({ type: LATENCY_START }, window.location.origin);
  draw(now);
}

function draw(now: number) {
  const state = watching && !offlineAt ? buffer.current(now) : null;
  const video = document.querySelector('video');
  shownState = state;
  if (!watching || offlineAt || !state || !video) {
    panel.detach();
    hover.detach();
    lastDrawn = undefined;
    return;
  }
  const container = playerContainer(video);
  if (!container) return;
  panel.attach(container);
  hover.attach(container);
  // The player container is what the mouse moves over (Twitch's overlays sit inside it).
  if (hoverOn !== container) {
    hoverOn?.removeEventListener('pointermove', onPointer, true);
    hoverOn?.removeEventListener('pointerleave', offPointer, true);
    hoverOn = container;
    container.addEventListener('pointermove', onPointer, true);
    container.addEventListener('pointerleave', offPointer, true);
  }
  if (state !== lastDrawn) {
    lastDrawn = state;
    panel.render(state, watching);
  }
}

setInterval(tick, TICK_MS);
document.addEventListener('visibilitychange', tick);
tick();
