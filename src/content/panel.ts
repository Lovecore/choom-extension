import { oddsAtLeastOne } from '@choom/stream';
import type { StreamCard, StreamState } from '@choom/stream';

/**
 * The streamer's deck, drawn over the Twitch player (shadow DOM, so neither
 * page styles nor ours leak). Mounted INSIDE the player container, so it stays
 * in fullscreen and theater mode. Names, costs and counts only: no art, no
 * extra requests.
 */
const HORIZON = 3;
const COLORS: Record<string, string> = { red: '#ff4444', blue: '#00b4ff', green: '#00cc66', yellow: '#ffc107' };

const CSS = `
:host { all: initial; }
.panel { position: absolute; top: 56px; right: 12px; z-index: 1000; width: 260px; max-height: calc(100% - 120px);
  display: flex; flex-direction: column; font: 500 12px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #e8f1f7; background: rgba(5, 8, 11, 0.9); border: 1px solid #2a3540; border-left: 2px solid #f7e100;
  box-shadow: 0 6px 24px rgba(0,0,0,.5); pointer-events: auto; }
.head { display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; user-select: none;
  border-bottom: 1px solid #1c252e; }
.head b { color: #f7e100; letter-spacing: .18em; font-size: 10px; }
.head .count { margin-left: auto; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }
.head .by { color: #7f93a3; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
.body { overflow-y: auto; padding: 4px 6px 6px; scrollbar-width: thin; }
.collapsed .body { display: none; }
h3 { margin: 6px 2px 3px; color: #7f93a3; font: 700 9px/1 system-ui, sans-serif; letter-spacing: .2em;
  display: flex; justify-content: space-between; }
h3 span:last-child { display: flex; gap: 6px; }
h3 abbr { width: 30px; text-align: right; text-decoration: none; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
li.row { display: grid; grid-template-columns: 16px minmax(0,1fr) auto 30px 30px; gap: 6px; align-items: baseline;
  padding: 2px 4px; border-left: 2px solid var(--dot, #7f93a3); background: rgba(7, 11, 15, .7);
  font-variant-numeric: tabular-nums; }
li.row.out { opacity: .38; }
.cost { color: #f7e100; font-weight: 700; text-align: center; }
.name { color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.left { font-weight: 700; }
.odds { color: #7f93a3; text-align: right; }
li.seen { display: flex; justify-content: space-between; gap: 8px; padding: 2px 4px; border-left: 2px solid #00f0ff; }
li.seen .name { font-weight: 600; }
.foot { margin: 6px 2px 0; color: #7f93a3; font-size: 10px; }
.foot b { color: #e8f1f7; font-weight: 600; }
.note { color: #7f93a3; font-size: 11px; padding: 6px 4px; }
`;

