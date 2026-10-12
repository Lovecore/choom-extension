// Generated from Choom.gg packages/core/src/stream/viewer.ts by `npm run ext:export`; its commit is in SOURCE. Do not edit.
export declare const FULL_FRAME: StreamFrameBox;
/** [x, y, w, h] in BOARD_SCALE units. */
export type StreamFrameBox = [
	number,
	number,
	number,
	number
];
/** One card on the streamer's screen: [faceId, x, y, w, h, z]; the highest z is on top. */
export type BoardEntry = [
	string,
	number,
	number,
	number,
	number,
	number
];
/**
 * A point on the stream picture (0..1 across and down) as a point on the
 * streamer's viewport (0..BOARD_SCALE), or null when it falls outside the
 * part of the picture the page fills.
 */
export declare function streamToBoard(px: number, py: number, frame: StreamFrameBox): [
	number,
	number
] | null;
/** The key of the topmost card under a viewport point, or null. */
export declare function hitBoard(board: Record<string, BoardEntry>, x: number, y: number): string | null;
/**
 * Where a <video> draws its picture inside its element (object-fit: contain
 * letterboxes it), in the element's client pixels. Twitch's player keeps the
 * video's aspect, but a theater or fullscreen window rarely matches it.
 */
export declare function containedVideoRect(box: {
	left: number;
	top: number;
	width: number;
	height: number;
}, videoWidth: number, videoHeight: number): {
	left: number;
	top: number;
	width: number;
	height: number;
};
export declare const STREAM_PROTOCOL = 2;
/** A card as viewers need it: a short name, its cost and colour, and for a hover its art. */
export interface StreamCard {
	n: string;
	c: number | null;
	k: string | null;
	/** Its art as a card-images STORAGE KEY (`cardThumbKey`), never a URL; only for cards on the board. */
	p?: string;
}
export interface StreamState {
	/** The pool: cards in the list, cards unaccounted for, in the deck, put into eddies unseen. */
	deck: {
		total: number;
		left: number;
		inDeck: number;
		unseen: number;
	};
	/** Per card id: [left, count]. */
	rows: Record<string, [
		number,
		number
	]>;
	/** Names for every id in `rows`, `opp`, `legends`, `search` and `last`. */
	cards: Record<string, StreamCard>;
	/** The rival's cards the streamer knows of (on the table now, or named as sold), per id. */
	opp: Record<string, number>;
	/** The rival's Legends the streamer has seen, by id. */
	legends: string[];
	/** The streamer's open Search, top first, by id. */
	search: string[];
	/** The newest play the log stands by; `you`: the streamer played it. */
	last: {
		id: string | null;
		name: string;
		you: boolean;
	} | null;
	/** Card hovers (stream/board.ts): every card the streamer can see, where it sits on their screen, by a short key. */
	board: Record<string, BoardEntry>;
	/** Where the streamer's page sits in their stream picture (their calibration); FULL_FRAME by default. */
	frame: StreamFrameBox;
}
declare const MAP_SECTIONS: readonly [
	"rows",
	"cards",
	"opp",
	"board"
];
declare const WHOLE_SECTIONS: readonly [
	"deck",
	"legends",
	"search",
	"last",
	"frame"
];
export type MapSection = (typeof MAP_SECTIONS)[number];
export type WholeSection = (typeof WHOLE_SECTIONS)[number];
export interface StreamSnapshot {
	t: "snap";
	v: typeof STREAM_PROTOCOL;
	epoch: string;
	seq: number;
	state: StreamState;
}
export interface StreamDelta {
	t: "delta";
	v: typeof STREAM_PROTOCOL;
	epoch: string;
	seq: number;
	/** Map sections: the keys set. Whole sections: the new value. */
	set?: {
		[K in MapSection]?: Partial<StreamState[K]>;
	} & {
		[K in WholeSection]?: StreamState[K];
	};
	/** Map sections: the keys removed. */
	del?: {
		[K in MapSection]?: string[];
	};
}
export type StreamFrame = StreamSnapshot | StreamDelta;
/**
 * What changed from `prev` to `next`, as a delta's `set` and `del`, or null
 * when nothing did (so nothing is sent).
 */
