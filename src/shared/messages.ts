import type { StreamState } from '@choom/stream';

/** The port a twitch.tv tab holds open to the background worker. */
export const VIEWER_PORT = 'choom-viewer';

/** Content script → background. */
export type ToBackground =
  /** Watch this channel (or nothing): sent on every navigation. */
  | { t: 'watch'; login: string | null }
  /** Every ~20 s: keeps the worker's idle timer from running out (port messages are extension events). */
  | { t: 'beat' };

/** Background → content script. */
export type ToContent =
  /** The channel is not sharing: nothing to show; the content script asks again later. */
  | { t: 'offline'; login: string }
  /** The relay's current state for the channel, and its delay. `state` null: sharing, nothing yet. */
  | { t: 'state'; login: string; state: StreamState | null; delayMs: number; live: boolean };

/** Viewer settings (chrome.storage.local), set in the popup. */
export interface ViewerSettings {
  show: boolean;
  /** Point at a card on the stream to see it large. */
  hover: boolean;
  extraMs: number;
  /** The panel starts folded to its header. */
  collapsed: boolean;
}
export const DEFAULT_SETTINGS: ViewerSettings = { show: true, hover: true, extraMs: 0, collapsed: false };
export const SETTINGS_KEY = 'choom.viewer.settings';

export function readSettings(raw: unknown): ViewerSettings {
  const x = (raw && typeof raw === 'object' ? raw : {}) as Partial<ViewerSettings>;
  return {
    show: typeof x.show === 'boolean' ? x.show : DEFAULT_SETTINGS.show,
    hover: typeof x.hover === 'boolean' ? x.hover : DEFAULT_SETTINGS.hover,
    extraMs: Number.isInteger(x.extraMs) && x.extraMs! >= 0 && x.extraMs! <= 60_000 ? x.extraMs! : 0,
    collapsed: x.collapsed === true,
  };
}
