/**
 * Build-time settings, injected by build.mjs (esbuild `define`). The relay's
 * WebSocket origin: the Cloudflare relay in a release build (wss://relay.choom.gg
 * is its allowlisted backup), local relays on 127.0.0.1 in a `--dev` build.
 */
declare const __RELAY_URL__: string;
declare const __RELAYS__: string[];
declare const __BUILD_VERSION__: string;
declare const __ART_URL__: string;
declare const __THUMBS_URL__: string;

/** The relay this build asks first (the Cloudflare one in a release build). */
export const RELAY_URL: string = __RELAY_URL__;
/**
 * Every relay this build may use: a /live answer's `relay` hint is followed
 * only to one of these (a host switch without a store release, never a host
 * the stream chose).
 */
export const RELAYS: readonly string[] = __RELAYS__;
export const httpOf = (wsOrigin: string) => wsOrigin.replace(/^ws/, 'http');
/** The primary relay's http(s) origin, for GET /live. */
export const RELAY_HTTP: string = httpOf(RELAY_URL);
export const BUILD_VERSION: string = __BUILD_VERSION__;
/** Card art for hovers: the card-art Worker on R2 (a storage key goes on the end). A fixed origin, never the stream's. */
export const ART_URL: string = __ART_URL__;
/** The fallback if the art Worker fails: choom.gg's thumbnails on Supabase Storage. */
export const THUMBS_URL: string = __THUMBS_URL__;
/** choom.gg itself, for bundled card art that has no thumbnail. */
export const SITE_URL = 'https://choom.gg';
