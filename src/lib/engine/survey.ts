import { type Rng } from './rng';

/**
 * Survey mode: pieces are the real survey units (townships, half or quarter townships)
 * from the Public Land Survey System, so every piece has its own irregular shape.
 * Board coordinates are 0-1000 like the jigsaw.
 */
export const BOARD = 1000;

export interface SurveyPieceData {
  /** SVG path at the piece's home position, board units. */
  path: string;
  /** Home bounding box [x0, y0, x1, y1]. */
  bbox: [number, number, number, number];
  /** A point guaranteed inside the piece, used for snapping. */
  point: [number, number];
}

export interface SurveyPiece extends SurveyPieceData {
  id: number;
  /** Offset of the piece's top-left from home (as drawn). */
  dx: number;
  dy: number;
  /** Waiting in the tray at the tray's smaller scale. */
  small: boolean;
  /** In its own place. Not locked: it can be picked up again until solved. */
  placed: boolean;
  /** Blank pieces start in place and stay fixed. */
  locked: boolean;
}

export interface SurveyState {
  pieces: SurveyPiece[];
  order: number[];
  moves: number;
  trayScale: number;
  /** Each piece's own spot (center) in the tray, from packing. */
  spots: Record<number, { x: number; y: number }>;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface From { dx: number; dy: number; small: boolean }

const size = (p: SurveyPieceData) => ({ w: p.bbox[2] - p.bbox[0], h: p.bbox[3] - p.bbox[1] });

/** Center of a piece as drawn. */
export function visualCenter(s: SurveyState, p: SurveyPiece) {
  const k = p.small ? s.trayScale : 1, { w, h } = size(p);
  return { x: p.bbox[0] + p.dx + (k * w) / 2, y: p.bbox[1] + p.dy + (k * h) / 2 };
}

function offsetForCenter(s: SurveyState, p: SurveyPiece, c: { x: number; y: number }, small: boolean) {
  const k = small ? s.trayScale : 1, { w, h } = size(p);
  return { dx: c.x - p.bbox[0] - (k * w) / 2, dy: c.y - p.bbox[1] - (k * h) / 2 };
}

/**
 * Pack pieces into the tray in rows ("shelves") at one shared scale, as large as will
 * fit, so pieces keep their relative sizes.
 */
export function packTray(pieces: SurveyPieceData[], ids: number[], tray: Rect, gap = 18) {
  const order = [...ids].sort((a, b) => size(pieces[b]).h - size(pieces[a]).h);
  const attempt = (k: number) => {
    const spots: Record<number, { x: number; y: number }> = {};
    const rows: { ids: number[]; w: number; h: number }[] = [];
    let row = { ids: [] as number[], w: 0, h: 0 };
    for (const id of order) {
      const { w, h } = size(pieces[id]);
      const pw = w * k, ph = h * k;
      if (row.ids.length && row.w + gap + pw > tray.w - gap * 2) {
        rows.push(row);
        row = { ids: [], w: 0, h: 0 };
      }
      row.w += (row.ids.length ? gap : 0) + pw;
      row.h = Math.max(row.h, ph);
      row.ids.push(id);
    }
    if (row.ids.length) rows.push(row);
    const totalH = rows.reduce((t, r) => t + r.h, 0) + gap * (rows.length + 1);
    if (totalH > tray.h || rows.some((r) => r.w > tray.w - gap * 2)) return null;
    let y = tray.y + (tray.h - totalH) / 2 + gap;
    for (const r of rows) {
      let x = tray.x + (tray.w - r.w) / 2;
      for (const id of r.ids) {
        const { w } = size(pieces[id]);
        spots[id] = { x: x + (w * k) / 2, y: y + r.h / 2 };
        x += w * k + gap;
      }
      y += r.h + gap;
    }
    return spots;
  };
  let lo = 0.02, hi = 1, best = attempt(lo) ?? {};
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const got = attempt(mid);
    if (got) { lo = mid; best = got; } else hi = mid;
  }
  return { scale: lo, spots: best };
}

/** Lay loose pieces out in the tray, each in its own packed spot. */
export function arrangeTray(s: SurveyState, tray: Rect): SurveyState {
  const ids = s.pieces.filter((p) => !p.locked).map((p) => p.id);
  const { scale, spots } = packTray(s.pieces, ids, tray);
  const next: SurveyState = { ...s, trayScale: scale, spots };
  next.pieces = s.pieces.map((p) =>
    p.locked || p.placed ? p : { ...p, ...offsetForCenter(next, p, spots[p.id], true), small: true, placed: false });
  return next;
}

