# Chrome Web Store listing

Everything the Chrome Web Store dashboard asks for, kept with the code so the listing never says
more or less than the extension does. Change this in the same pull request as any change to what
the extension reads, sends or asks permission for.

## Store listing tab

**Name** (from the manifest): CHOOM.GG for Twitch

**Summary** (from the manifest, 122 of 132 characters):
See a streamer's Cyberpunk TCG deck as they play, and any card on their table when you point at it on their Twitch stream.

**Category:** Lifestyle › Entertainment

**Language:** English

**Description** (paste as is; the store shows plain text with line breaks):

```
Watching a Cyberpunk TCG stream? See the game the way the streamer does.

When a streamer plays on the Choom Table at choom.gg and turns on "Share deck with viewers", this extension shows a deck panel right on their Twitch stream:

• What's left in their deck, card by card, and their odds of drawing each one
• The cards of their opponent's that have been seen, and the opponent's Legends
• The last card played
• Card hovers: point at any card on their table in the video to see it full size

It stays in step with the video. The panel and the hovers wait for Twitch's player, so you never see a play before the stream shows it. If the panel ever runs ahead, add a little extra delay in the extension's menu.

Private by design:
• No account, no sign-in, no analytics, no tracking, no ads
• It runs only on twitch.tv, and only reads what it needs: the channel you're watching, whether it's live, how far behind live the player is, and where the video sits on the page
• It sends the name of the channel you're watching to the CHOOM.GG relay, to get that channel's deck. Nothing else, and nothing is kept
• Streamers choose to share, and it never shows a face-down card, their deck order or their opponent's hand

Open source: every line is public at github.com/Lovecore/choom-extension, with reproducible builds, so you can check that this package is exactly that code.

For streamers: connect your Twitch channel on your choom.gg profile, then tick "Share deck with viewers" in the table's Game menu. You don't need the extension yourself.

CHOOM.GG is a fan-made companion for the Cyberpunk TCG and is not affiliated with CD PROJEKT RED or WeirdCo. Card names and art belong to their owners.
```

**Graphic assets** (in this folder):

| Asset | Size | File |
|---|---|---|
| Store icon | 128x128 PNG (96x96 artwork, 16 px transparent padding) | `icon-128.png` |
| Small promo tile | 440x280 PNG | `small-promo-440x280.png` |
| Marquee promo tile (optional) | 1400x560 PNG | `marquee-1400x560.png` |
| Screenshots (at least 1, up to 5) | 1280x800 PNG | `screenshot-1-card-hover-1280x800.png`, `screenshot-2-deck-panel-1280x800.png` |

The promo tiles use no card art or card names (those belong to CD PROJEKT RED); the deck panel in
them is a drawing.

**How the two screenshots were made.** They are labelled "Example" in the picture, and nothing in
them is drawn by hand:
- The stream picture is a real Choom Table, the public table tour at choom.gg/play/tour.
- The deck state is that same game, rebuilt with the tour's own seed and starter decks, run through
  the real tracker (`buildTracker`, `toStreamState`). The card positions were measured on that
  screen.
- The real extension build drew the panel and the hover. It loaded the page through a local relay,
  in Chromium.
- The page around the video is a plain stand-in with the label, never an imitation of Twitch's
  interface.

Replace them with captures from a real stream when there is one.

**More screenshots worth capturing** on the owner's own stream (1280x800, or a larger capture
cropped to 16:10):
1. The deck panel beside a live Choom Table game.
2. A card hover: the pointer on a card in the video, its art shown full size.
3. The panel collapsed, with the stream unobstructed.
4. The extension's menu (Show streamers' decks, card hovers, Extra delay).

**Additional fields:**
- Official URL: none (choom.gg is not verified in Search Console for this item).
- Homepage URL: https://choom.gg
- Support URL: https://github.com/Lovecore/choom-extension/issues
- Mature content: No.

## Privacy practices tab

**Single purpose:**

```
Shows a streamer's shared Cyberpunk TCG deck (cards left, draw odds, cards seen, last card played) and full-size card hovers on their Twitch stream, in step with the video.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the viewer's own settings (panel and hovers on or off, extra delay, panel collapsed) on their device. |
| Host permission `https://choom-relay-production.choomgg.workers.dev/*` | The CHOOM.GG stream relay: asks whether the Twitch channel being watched is sharing its deck, and receives that deck while it is. |
| Host permission `https://relay.choom.gg/*` | The same relay's backup host, used only if the main relay names it during a host switch. |
| Content scripts on `https://www.twitch.tv/*` | Draws the deck panel and card hovers on a channel's page, and reads how far behind live Twitch's player is so the panel stays in step with the video. |

**Remote code:** No, I am not using remote code. (All code is in the package. The relay sends data,
validated before use; card images are images.)

**Data usage, what is collected:** tick **Web history** only, because the extension sends the name
of the Twitch channel being watched to the CHOOM.GG relay. Nothing else is collected: no personal or
account information, no communications, no location, no user activity, no website content.

**Certifications** (tick all three):
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/Lovecore/choom-extension/blob/main/PRIVACY.md

## Distribution tab

- **Visibility:** **Unlisted** while choom.gg's sharing is open to admins only (the stealth
  launch): only people with the link can install it. Switch to Public when `STREAM_ACCESS` opens.
- **Regions:** all.

## The package to upload

The zip from the GitHub Release of the version being submitted (`choom-extension-<version>.zip`),
never a local build: its SHA-256 is on the release page, and anyone can rebuild it from the tag.
