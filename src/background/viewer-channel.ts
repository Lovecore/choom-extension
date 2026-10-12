import {
  MAX_STREAM_DELAY_MS,
  STREAM_PROTOCOL,
  VIEWER_ENDED_CLOSES,
  VIEWER_PING,
  applyStreamDelta,
  parseStreamFrame,
  type StreamState,
} from '@choom/stream';

/**
 * One Twitch channel's socket to the relay's `/ws/viewer`, shared by every
 * tab watching it. It folds the snapshot and deltas the relay sends (already
 * held for the streamer's delay), asks for a resync on any gap, pings every
 * 20 s (Chrome keeps the service worker alive on WebSocket messages), and
 * reconnects with a back-off.
 *
 * Uses only the standard WebSocket API, so it runs unchanged in Node (22+)
 * for the tests.
 */
export interface ChannelUpdate {
  state: StreamState | null;
  delayMs: number;
  /** The streamer is sharing (or the relay still has frames of theirs to show). */
  live: boolean;
  /** The relay ended the channel (the streamer stopped, or it was never live): stop watching. */
  ended: boolean;
}

export const PING_MS = 20_000;
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** Close codes after which a reconnect is pointless (the shared VIEWER_ENDED_CLOSES). */
const ENDED = new Set(VIEWER_ENDED_CLOSES);

export class ViewerChannel {
  private ws: WebSocket | null = null;
  private state: StreamState | null = null;
  private epoch = '';
  private seq = -1;
  private delayMs = 0;
  private live = true;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closed = false;

  constructor(
    readonly login: string,
    private readonly relayUrl: string,
    private readonly onUpdate: (u: ChannelUpdate) => void,
    private readonly pingMs = PING_MS,
  ) {}

  open() {
    this.closed = false;
    // The login rides the URL too: a Cloudflare relay picks the channel's object before any message.
    const ws = new WebSocket(`${this.relayUrl.replace(/\/$/, '')}/ws/viewer?login=${encodeURIComponent(this.login)}`);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'subscribe', v: STREAM_PROTOCOL, login: this.login }));
      // The EXACT ping text: a Cloudflare relay answers it without waking the channel's object.
      this.ping = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(VIEWER_PING);
      }, this.pingMs);
    };
    ws.onmessage = (e) => this.handle(String(e.data));
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.stopPing();
      this.ws = null;
      if (this.closed) return;
      if (ENDED.has(e.code)) {
        this.state = null;
        this.onUpdate({ state: null, delayMs: this.delayMs, live: false, ended: true });
        return;
      }
      const wait = RETRY_MS[Math.min(this.attempt++, RETRY_MS.length - 1)];
      this.retry = setTimeout(() => this.open(), wait + Math.random() * wait * 0.5);
    };
    ws.onerror = () => {};
  }

  close() {
    this.closed = true;
    this.stopPing();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'unwatched');
  }

  /** The folded state now (a tab that joins later starts from it). */
  current(): ChannelUpdate {
    return { state: this.state, delayMs: this.delayMs, live: this.live, ended: false };
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private stopPing() {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
  }

  /** One message from the relay. Public for the tests. */
  handle(text: string) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    if (!raw || typeof raw !== 'object') return;
    const t = (raw as { t?: unknown }).t;
    if (t === 'status') {
      // Checked like any frame: a bad number would otherwise reach the timing maths.
      const { delayMs, live } = raw as { delayMs?: unknown; live?: unknown };
      if (typeof live !== 'boolean' || !Number.isInteger(delayMs) || (delayMs as number) < 0 || (delayMs as number) > MAX_STREAM_DELAY_MS) return;
      this.delayMs = delayMs as number;
      this.live = live;
      this.onUpdate(this.current());
      return;
    }
    if (t !== 'snap' && t !== 'delta') return; // rejected: the socket closes next, with the reason's code.
    // Every snapshot and delta goes through the shared validator: what reaches the panel and the
    // hover layer is a well-formed state within the caps, whatever the relay sent.
    const msg = parseStreamFrame(raw);
    if (!msg) {
      if (t === 'delta') this.send({ t: 'resync' });
      return;
    }
    if (msg.t === 'snap') {
      this.attempt = 0;
      this.state = msg.state;
      this.epoch = msg.epoch;
      this.seq = msg.seq;
    } else if (msg.t === 'delta') {
      // A delta must follow the last frame of the same epoch; anything else is a gap.
      if (!this.state || msg.epoch !== this.epoch || msg.seq !== this.seq + 1) {
        this.send({ t: 'resync' });
        return;
      }
      this.state = applyStreamDelta(this.state, msg);
      this.seq = msg.seq;
    }
    this.onUpdate(this.current());
  }
}
