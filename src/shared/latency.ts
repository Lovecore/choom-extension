/** The latency probe's window messages (content/latency-bridge.ts ↔ content/twitch.ts). */
export const LATENCY_SAMPLE = 'choom-twitch-latency';
export const LATENCY_START = 'choom-twitch-latency-start';
/** The probe stops unless asked again within this. */
export const LATENCY_KEEPALIVE_MS = 10_000;
