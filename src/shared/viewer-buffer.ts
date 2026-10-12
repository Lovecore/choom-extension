import type { StreamState } from '@choom/stream';

/**
 * Lines the deck up with the video. The relay already held each frame for the
 * streamer's delay (`relayDelayMs`); the stream reaches this viewer
 * `latencyMs` after it happened (Twitch's player says how far behind live it
 * is). So a state is shown at `receivedAt + max(0, latency - relayDelay) +
 * extra`, never sooner. A viewer behind a long buffer sees it later; nobody
 * sees it before the relay's delay. Pure, so the tests read it.
 */
export interface Timing {
  latencyMs: number | null;
  relayDelayMs: number;
  /** The viewer's own nudge (popup), for a stream the probe reads wrong. */
  extraMs: number;
}

/** Twitch's low-latency player is usually 2 to 6 s behind; with no reading, assume this. */
export const FALLBACK_LATENCY_MS = 4_000;
/** The most a state is held, whatever the readings say. */
export const MAX_HOLD_MS = 60_000;

export function holdFor(t: Timing): number {
  const latency = t.latencyMs ?? FALLBACK_LATENCY_MS;
  return Math.min(MAX_HOLD_MS, Math.max(0, latency - t.relayDelayMs) + Math.max(0, t.extraMs));
}

export class ViewerBuffer {
  private queue: { showAt: number; state: StreamState }[] = [];
  private shown: StreamState | null = null;

  /** A state the relay sent at `receivedAt`. */
  push(state: StreamState, receivedAt: number, timing: Timing) {
    this.queue.push({ showAt: receivedAt + holdFor(timing), state });
  }

  /** The newest state due by `now` (dropping the older due ones), or the last shown. */
  current(now: number): StreamState | null {
    while (this.queue.length && this.queue[0].showAt <= now) this.shown = this.queue.shift()!.state;
    return this.shown;
  }

  /** When the next held state is due, or null. */
  nextAt(): number | null {
    return this.queue.length ? this.queue[0].showAt : null;
  }

  clear() {
    this.queue = [];
    this.shown = null;
  }
}
