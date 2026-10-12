# Privacy

The CHOOM.GG extension shows a streamer's Choom Table deck and card hovers on their Twitch stream.
This page lists everything it reads, stores and sends. The code that does it is in this repository.

## What it reads

Only on `https://www.twitch.tv/*`, and only:
- the channel name in the page's address;
- whether that channel's stream is live;
- how far behind live Twitch's video player is;
- where the video sits on the page, so card hovers line up with it.

It does not read your Twitch account, your chat, what you type, or any other site.

## What it stores

Only its own settings, in your browser (`chrome.storage.local`): whether the deck panel and the card
hovers are on, your extra delay, and whether the panel is collapsed. Removing the extension removes
them.

## What it sends, and to whom

To the CHOOM.GG stream relay (`choom-relay-production.choomgg.workers.dev`, or its backup
`relay.choom.gg`):
- the name of the Twitch channel you are watching, to ask whether it is sharing, and, while it is,
  to receive its deck;
- a keepalive every 20 seconds while connected.

To CHOOM.GG's image hosts, when you point at a card: a request for that card's image, with no
referrer.

That is all. There is no account, no sign-in, no analytics, no tracking, no ads, and no other
server.

## What the relay keeps

The relay passes the streamer's deck to viewers and keeps no record of who watched. It sees your IP
address, as any server you connect to does, and uses it only to limit how many connections one
address may open. The relay runs on Cloudflare, whose own network logs are covered by
[Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

## What streamers share

Nothing is shared until a streamer turns on "Share deck with viewers" at their table. What they
share is what their stream already shows: their hand, the cards on the table, their deck count and
draw odds, the cards of their opponent's that have been seen, and the last card played. Never a
face-down card, their deck order, or their opponent's hand.

## Questions

Open an issue in this repository, or for anything sensitive see [SECURITY.md](SECURITY.md).
