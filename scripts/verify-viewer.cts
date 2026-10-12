/**
 * The viewer side, offline: which Twitch pages show a deck, the hold that
 * lines the deck up with the video, and the background's ViewerChannel
 * against a stand-in relay (scripts/fake-relay.cts) that speaks the real wire
 * format (Node's own WebSocket, so the class runs as it does in the service
 * worker). The real relays are held to a shared spec in Choom.gg.
 *
 *   npm test
 *
 * A .cts file: the submodule's TypeScript loads as CommonJS, which an ES
 * module cannot read named exports from.
 */
import assert from 'node:assert/strict';
import { canonicalStreamState, type StreamState } from '@choom/stream';
import { FakeRelay } from './fake-relay.cjs';
import { liveChannelOf } from '../src/shared/channel-page';
import { FALLBACK_LATENCY_MS, MAX_HOLD_MS, ViewerBuffer, holdFor } from '../src/shared/viewer-buffer';
import { readSettings } from '../src/shared/messages';
import { ViewerChannel, type ChannelUpdate } from '../src/background/viewer-channel';

let checks = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    checks++;
  } catch (e) {
    throw new Error(name, { cause: e });
  }
}
const state = (n: number): StreamState => ({
  deck: { total: 40, left: 40 - n, inDeck: 40 - n, unseen: 0 },
  rows: { 'WNC-001': [3 - Math.min(n, 3), 3], 'WNC-002': [2, 2] },
  cards: { 'WNC-001': { n: 'One', c: 1, k: 'Red' }, 'WNC-002': { n: 'Two', c: 2, k: 'Blue' } },
  opp: n ? { 'WNC-099': n } : {},
  legends: [],
  search: [],
  last: null,
  board: {},
  frame: [0, 0, 10_000, 10_000],
});
const until = async (pred: () => boolean, ms = 3000, what = 'condition') => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

