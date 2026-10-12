import { containedVideoRect, hitBoard, streamToBoard } from '@choom/stream';
import type { StreamState } from '@choom/stream';
import { ART_URL, SITE_URL, THUMBS_URL } from '../shared/config';

/**
 * Card hovers (README, "Card hovers"): the viewer points at
 * a card on the stream and sees it large. The streamer's /play table sends
 * where every card sits on THEIR screen (`state.board`) and where their page
 * sits in the picture (`state.frame`); this maps the mouse from the video's
 * drawn picture onto that page and finds the topmost card under it.
 *
 * The art URL is built here from a FIXED origin and the stream's storage key
 * (validated by the shared protocol), so a stream can never point this page
 * at a host it chose.
 */
const CSS = `
:host { all: initial; }
.card { position: absolute; z-index: 1001; width: 250px; pointer-events: none; display: none;
  filter: drop-shadow(0 10px 28px rgba(0,0,0,.65)); }
.card.on { display: block; }
.card img { display: block; width: 100%; aspect-ratio: 5 / 7; object-fit: cover; border-radius: 10px; background: #0a0a0a; }
.card .name { margin-top: 6px; padding: 3px 8px; background: rgba(5,8,11,.9); border-left: 2px solid #f7e100;
  color: #fff; font: 600 12px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; width: fit-content; max-width: 100%; }
.outline { position: absolute; z-index: 1000; pointer-events: none; display: none; border: 2px solid #f7e100;
  box-shadow: 0 0 12px rgba(247,225,0,.6); border-radius: 4px; }
.outline.on { display: block; }
`;
const GAP = 18;

export class CardHover {
  private host: HTMLDivElement;
  private card: HTMLDivElement;
  private img: HTMLImageElement;
  private name: HTMLDivElement;
  private outline: HTMLDivElement;
  private shown: string | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-choom-hover', '');
    const root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.outline = document.createElement('div');
    this.outline.className = 'outline';
    this.card = document.createElement('div');
    this.card.className = 'card';
    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.decoding = 'async';
    this.img.referrerPolicy = 'no-referrer';
    // The art Worker (R2) first; if it fails, Supabase's thumbnail; for bundled art, the site's own file.
    this.img.addEventListener('error', () => {
      const key = this.img.dataset.key;
      if (!key) return;
      const step = Number(this.img.dataset.fallback ?? 0);
      if (step === 0) {
        this.img.dataset.fallback = '1';
        this.img.src = `${THUMBS_URL}${key}`;
      } else if (step === 1 && key.startsWith('cards/')) {
        this.img.dataset.fallback = '2';
        this.img.src = `${SITE_URL}/${key}`;
      }
    });
    this.name = document.createElement('div');
    this.name.className = 'name';
    this.card.append(this.img, this.name);
    root.append(style, this.outline, this.card);
  }

  attach(container: HTMLElement) {
    if (this.host.parentElement !== container) container.appendChild(this.host);
  }

  detach() {
    this.hide();
    this.host.remove();
  }

  hide() {
    this.card.classList.remove('on');
    this.outline.classList.remove('on');
    this.shown = null;
  }

  /**
   * The mouse at client (x, y) over `video`, inside `container`. `avoid`: a box
   * (the DECK panel) that covers the video, where nothing is hovered.
   */
  move(x: number, y: number, video: HTMLVideoElement, container: HTMLElement, state: StreamState | null, avoid: DOMRect | null) {
    if (!state || (avoid && x >= avoid.left && x <= avoid.right && y >= avoid.top && y <= avoid.bottom)) return this.hide();
    const pic = containedVideoRect(video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
    const px = (x - pic.left) / pic.width;
    const py = (y - pic.top) / pic.height;
    if (px < 0 || py < 0 || px > 1 || py > 1) return this.hide();
    const point = streamToBoard(px, py, state.frame);
    const key = point && hitBoard(state.board, point[0], point[1]);
    const entry = key ? state.board[key] : undefined;
    if (!entry) return this.hide();
    const [faceId, bx, by, bw, bh] = entry;
    const box = container.getBoundingClientRect();
    // The card's own outline on the video: the picture point of its corners.
    const toClient = (u: number, v: number) => {
      const [fx, fy, fw, fh] = state.frame;
      return [pic.left + ((fx + (u / 10_000) * fw) / 10_000) * pic.width, pic.top + ((fy + (v / 10_000) * fh) / 10_000) * pic.height];
    };
    const [l, t] = toClient(bx, by);
    const [r, b] = toClient(bx + bw, by + bh);
    Object.assign(this.outline.style, { left: `${l - box.left}px`, top: `${t - box.top}px`, width: `${r - l}px`, height: `${b - t}px` });
    this.outline.classList.add('on');
    const card = state.cards[faceId];
    if (this.shown !== faceId) {
      this.shown = faceId;
      this.name.textContent = card?.n ?? faceId;
      delete this.img.dataset.fallback;
      if (card?.p) {
        this.img.dataset.key = card.p;
        this.img.src = `${ART_URL}${card.p}`;
      } else this.img.removeAttribute('src');
    }
    // Beside the mouse, flipped to stay inside the player.
    const w = 250;
    const h = (w * 7) / 5 + 30;
    let left = x - box.left + GAP;
    if (left + w > box.width) left = x - box.left - GAP - w;
    const top = Math.max(8, Math.min(box.height - h - 8, y - box.top - h / 2));
    Object.assign(this.card.style, { left: `${Math.max(8, left)}px`, top: `${top}px` });
    this.card.classList.add('on');
  }
}