export declare function diffStreamState(prev: StreamState, next: StreamState): Pick<StreamDelta, "set" | "del"> | null;
/** `state` with a delta applied; never mutates its inputs. */
export declare function applyStreamDelta(state: StreamState, delta: Pick<StreamDelta, "set" | "del">): StreamState;
/** The same state with every map in id order: what a fold of deltas produces, so the two compare equal. */
export declare function canonicalStreamState(state: StreamState): StreamState;
export declare function isStreamState(x: unknown): x is StreamState;
/** A frame's shape, or null: a well-formed snapshot or delta, within the caps. */
export declare function parseStreamFrame(x: unknown): StreamFrame | null;
/** A Twitch login, as twitch.tv's URL carries it. */
export declare const TWITCH_LOGIN: RegExp;
/** The longest a streamer may hold frames back (snipe guard). */
export declare const MAX_STREAM_DELAY_MS = 120000;
/**
 * The keepalive, sent by viewers (~20 s) and producers (~30 s) as EXACTLY this
 * text. A Cloudflare relay answers it with VIEWER_PONG through
 * `setWebSocketAutoResponse`, which never wakes the object; the Node relay
 * answers it too. Chrome keeps an extension's service worker alive on
 * WebSocket MESSAGES (116+), not on protocol-level pings.
 */
export declare const VIEWER_PING = "{\"t\":\"ping\"}";
export declare const VIEWER_PONG = "{\"t\":\"pong\"}";
/** Viewer → relay. */
export type ViewerMessage = {
	t: "subscribe";
	v: typeof STREAM_PROTOCOL;
	login: string;
} | {
	t: "resync";
}
/**
 * A keepalive, about every 20 s. The relay ignores it; sending it is the point: Chrome
 * keeps an extension's service worker alive on WebSocket MESSAGES (116+), not on
 * protocol-level pings, and an idle board sends nothing for minutes.
 */
 | {
	t: "ping";
};
/**
 * GET /live/<login> (or /live?login=): whether a channel is sharing now, so an
 * idle viewer holds no socket. `relay`: an optional hint that the channel is
 * served by ANOTHER relay host (a host switch); the extension follows it only
 * to origins hard-coded in its build.
 */
export interface LiveAnswer {
	live: boolean;
	delayMs: number;
	relay?: string;
}
/** A relay origin as a /live hint may name it: wss://host[:port], no path. */
export declare const RELAY_ORIGIN: RegExp;
/** How long a /live answer may be cached (relay header, extension cache). */
export declare const LIVE_CACHE_S = 30;
/** Relay → viewer. */
export type RelayToViewer = StreamFrame | {
	t: "status";
	live: boolean;
	delayMs: number;
} | {
	t: "rejected";
	reason: "unknown-channel" | "at-capacity" | "invalid-channel";
} | {
	t: "pong";
};
/**
 * Close codes, in the 4000 range the WebSocket spec leaves to applications.
 * ONE table for both relays, the producer and the extension.
 */
export declare const RELAY_CLOSE: {
	readonly badHello: 4400;
	readonly auth: 4401;
	readonly ended: 4404;
	readonly idle: 4408;
	readonly replaced: 4409;
	readonly revoked: 4410;
	/** The credential ran out on an open socket: reconnect with a fresh one (choom.gg refuses an unlinked account). */
	readonly expired: 4411;
	readonly tooBig: 4413;
	readonly capacity: 4420;
	readonly tooFast: 4429;
	readonly disabled: 4503;
};
/** Viewer: codes after which the channel is over (stop watching until /live says otherwise). */
export declare const VIEWER_ENDED_CLOSES: readonly number[];
/** A viewer's message, or null. */
export declare function parseViewerMessage(x: unknown): ViewerMessage | null;
/**
 * P(at least one success in `draws` cards) drawn without replacement from a
 * deck of `total` cards holding `successes`.
 *
 * Computed as 1 - P(none) with a running product rather than binomials:
 * deck sizes here are 30-50 and draws is 6, so the product is exact and can
 * not overflow the way C(50, 6) style factorials do.
 */
export declare function oddsAtLeastOne(total: number, successes: number, draws: number): number;

export {};
