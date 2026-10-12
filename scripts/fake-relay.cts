/**
 * A small stand-in for the CHOOM.GG stream relay's VIEWER side, for the tests.
 * It speaks the same wire format (the vendored `@choom/stream`) and the same
 * rules a viewer sees from the real relays:
 *
 * - `/ws/viewer?login=<login>`, then `{ t: 'subscribe', v, login }`;
 * - a status, then the channel's snapshot; deltas as the streamer's table sends them;
 * - `{ t: 'resync' }` answered with the snapshot again;
 * - the exact keepalive text answered with the exact pong;
 * - a channel that stops sharing says `live: false`, then closes viewers with
 *   "channel ended" after a grace period; an unknown channel is closed at once.
 *
 * The real relays live in Choom.gg and are held to one shared spec there, which
 * also checks that every frame they send a viewer passes `parseStreamFrame`.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  RELAY_CLOSE,
  STREAM_PROTOCOL,
  VIEWER_PING,
  VIEWER_PONG,
  applyStreamDelta,
  diffStreamState,
  parseViewerMessage,
  type StreamState,
} from '@choom/stream';

interface Channel {
  state: StreamState;
  epoch: string;
  seq: number;
  live: boolean;
  viewers: Set<WebSocket>;
  ending: ReturnType<typeof setTimeout> | null;
}

export class FakeRelay {
  private server: Server;
  private wss: WebSocketServer;
  private channels = new Map<string, Channel>();
  url = '';

  constructor(private readonly graceMs = 200) {
    this.server = createServer((_req, res) => res.writeHead(404).end());
    this.wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://relay');
      if (url.pathname !== '/ws/viewer') return socket.destroy();
      this.wss.handleUpgrade(req, socket, head, (ws) => this.viewer(ws, url.searchParams.get('login') ?? ''));
    });
  }

  async listen(port = 0): Promise<string> {
    await new Promise<void>((r) => this.server.listen(port, '127.0.0.1', r));
    this.url = `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.url;
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    for (const c of this.channels.values()) if (c.ending) clearTimeout(c.ending);
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  /** The streamer's table (re)connects: a new epoch and its snapshot. */
  share(login: string, state: StreamState, epoch: string) {
    const prev = this.channels.get(login);
    if (prev?.ending) clearTimeout(prev.ending);
    const c: Channel = { state, epoch, seq: 0, live: true, viewers: prev?.viewers ?? new Set(), ending: null };
    this.channels.set(login, c);
    for (const v of c.viewers) {
      this.status(v, c);
      this.snapshot(v, c);
    }
  }

  /** The table changed: a delta to every viewer. */
  update(login: string, next: StreamState) {
    const c = this.channels.get(login);
    if (!c) throw new Error(`no channel ${login}`);
    const body = diffStreamState(c.state, next);
    if (!body) return;
    c.state = applyStreamDelta(c.state, body);
    c.seq++;
    const text = JSON.stringify({ t: 'delta', v: STREAM_PROTOCOL, epoch: c.epoch, seq: c.seq, ...body });
    for (const v of c.viewers) v.send(text);
  }

  /** The table stopped sharing: viewers hear so, and the channel ends after the grace. */
  stop(login: string) {
    const c = this.channels.get(login);
    if (!c) return;
    c.live = false;
    for (const v of c.viewers) this.status(v, c);
    c.ending = setTimeout(() => {
      for (const v of c.viewers) v.close(RELAY_CLOSE.ended, 'channel ended');
      this.channels.delete(login);
    }, this.graceMs);
  }

  viewerCount(login: string): number {
    return this.channels.get(login)?.viewers.size ?? 0;
  }

  private viewer(ws: WebSocket, urlLogin: string) {
    let channel: Channel | null = null;
    ws.on('message', (data) => {
      const text = data.toString();
      if (text === VIEWER_PING) return ws.send(VIEWER_PONG);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return ws.close(RELAY_CLOSE.badHello, 'bad message');
      }
      const msg = parseViewerMessage(raw);
      if (!msg) return ws.close(RELAY_CLOSE.badHello, 'bad message');
      if (msg.t === 'subscribe') {
        const login = msg.login.toLowerCase();
        const c = this.channels.get(login);
        if (login !== urlLogin.toLowerCase() || !c) {
          ws.send(JSON.stringify({ t: 'rejected', reason: 'unknown-channel' }));
          return ws.close(RELAY_CLOSE.ended, 'unknown channel');
        }
        channel = c;
        c.viewers.add(ws);
        this.status(ws, c);
        this.snapshot(ws, c);
      } else if (msg.t === 'resync' && channel) {
        this.snapshot(ws, channel);
      }
    });
    ws.on('close', () => channel?.viewers.delete(ws));
  }

  private status(ws: WebSocket, c: Channel) {
    ws.send(JSON.stringify({ t: 'status', live: c.live, delayMs: 0 }));
  }

  private snapshot(ws: WebSocket, c: Channel) {
    ws.send(JSON.stringify({ t: 'snap', v: STREAM_PROTOCOL, epoch: c.epoch, seq: c.seq, state: c.state }));
  }
}
