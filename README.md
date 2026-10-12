# CHOOM.GG for Twitch

A browser extension for people watching Cyberpunk TCG streams. When a streamer plays on the
[Choom Table](https://choom.gg/play) and turns on **Share deck with viewers**, you see beside their
stream:

- what is left in their deck, and their odds of drawing each card;
- the cards of their opponent's that have been seen, and the opponent's Legends;
- the last card played;
- any card on their table, full size, when you point at it in the video.

It keeps to the video: the panel and the card hovers line up with what the stream shows, not with
the live game.

This repository is the extension's complete source. The package on the Chrome Web Store is built
from a tagged commit here, and you can check that yourself (see "Check a release").

## Install

- **Chrome Web Store:** coming soon. The listing's text, images and privacy answers are in
  [store/](store/listing.md), kept with the code.
- **From a release:** download the zip from [Releases](../../releases), unzip it, open
  `chrome://extensions`, turn on **Developer mode**, press **Load unpacked** and choose the folder.
  Edge works the same way at `edge://extensions`.

## What it does on your computer

- **It runs only on `https://www.twitch.tv/*`.** It draws its panel on a channel's page, and reads
  only: the channel name in the address, whether the stream is live, how far behind live Twitch's
  player is, and where the video sits on the page.
- **It stores only its own settings** (`chrome.storage.local`): whether the panel and the hovers
  are on, your extra delay, and whether the panel is collapsed.
- **No account, no sign-in, no analytics, no tracking, no ads.**

## Every network request it makes

| When | Request | What it sends |
|---|---|---|
| You open a Twitch channel's page | `GET https://choom-relay-production.choomgg.workers.dev/live/<channel>` | The channel name. The answer says whether that channel is sharing; it is cached for 30 seconds, and a channel that isn't sharing is asked again after 1, then 2, then 5 minutes |
| That channel is sharing | A WebSocket to `wss://choom-relay-production.choomgg.workers.dev/ws/viewer?login=<channel>` | The channel name, a "send me the latest" request when it misses an update, and a keepalive every 20 seconds |
| You point at a card | An image from `https://choom-card-art-production.choomgg.workers.dev/art/640/<card>`; if that fails, from choom.gg's public image storage, then from `https://choom.gg` | Nothing but the image's address; images load with no referrer |

`wss://relay.choom.gg` is a backup relay. The extension uses it only if the main relay names it
during a host switch; it never follows a relay address it wasn't built with.

The relay sees your IP address, which it uses to limit how many connections one address may open.
It writes no log of who watched. Details: [PRIVACY.md](PRIVACY.md).

## Permissions

| Permission | Why |
|---|---|
| `storage` | Your settings |
| `https://choom-relay-production.choomgg.workers.dev/*`, `https://relay.choom.gg/*` | The relay (main and backup) |
| Content scripts on `https://www.twitch.tv/*` | Drawing the panel and the hovers; reading the player's delay |

One content script runs in the page's own context (`world: MAIN`), because only there can it read
Twitch's player delay. It does nothing else, and it talks to the rest of the extension only through
the page's message channel.

## How it stays in step with the stream

The streamer's table sends the deck and the card positions to the relay, which passes them on at
once. Twitch's video runs a few seconds behind the live game, so the extension holds each update
until the video catches up: it shows an update `max(0, latency − stream delay) + extra delay` after
it arrives, where latency is what Twitch's player reports.

- **Stream delay** is the streamer's setting. A streamer who delays their stream on purpose (in
  OBS or Twitch, so an opponent can't watch it to see their hand) sets the same delay on the table,
  and their hand and deck count reach the relay no sooner than their video does. Cards the
  opponent can already see on the table are sent at once either way.
- **Extra delay** is yours, in the extension's menu, if the panel ever runs ahead of the video.

## Card hovers

The streamer's table sends where each card sits on their screen and where the game sits in their
stream picture (their "Line up with my stream" box). The extension maps your mouse from the video
to the streamer's screen, finds the card on top and shows its art. A face-down card is never sent.

## Build it yourself

You need Node.js 22 or newer.

```bash
npm ci
npm run check     # TypeScript
npm test          # the extension's tests (against a stand-in relay)
npm run build     # the release build, in build/
npm run package   # build/ as dist/choom-extension-<version>.zip
```

`npm run build:dev` builds against local relays on 127.0.0.1 instead.

### The wire format

`vendor/choom-stream/` is the stream's wire format: the message shapes, their validators and the
board maths. It is generated from choom.gg's source by `npm run ext:export` there, so the extension,
the table and the relay always speak the same format. Its `SOURCE` file names the choom.gg commit it
came from, with a SHA-256 of each file. Don't edit it by hand; a change comes from choom.gg.

## Check a release

Every release on GitHub is built by the workflow in `.github/workflows/release.yml` from its tag.
The zip and its SHA-256 are attached to the release.

```bash
git checkout v0.1.0
npm ci && npm run package
shasum -a 256 dist/choom-extension-0.1.0.zip   # matches the SHA-256 on the release
```

The build is reproducible: the same commit gives the same bytes. `npm run verify:reproducible` builds
twice and checks.

## Security

Please report security problems privately, not in a public issue: see [SECURITY.md](SECURITY.md).

## Licence and credits

The code is MIT licensed ([LICENSE](LICENSE)). The CHOOM.GG name, logo and icons are not covered by
it ([TRADEMARKS.md](TRADEMARKS.md)).

Parts of the Twitch integration are adapted from RiftSight, with the permission of its developers
([NOTICE](NOTICE)).

CHOOM.GG is a fan-made companion for the Cyberpunk TCG and is not affiliated with CD PROJEKT RED or
WeirdCo. Card names and art belong to their owners.
