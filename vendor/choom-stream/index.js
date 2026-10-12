// Generated from Choom.gg packages/core/src/stream/viewer.ts by `npm run ext:export`; its commit is in SOURCE. Do not edit.
// packages/core/src/stream/board.ts
var BOARD_SCALE = 1e4;
var FULL_FRAME = [0, 0, BOARD_SCALE, BOARD_SCALE];
var MAX_BOARD = 80;
function streamToBoard(px, py, frame) {
  const [fx, fy, fw, fh] = frame;
  if (fw <= 0 || fh <= 0) return null;
  const x = (px * BOARD_SCALE - fx) / fw * BOARD_SCALE;
  const y = (py * BOARD_SCALE - fy) / fh * BOARD_SCALE;
  if (x < 0 || y < 0 || x > BOARD_SCALE || y > BOARD_SCALE) return null;
  return [x, y];
}
function hitBoard(board, x, y) {
  let best = null;
  let bestZ = -1;
  for (const [key, [, bx, by, bw, bh, z]] of Object.entries(board))
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh && z > bestZ) {
      best = key;
      bestZ = z;
    }
  return best;
}
function containedVideoRect(box, videoWidth, videoHeight) {
  if (videoWidth <= 0 || videoHeight <= 0 || box.width <= 0 || box.height <= 0) return box;
  const scale = Math.min(box.width / videoWidth, box.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}
var isInt = (x, max) => Number.isInteger(x) && x >= 0 && x <= max;
function isFrameBox(x) {
  return Array.isArray(x) && x.length === 4 && x.every((n) => isInt(n, BOARD_SCALE)) && x[2] > 0 && x[3] > 0 && x[0] + x[2] <= BOARD_SCALE && x[1] + x[3] <= BOARD_SCALE;
}
function isBoardEntry(x) {
  return Array.isArray(x) && x.length === 6 && typeof x[0] === "string" && x[0].length > 0 && x[0].length <= 64 && isInt(x[1], BOARD_SCALE) && isInt(x[2], BOARD_SCALE) && isInt(x[3], BOARD_SCALE) && isInt(x[4], BOARD_SCALE) && isInt(x[5], 999);
}
var IMAGE_KEY = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.webp$/;
function isImageKey(x) {
  return typeof x === "string" && x.length <= 120 && IMAGE_KEY.test(x) && !x.includes("..");
}

// packages/core/src/stream/protocol.ts
var STREAM_PROTOCOL = 2;
var MAX_ROWS = 60;
var MAX_CARDS = 120;
var MAX_ID_LENGTH = 64;
var MAX_NAME_LENGTH = 60;
var MAP_SECTIONS = ["rows", "cards", "opp", "board"];
var WHOLE_SECTIONS = ["deck", "legends", "search", "last", "frame"];
var same = (p, q) => JSON.stringify(p) === JSON.stringify(q);
function diffStreamState(prev, next) {
  const set = {};
  const del = {};
  for (const section of MAP_SECTIONS) {
    const p = prev[section];
    const n = next[section];
    const changed = {};
    for (const [k, v] of Object.entries(n)) if (!(k in p) || !same(p[k], v)) changed[k] = v;
    const gone = Object.keys(p).filter((k) => !(k in n));
    if (Object.keys(changed).length) set[section] = changed;
    if (gone.length) del[section] = gone;
  }
  for (const section of WHOLE_SECTIONS) if (!same(prev[section], next[section])) set[section] = next[section];
  if (!Object.keys(set).length && !Object.keys(del).length) return null;
  return {
    ...Object.keys(set).length ? { set } : {},
    ...Object.keys(del).length ? { del } : {}
  };
}
function applyStreamDelta(state, delta) {
  const next = structuredClone(state);
  for (const section of MAP_SECTIONS) {
    const map = next[section];
    for (const k of delta.del?.[section] ?? []) delete map[k];
    const changed = delta.set?.[section];
    if (changed) for (const [k, v] of Object.entries(changed)) map[k] = structuredClone(v);
  }
  for (const section of WHOLE_SECTIONS)
    if (delta.set && section in delta.set) next[section] = structuredClone(delta.set[section]);
  for (const section of MAP_SECTIONS) {
    const map = next[section];
    next[section] = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
  }
  return next;
}
function canonicalStreamState(state) {
  return applyStreamDelta(state, {});
}
var isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
var isCount = (x) => Number.isInteger(x) && x >= 0 && x <= 999;
var isId = (x) => typeof x === "string" && x.length > 0 && x.length <= MAX_ID_LENGTH;
var isName = (x) => typeof x === "string" && x.length <= MAX_NAME_LENGTH;
var isEpoch = (x) => typeof x === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(x);
var isSeq = (x) => Number.isInteger(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER;
var validators = {
  deck: (x) => isObj(x) && isCount(x.total) && isCount(x.left) && isCount(x.inDeck) && isCount(x.unseen) && Object.keys(x).length === 4,
  rows: (x) => isMap(x, MAX_ROWS, validators.rowsValue),
  cards: (x) => isMap(x, MAX_CARDS, validators.cardsValue),
  opp: (x) => isMap(x, MAX_ROWS, validators.oppValue),
  legends: (x) => Array.isArray(x) && x.length <= 3 && x.every(isId),
  search: (x) => Array.isArray(x) && x.length <= MAX_ROWS && x.every(isId),
  last: (x) => x === null || isObj(x) && (x.id === null || isId(x.id)) && isName(x.name) && typeof x.you === "boolean" && Object.keys(x).length === 3,
  board: (x) => isMap(x, MAX_BOARD, validators.boardValue),
  frame: isFrameBox,
  rowsValue: (x) => Array.isArray(x) && x.length === 2 && isCount(x[0]) && isCount(x[1]),
  cardsValue: (x) => isObj(x) && isName(x.n) && (x.c === null || isCount(x.c)) && (x.k === null || typeof x.k === "string" && x.k.length <= 16) && (x.p === void 0 || isImageKey(x.p)) && Object.keys(x).length === (x.p === void 0 ? 3 : 4),
  boardValue: isBoardEntry,
  oppValue: isCount
};
function isMap(x, max, value) {
  if (!isObj(x)) return false;
  const entries = Object.entries(x);
  return entries.length <= max && entries.every(([k, v]) => isId(k) && value(v));
}
function isStreamState(x) {
  if (!isObj(x)) return false;
  const keys = Object.keys(validators).filter((k) => !k.endsWith("Value"));
  return Object.keys(x).length === keys.length && keys.every((k) => validators[k](x[k]));
}
function isDeltaBody(set, del) {
  if (set !== void 0) {
    if (!isObj(set)) return false;
    for (const [k, v] of Object.entries(set)) {
      if (MAP_SECTIONS.includes(k)) {
        if (!isMap(v, MAX_CARDS, validators[`${k}Value`])) return false;
      } else if (WHOLE_SECTIONS.includes(k)) {
        if (!validators[k](v)) return false;
      } else return false;
    }
  }
  if (del !== void 0) {
    if (!isObj(del)) return false;
    for (const [k, v] of Object.entries(del))
      if (!MAP_SECTIONS.includes(k) || !Array.isArray(v) || v.length > MAX_CARDS || !v.every(isId)) return false;
  }
  return true;
}
function parseStreamFrame(x) {
  if (!isObj(x) || x.v !== STREAM_PROTOCOL || !isEpoch(x.epoch) || !isSeq(x.seq)) return null;
  if (x.t === "snap") {
    if (Object.keys(x).length !== 5 || !isStreamState(x.state)) return null;
    return x;
  }
  if (x.t === "delta") {
    if (Object.keys(x).some((k) => !["t", "v", "epoch", "seq", "set", "del"].includes(k))) return null;
    if (!isDeltaBody(x.set, x.del)) return null;
    return x;
  }
  return null;
}
var TWITCH_LOGIN = /^[A-Za-z0-9_]{1,25}$/;
var MAX_STREAM_DELAY_MS = 12e4;
var VIEWER_PING = '{"t":"ping"}';
var VIEWER_PONG = '{"t":"pong"}';
var RELAY_ORIGIN = /^wss?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/;
var LIVE_CACHE_S = 30;
var RELAY_CLOSE = {
  badHello: 4400,
  auth: 4401,
  ended: 4404,
  idle: 4408,
  replaced: 4409,
  revoked: 4410,
  /** The credential ran out on an open socket: reconnect with a fresh one (choom.gg refuses an unlinked account). */
  expired: 4411,
  tooBig: 4413,
  capacity: 4420,
  tooFast: 4429,
  disabled: 4503
};
var PRODUCER_FINAL_CLOSES = [RELAY_CLOSE.badHello, RELAY_CLOSE.auth, RELAY_CLOSE.replaced, RELAY_CLOSE.revoked, RELAY_CLOSE.tooBig];
var VIEWER_ENDED_CLOSES = [RELAY_CLOSE.ended, RELAY_CLOSE.revoked];
function parseViewerMessage(x) {
  if (!isObj(x)) return null;
  if (x.t === "resync" && Object.keys(x).length === 1) return { t: "resync" };
  if (x.t === "ping" && Object.keys(x).length === 1) return { t: "ping" };
  if (x.t === "subscribe" && x.v === STREAM_PROTOCOL && typeof x.login === "string" && TWITCH_LOGIN.test(x.login))
    return { t: "subscribe", v: STREAM_PROTOCOL, login: x.login.toLowerCase() };
  return null;
}

// packages/core/src/decks/eddies.ts
function oddsAtLeastOne(total, successes, draws) {
  if (total <= 0 || draws <= 0) return 0;
  if (successes <= 0) return 0;
  if (successes >= total) return 1;
  const n = Math.min(draws, total);
  let pNone = 1;
  for (let i = 0; i < n; i++) {
    const remainingFailures = total - successes - i;
    if (remainingFailures <= 0) return 1;
    pNone *= remainingFailures / (total - i);
  }
  return 1 - pNone;
}
export {
  FULL_FRAME,
  LIVE_CACHE_S,
  MAX_STREAM_DELAY_MS,
  RELAY_CLOSE,
  RELAY_ORIGIN,
  STREAM_PROTOCOL,
  TWITCH_LOGIN,
  VIEWER_ENDED_CLOSES,
  VIEWER_PING,
  VIEWER_PONG,
  applyStreamDelta,
  canonicalStreamState,
  containedVideoRect,
  diffStreamState,
  hitBoard,
  isStreamState,
  oddsAtLeastOne,
  parseStreamFrame,
  parseViewerMessage,
  streamToBoard
};