async function main() {
  await check('only a channel live page shows a deck', () => {
    assert.equal(liveChannelOf('/someStreamer'), 'somestreamer');
    assert.equal(liveChannelOf('/some_streamer/'), 'some_streamer');
    for (const path of ['/', '/directory', '/videos/123', '/somestreamer/videos', '/somestreamer/clip/abc', '/settings', '/popout/x/chat', '/moderator/x', '/bad-login', '/x'.repeat(30)])
      assert.equal(liveChannelOf(path), null, path);
  });
  await check('the hold: latency minus the relay delay, plus the viewer nudge, bounded', () => {
    assert.equal(holdFor({ latencyMs: 5000, relayDelayMs: 15000, extraMs: 0 }), 0, 'the relay already held it longer than the stream lags');
    assert.equal(holdFor({ latencyMs: 20000, relayDelayMs: 15000, extraMs: 0 }), 5000);
    assert.equal(holdFor({ latencyMs: null, relayDelayMs: 0, extraMs: 0 }), FALLBACK_LATENCY_MS, 'no reading: a typical low latency');
    assert.equal(holdFor({ latencyMs: 2000, relayDelayMs: 0, extraMs: 3000 }), 5000);
    assert.equal(holdFor({ latencyMs: 999_999, relayDelayMs: 0, extraMs: 0 }), MAX_HOLD_MS);
    const b = new ViewerBuffer();
    b.push(state(1), 1000, { latencyMs: 3000, relayDelayMs: 0, extraMs: 0 });
    b.push(state(2), 1500, { latencyMs: 3000, relayDelayMs: 0, extraMs: 0 });
    assert.equal(b.current(3999), null, 'nothing before its time');
    assert.deepEqual(b.current(4000), state(1));
    assert.deepEqual(b.current(9000), state(2), 'the newest due state, older ones dropped');
    assert.equal(b.nextAt(), null);
  });
  await check('settings are read defensively', () => {
    assert.deepEqual(readSettings(null), { show: true, hover: true, extraMs: 0, collapsed: false });
    assert.deepEqual(readSettings({ show: false, hover: false, extraMs: 5000, collapsed: true }), { show: false, hover: false, extraMs: 5000, collapsed: true });
    assert.deepEqual(readSettings({ show: 'yes', extraMs: -1 }), { show: true, hover: true, extraMs: 0, collapsed: false });
  });

  await check('ViewerChannel against the relay: folds frames, resyncs a gap, pings, drops malformed input, ends with the channel', async () => {
    const relay = new FakeRelay(200);
    const url = await relay.listen();
    try {
      const epoch = 'epoch-viewer-1';
      relay.share('streamer', state(0), epoch);
      const updates: ChannelUpdate[] = [];
      const channel = new ViewerChannel('streamer', url, (u) => updates.push(u), 100);
      channel.open();
      await until(() => updates.some((u) => u.state), 3000, 'first state');
      for (let n = 1; n <= 3; n++) relay.update('streamer', state(n));
      await until(() => JSON.stringify(updates.at(-1)?.state) === JSON.stringify(canonicalStreamState(state(3))), 3000, 'folded to state 3');
      assert.equal(updates.at(-1)!.live, true);

      // A gap (a delta that does not follow): the channel asks for a resync and lands on the snapshot.
      const before = updates.length;
      channel.handle(JSON.stringify({ t: 'delta', v: 2, epoch, seq: 99, set: { deck: state(9).deck } }));
      assert.equal(updates.length, before, 'a gapped delta is never applied');
      await until(() => updates.length > before, 3000, 'resync snapshot');
      assert.deepEqual(updates.at(-1)!.state, canonicalStreamState(state(3)), 'back on the shown state');

      // Pings for longer than several keepalive periods: the socket stays open.
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(relay.viewerCount('streamer'), 1, 'still subscribed after pings');

      // Malformed input never reaches the panel: a bad snapshot is dropped, a bad delta asks for a
      // resync, and a status whose delay is not a sane whole number is ignored.
      const shown = updates.length;
      channel.handle(JSON.stringify({ t: 'snap', v: 2, epoch, seq: 4, state: { deck: 'nope' } }));
      channel.handle(JSON.stringify({ t: 'status', live: true, delayMs: 1e12 }));
      channel.handle(JSON.stringify({ t: 'status', live: 'yes', delayMs: 0 }));
      channel.handle('null');
      assert.equal(updates.length, shown, 'nothing malformed is shown');
      channel.handle(JSON.stringify({ t: 'delta', v: 2, epoch, seq: 4, set: { nope: 1 } }));
      await until(() => updates.length > shown, 3000, 'resync after a malformed delta');
      assert.deepEqual(updates.at(-1)!.state, canonicalStreamState(state(3)), 'still the shown state');

      // The streamer stops: the channel says so, then the relay ends it after the grace.
      relay.stop('streamer');
      await until(() => updates.some((u) => u.ended), 3000, 'channel ended');
      assert.equal(updates.at(-1)!.state, null);
      channel.close();
    } finally {
      await relay.close();
    }
  });
  await check('ViewerChannel reconnects after the relay restarts, and starts from a snapshot', async () => {
    let relay = new FakeRelay(5000);
    await relay.listen();
    const port = relay.port;
    const updates: ChannelUpdate[] = [];
    const channel = new ViewerChannel('restarts', relay.url, (u) => updates.push(u), 300);
    try {
      relay.share('restarts', state(1), 'epoch-first-1');
      channel.open();
      await until(() => updates.some((u) => u.state?.deck.left === 39), 3000, 'first state');
      await relay.close();
      relay = new FakeRelay(5000);
      await relay.listen(port);
      // The table reconnects with a new epoch; the viewer's retry finds it.
      relay.share('restarts', state(2), 'epoch-second-1');
      await until(() => updates.some((u) => u.state?.deck.left === 38), 8000, 'state after the restart');
    } finally {
      channel.close();
      await relay.close();
    }
  });
  console.log(`[verify-viewer] ${checks} checks passed`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
