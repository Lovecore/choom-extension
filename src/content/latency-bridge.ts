/**
 * Runs in the twitch.tv page itself (manifest `world: MAIN`) to read how far
 * behind live Twitch's player is, which the isolated content script cannot
 * see. Ported from RiftSight 0.12.0's twitch-latency-bridge (the RiftSight
 * devs allowed reuse of their code): it finds the player through React's
 * fiber on the main <video> and posts `getLiveLatency()` every 500 ms while
 * the content script keeps asking (a 10 s keepalive).
 */
import { LATENCY_KEEPALIVE_MS, LATENCY_SAMPLE, LATENCY_START } from '../shared/latency';

type Obj = Record<string, unknown>;
const MAX_FIBER_DEPTH = 120;
const SAMPLE_MS = 500;
const REDISCOVER_MIN_MS = 2_000;
const REDISCOVER_PERIOD_MS = 30_000;
const REDISCOVER_AFTER_NON_PLAYING = 6;
const MAX_DOM_ANCESTORS = 30;
const MIN_MAIN_VIDEO_AREA = 320 * 180;

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
function safeGet(target: unknown, key: string): unknown {
  if (!isObject(target) && typeof target !== 'function') return undefined;
  try {
    return (target as Obj)[key];
  } catch {
    return undefined;
  }
}
function reactFiberOf(node: unknown): unknown {
  if (!isObject(node)) return undefined;
  let keys: string[];
  try {
    keys = Object.keys(node);
  } catch {
    return undefined;
  }
  const key = keys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  return key ? safeGet(node, key) : undefined;
}
function unwrap(mpi: unknown): Obj | undefined {
  if (!isObject(mpi)) return undefined;
  const inner = safeGet(mpi, 'playerInstance');
  return isObject(inner) ? inner : mpi;
}
function findPlayer(fiber: unknown): Obj | undefined {
  let node = fiber;
  for (let depth = 0; isObject(node) && depth < MAX_FIBER_DEPTH; depth++) {
    const fromProps = unwrap(safeGet(safeGet(node, 'memoizedProps'), 'mediaPlayerInstance'));
    if (fromProps) return fromProps;
    const fromInstance = unwrap(safeGet(safeGet(safeGet(node, 'stateNode'), 'props'), 'mediaPlayerInstance'));
    if (fromInstance) return fromInstance;
    node = safeGet(node, 'return');
  }
  return undefined;
}
function call(player: Obj, name: string): { value: unknown } | undefined {
  for (const target of [player, safeGet(player, 'core')]) {
    const fn = safeGet(target, name);
    if (typeof fn !== 'function') continue;
    try {
      return { value: (fn as () => unknown).call(target) };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastStart = 0;
let found: { player: Obj; video: HTMLVideoElement } | null = null;
let lastDiscovery = 0;
let nonPlaying = 0;

function mainVideo(): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = MIN_MAIN_VIDEO_AREA - 1;
  for (const video of Array.from(document.querySelectorAll('video'))) {
    const r = video.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      best = video;
      bestArea = area;
    }
  }
  return best;
}
function discover(video: HTMLVideoElement) {
  lastDiscovery = Date.now();
  found = null;
  nonPlaying = 0;
  let el: HTMLElement | null = video;
  for (let i = 0; el && i < MAX_DOM_ANCESTORS; i++, el = el.parentElement) {
    const fiber = reactFiberOf(el);
    if (!fiber) continue;
    const player = findPlayer(fiber);
    if (player) {
      found = { player, video };
      return;
    }
  }
}
function read(video: HTMLVideoElement): { latencyMs: number | null; live: boolean | null } {
  const now = Date.now();
  const stale = !found || found.video !== video || !video.isConnected || now - lastDiscovery >= REDISCOVER_PERIOD_MS || nonPlaying >= REDISCOVER_AFTER_NON_PLAYING;
  if (stale && now - lastDiscovery >= REDISCOVER_MIN_MS) discover(video);
  if (!found || found.video !== video) return { latencyMs: null, live: null };
  const latency = call(found.player, 'getLiveLatency');
  if (!latency) {
    found = null;
    return { latencyMs: null, live: null };
  }
  const sec = typeof latency.value === 'number' && Number.isFinite(latency.value) ? latency.value : null;
  nonPlaying = call(found.player, 'getState')?.value === 'Playing' ? 0 : nonPlaying + 1;
  const duration = call(found.player, 'getDuration')?.value;
  // IVS: Infinity for a live stream, a finite length for a VOD, 0 before anything loaded.
  const live = duration === Infinity ? true : typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? false : null;
  return { latencyMs: sec === null ? null : Math.round(sec * 1000), live };
}
function sample() {
  try {
    if (Date.now() - lastStart > LATENCY_KEEPALIVE_MS) return stop();
    const video = mainVideo();
    let reading: { latencyMs: number | null; live: boolean | null } = { latencyMs: null, live: null };
    if (video) {
      try {
        reading = read(video);
      } catch {
        found = null;
      }
    }
    window.postMessage({ type: LATENCY_SAMPLE, path: location.pathname, ...reading }, window.location.origin);
  } catch {
    // Never break the page.
  }
}
function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
  found = null;
  nonPlaying = 0;
}

const GUARD = Symbol.for('choom.twitchLatencyBridge');
const w = window as unknown as Record<symbol, boolean>;
if (!w[GUARD]) {
  Object.defineProperty(window, GUARD, { value: true });
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== LATENCY_START) return;
    lastStart = Date.now();
    if (timer === null) timer = setInterval(sample, SAMPLE_MS);
  });
}