export function create(data: SurveyPieceData[], lockedIds: ReadonlySet<number>, tray: Rect, rng: Rng): SurveyState {
  const pieces: SurveyPiece[] = data.map((d, id) => ({
    ...d, id, dx: 0, dy: 0, small: !lockedIds.has(id), placed: lockedIds.has(id), locked: lockedIds.has(id),
  }));
  // Shuffle the draw order (the tray packing itself is by size).
  const order = pieces.map((p) => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return arrangeTray({ pieces, order, moves: 0, trayScale: 1, spots: {} }, tray);
}

export function raise(s: SurveyState, id: number): SurveyState {
  return { ...s, order: [...s.order.filter((i) => i !== id), id] };
}

export function setOffset(s: SurveyState, id: number, dx: number, dy: number): SurveyState {
  return { ...s, pieces: s.pieces.map((p) => (p.id === id ? { ...p, dx, dy } : p)) };
}

/** Grow a tray piece to full size around its center (when picked up). */
export function toFull(s: SurveyState, id: number): SurveyState {
  const p = s.pieces[id];
  if (!p.small) return s;
  const o = offsetForCenter(s, p, visualCenter(s, p), false);
  return { ...s, pieces: s.pieces.map((q) => (q.id === id ? { ...q, ...o, small: false } : q)) };
}

/** A piece's own spot in the tray. */
export function traySpot(s: SurveyState, id: number, tray: Rect) {
  return s.spots[id] ?? { x: tray.x + tray.w / 2, y: tray.y + tray.h / 2 };
}

/** How close (board units) a piece's anchor must land to its home to click in. */
export function snapDistance(p: SurveyPieceData) {
  const { w, h } = size(p);
  return Math.max(28, Math.min(w, h) * 0.3);
}

export type DropResult = 'placed' | 'wrong' | 'loose' | 'toTray';

/**
 * Drop a piece (full size or tray size).
 *  - Near its own place on the board: it clicks in.
 *  - Elsewhere on the board: it goes back to the tray (each piece has exactly one place).
 *  - In the tray: it stays where it was let go (kept inside the tray).
 *  - Anywhere else: back to the tray.
 */
export function drop(
  s: SurveyState, id: number, from: From, tray: Rect,
  pointer?: { x: number; y: number },
  /** Which piece's place the pointer is over (the highlighted outline), if any. */
  targetSlot?: number | null,
): { state: SurveyState; result: DropResult } {
  const p = s.pieces[id];
  const moves = s.moves + 1;
  const k0 = p.small ? s.trayScale : 1;
  const anchor = { x: p.bbox[0] + p.dx + k0 * (p.point[0] - p.bbox[0]), y: p.bbox[1] + p.dy + k0 * (p.point[1] - p.bbox[1]) };
  const c = visualCenter(s, p);
  const set = (q: Partial<SurveyPiece>) => s.pieces.map((x) => (x.id === id ? { ...x, ...q } : x));

  // Clicks in when dropped over its own outlined place, or simply close to home.
  if (targetSlot === id || (!p.small && Math.hypot(p.dx, p.dy) <= snapDistance(p) && anchor.x >= 0 && anchor.x <= BOARD && anchor.y >= 0 && anchor.y <= BOARD)) {
    return { state: { ...s, pieces: set({ dx: 0, dy: 0, small: false, placed: true }), moves }, result: 'placed' };
  }
  // Where it was let go: the pointer if there is one (what the player sees), else the
  // piece's anchor point (keyboard). A big piece hanging over an edge still counts.
  const at = pointer ?? anchor;
  const onBoard = at.x >= 0 && at.x <= BOARD && at.y >= 0 && at.y <= BOARD;
  const inTray = at.x >= tray.x && at.x <= tray.x + tray.w && at.y >= tray.y && at.y <= tray.y + tray.h;
  if (inTray && !onBoard) {
    const k = s.trayScale, { w, h } = size(p);
    const center = {
      x: Math.min(Math.max(c.x, tray.x + (k * w) / 2), tray.x + tray.w - (k * w) / 2),
      y: Math.min(Math.max(c.y, tray.y + (k * h) / 2), tray.y + tray.h - (k * h) / 2),
    };
    return { state: { ...s, pieces: set({ ...offsetForCenter(s, p, center, true), small: true, placed: false }), moves }, result: 'loose' };
  }
  const back = from.small ? from : offsetForCenter(s, p, traySpot(s, id, tray), true);
  return {
    state: { ...s, pieces: set({ dx: back.dx, dy: back.dy, small: true, placed: false }), moves },
    result: onBoard ? 'wrong' : 'toTray',
  };
}

export const isSolved = (s: SurveyState) => s.pieces.every((p) => p.placed);
export const placedCount = (s: SurveyState) => s.pieces.filter((p) => p.placed).length;
