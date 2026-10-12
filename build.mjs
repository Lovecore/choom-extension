// Builds the CHOOM.GG extension from src/ into build/ (load it unpacked from there).
//   npm run build            release: the production relay
//   npm run build:dev        local relays (127.0.0.1)
//   node build.mjs --relay wss://other.host
// The stream wire format is vendor/choom-stream/, generated from Choom.gg (see its SOURCE),
// read through tsconfig `paths` as `@choom/stream`. The build is deterministic: the same
// commit gives the same files, byte for byte (npm run verify:reproducible).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const relayArg = args.includes('--relay') ? args[args.indexOf('--relay') + 1] : null;
// Release: the Cloudflare relay first, the droplet relay as the allowlisted backup a /live hint may name.
const RELEASE_RELAYS = ['wss://choom-relay-production.choomgg.workers.dev', 'wss://relay.choom.gg'];
const DEV_RELAYS = ['ws://127.0.0.1:8791', 'ws://127.0.0.1:8790'];
const relay = relayArg ?? (dev ? DEV_RELAYS[0] : RELEASE_RELAYS[0]);
const relays = [...new Set([relay, ...(dev ? DEV_RELAYS : RELEASE_RELAYS)])];
const artUrl = dev ? 'http://127.0.0.1:8792/art/640/' : 'https://choom-card-art-production.choomgg.workers.dev/art/640/';
if (!/^wss?:\/\/[^/]+$/.test(relay)) throw new Error(`--relay must be a ws(s):// origin, got ${relay}`);

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const out = 'build';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/icons`, { recursive: true });

await build({
  entryPoints: {
    background: 'src/background/index.ts',
    twitch: 'src/content/twitch.ts',
    'latency-bridge': 'src/content/latency-bridge.ts',
    popup: 'src/popup/popup.ts',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  tsconfig: 'tsconfig.json',
  define: {
    __RELAY_URL__: JSON.stringify(relay),
    __RELAYS__: JSON.stringify(relays),
    __ART_URL__: JSON.stringify(artUrl),
    __BUILD_VERSION__: JSON.stringify(version),
    // choom.gg's public Supabase Storage (the same origin the site's own pages load card art from).
    __THUMBS_URL__: JSON.stringify('https://crrvjqecljswavbzpmjx.supabase.co/storage/v1/object/public/card-images/thumb/640/'),
  },
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'warning',
});

copyFileSync('src/popup/popup.html', `${out}/popup.html`);
copyFileSync('src/popup/popup.css', `${out}/popup.css`);
for (const size of [16, 32, 48, 128]) copyFileSync(`assets/icons/icon${size}.png`, `${out}/icons/icon${size}.png`);

const httpRelays = relays.map((r) => r.replace(/^ws/, 'http'));
const icons = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
const manifest = {
  manifest_version: 3,
  name: dev ? 'CHOOM.GG for Twitch (dev)' : 'CHOOM.GG for Twitch',
  version,
  // The Chrome Web Store shows this as the listing's summary (132 characters at most).
  description: "See a streamer's Cyberpunk TCG deck as they play, and any card on their table when you point at it on their Twitch stream.",
  // WebSocket messages keep the service worker alive from Chrome 116 on.
  minimum_chrome_version: '116',
  icons,
  action: { default_popup: 'popup.html', default_title: 'CHOOM.GG', default_icon: icons },
  background: { service_worker: 'background.js' },
  permissions: ['storage'],
  host_permissions: httpRelays.map((r) => `${r}/*`),
  content_scripts: [
    { matches: ['https://www.twitch.tv/*'], js: ['twitch.js'], run_at: 'document_idle' },
    // The latency probe reads Twitch's player, so it runs in the page's own world.
    { matches: ['https://www.twitch.tv/*'], js: ['latency-bridge.js'], run_at: 'document_idle', world: 'MAIN' },
  ],
};
writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[build] ${out}/ v${version} relay ${relay}${dev ? ' (dev)' : ''}`);