const pct = (p: number) => (p <= 0 ? '' : p >= 1 ? '100%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
const byCost = (cards: Record<string, StreamCard>) => (p: string, q: string) => {
  const a = cards[p];
  const b = cards[q];
  return (a?.c ?? 99) - (b?.c ?? 99) || (a?.n ?? p).localeCompare(b?.n ?? q);
};

export class DeckPanel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private frame: HTMLDivElement;
  private collapsed: boolean;

  constructor(private readonly onCollapse: (collapsed: boolean) => void, collapsed: boolean) {
    this.collapsed = collapsed;
    this.host = document.createElement('div');
    this.host.setAttribute('data-choom-deck', '');
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);
    this.frame = document.createElement('div');
    this.frame.className = 'panel';
    this.frame.setAttribute('role', 'complementary');
    this.frame.setAttribute('aria-label', "Streamer's deck (CHOOM.GG)");
    this.root.appendChild(this.frame);
    // Clicks on the panel must never reach the player (pause, fullscreen on double click).
    for (const type of ['click', 'dblclick', 'mousedown', 'pointerdown']) this.frame.addEventListener(type, (e) => e.stopPropagation());
  }

  setCollapsed(collapsed: boolean) {
    this.collapsed = collapsed;
  }

  /** Into the player container (moved there again if Twitch re-rendered it). */
  attach(container: HTMLElement) {
    if (this.host.parentElement !== container) container.appendChild(this.host);
  }

  detach() {
    this.host.remove();
  }

  /** The panel's box on screen, or null when it is not shown. */
  box(): DOMRect | null {
    return this.host.isConnected ? this.frame.getBoundingClientRect() : null;
  }

  render(state: StreamState | null, login: string) {
    const f = this.frame;
    f.classList.toggle('collapsed', this.collapsed);
    f.textContent = '';
    const head = document.createElement('div');
    head.className = 'head';
    head.title = this.collapsed ? 'Show the deck' : 'Hide the deck';
    head.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.onCollapse(this.collapsed);
      this.render(state, login);
    });
    head.append(text('b', 'DECK'), text('span', login, 'by'));
    if (state) head.append(text('span', `${state.deck.left}/${state.deck.total}`, 'count'));
    f.append(head);
    const body = document.createElement('div');
    body.className = 'body';
    f.append(body);
    if (!state) {
      body.append(text('div', 'Waiting for the next game…', 'note'));
      return;
    }
    const pool = state.deck.left;
    const name = (id: string) => state.cards[id]?.n ?? id;
    if (state.search.length) {
      body.append(heading('SEARCHING · TOP FIRST'));
      const ol = document.createElement('ul');
      state.search.forEach((id, i) => ol.append(text('li', `${i + 1}. ${name(id)}`, 'seen')));
      body.append(ol);
    }
    const h = heading('THEIR DECK');
    const odds = document.createElement('span');
    odds.append(abbr('NEXT', 'The next card drawn'), abbr(`IN ${HORIZON}`, `At least one in the next ${HORIZON} draws`));
    h.append(odds);
    body.append(h);
    const rows = document.createElement('ul');
    for (const id of Object.keys(state.rows).sort(byCost(state.cards))) {
      const [left, count] = state.rows[id];
      const card = state.cards[id];
      const li = document.createElement('li');
      li.className = left === 0 ? 'row out' : 'row';
      li.style.setProperty('--dot', COLORS[card?.k?.toLowerCase() ?? ''] ?? '#7f93a3');
      li.append(
        text('span', card?.c === null || card?.c === undefined ? '–' : String(card.c), 'cost'),
        text('span', name(id), 'name'),
        text('span', `${left}/${count}`, 'left'),
        text('span', left && pool ? pct(left / pool) : '', 'odds'),
        text('span', left && pool ? pct(oddsAtLeastOne(pool, left, HORIZON)) : '', 'odds'),
      );
      rows.append(li);
    }
    body.append(rows);
    const seen = [...state.legends.map((id) => [id, 0] as const), ...Object.entries(state.opp)];
    if (seen.length) {
      body.append(heading('OPPONENT · SEEN'));
      const ul = document.createElement('ul');
      for (const [id, n] of seen) {
        const li = document.createElement('li');
        li.className = 'seen';
        li.append(text('span', name(id), 'name'), text('span', n === 0 ? 'LEGEND' : n > 1 ? `x${n}` : ''));
        ul.append(li);
      }
      body.append(ul);
    }
    if (state.last) {
      const foot = document.createElement('p');
      foot.className = 'foot';
      foot.append('Last played ', text('b', state.last.name), state.last.you ? ' · streamer' : ' · opponent');
      body.append(foot);
    }
  }
}

function text(tag: string, value: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = value;
  if (className) el.className = className;
  return el;
}
function heading(label: string): HTMLElement {
  const h = document.createElement('h3');
  h.append(text('span', label));
  return h;
}
function abbr(label: string, title: string): HTMLElement {
  const a = text('abbr', label);
  a.title = title;
  return a;
}

/** The element that holds Twitch's player and its controls (ported from RiftSight 0.12.0). */
const CONTROLS = '[data-a-target="player-controls"], [data-a-target="player-overlay-click-handler"], .video-player__overlay';
export function playerContainer(video: HTMLVideoElement): HTMLElement | null {
  let node = video.parentElement;
  for (let depth = 0; node && depth < 10; depth++) {
    if (node.querySelector(CONTROLS)) return node;
    node = node.parentElement;
  }
  return (video.closest('[data-a-target="video-player"], .video-player') as HTMLElement | null) ?? video.parentElement;
}
/** Twitch's offline channel page. */
export const channelOffline = () => document.querySelector('.channel-root__player--offline, .channel-status-info--offline') !== null;
