import { type Rng } from './rng';

/** Board is BOARD x BOARD units; pieces are positioned in the same units. */
export const BOARD = 1000;

export interface Piece {
  id: number;
  col: number;
  row: number;
  /** Outline in board units at the piece's solved position. */
  path: string;
  /** Current offset from the solved position (0,0 = in place). */
  dx: number;
  dy: number;
  /** Sitting in its own cell. Still movable: nothing locks until the puzzle is solved. */
  placed: boolean;
  /** Blank paper pieces start in place and stay fixed (they carry no picture). */
  locked: boolean;
  /** Waiting in the tray, drawn at the tray's smaller scale. */
  small: boolean;
}

export interface JigsawState {
  n: number;
  pieces: Piece[];
  /** Draw order (last = on top). */
  order: number[];
  moves: number;
  /** Scale of pieces waiting in the tray (so they fit in a tidy grid). */
  trayScale: number;
}

/** Where a drag started, so a piece can be sent back or swapped there. */
export interface From { dx: number; dy: number; small: boolean }

type Pt = [number, number];
type Seg = [Pt, Pt, Pt, Pt]; // cubic: start, c1, c2, end

/** Tab profile along an edge: (along, out) pairs as cubic segments, in units of edge length. */
function tabProfile(center: number, size: number): [number, number][][] {
  const span = size * 3.3; // width of the neck + bulb region along the edge
  const a = (t: number) => center + (t - 0.5) * span;
  const h = size; // bulb height, as a fraction of edge length
  return [
    [[0, 0], [a(0.35), 0]],
    [[a(0.35), 0], [a(0.4), 0], [a(0.3), h * 0.9], [a(0.5), h]],
    [[a(0.5), h], [a(0.7), h * 0.9], [a(0.6), 0], [a(0.65), 0]],
    [[a(0.65), 0], [1, 0]],
  ];
}

interface EdgeSpec {
  sign: number; // 0 = flat border; +1/-1 = tab bulges toward +x/+y or -x/-y
  center: number;
  size: number;
}

function edgeSegments(ax: number, ay: number, bx: number, by: number, e: EdgeSpec): Seg[] {
  const L = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  // Displacement axis: +y for horizontal edges, +x for vertical edges.
  const nx = uy === 0 ? 0 : 1, ny = uy === 0 ? 1 : 0;
  const map = ([t, o]: [number, number]): Pt => [ax + ux * t * L + nx * o * L * e.sign, ay + uy * t * L + ny * o * L * e.sign];
  if (e.sign === 0) return [[[ax, ay], [ax, ay], [bx, by], [bx, by]]];
  return tabProfile(e.center, e.size).map((seg) => {
    if (seg.length === 2) {
      const p0 = map(seg[0]), p1 = map(seg[1]);
      return [p0, p0, p1, p1];
    }
    return seg.map(map) as Seg;
  });
}

const reverse = (segs: Seg[]): Seg[] => segs.slice().reverse().map(([a, b, c, d]) => [d, c, b, a]);

const f = (v: number) => Math.round(v * 10) / 10;

function toPath(segs: Seg[]): string {
  let d = `M${f(segs[0][0][0])} ${f(segs[0][0][1])}`;
  for (const [, c1, c2, p] of segs) d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p[0])} ${f(p[1])}`;
  return d + 'Z';
}

/** Build all piece outlines for an n x n board. */
export function buildPaths(n: number, rng: Rng, tabs: boolean): string[] {
  const cell = BOARD / n;
  const spec = (border: boolean): EdgeSpec =>
    border || !tabs ? { sign: 0, center: 0.5, size: 0.2 } : { sign: rng() < 0.5 ? -1 : 1, center: 0.5 + (rng() - 0.5) * 0.1, size: 0.19 + rng() * 0.04 };
  // h[r][c]: horizontal edge above row r (r = 0..n); v[r][c]: vertical edge left of col c (c = 0..n).
  const h = Array.from({ length: n + 1 }, (_, r) => Array.from({ length: n }, () => spec(r === 0 || r === n)));
  const v = Array.from({ length: n }, () => Array.from({ length: n + 1 }, (_, c) => spec(c === 0 || c === n)));
  const paths: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x0 = c * cell, y0 = r * cell, x1 = x0 + cell, y1 = y0 + cell;
      const segs = [
        ...edgeSegments(x0, y0, x1, y0, h[r][c]), // top, left -> right
        ...edgeSegments(x1, y0, x1, y1, v[r][c + 1]), // right, top -> bottom
        ...reverse(edgeSegments(x0, y1, x1, y1, h[r + 1][c])), // bottom, right -> left
        ...reverse(edgeSegments(x0, y0, x0, y1, v[r][c])), // left, bottom -> top
      ];
      paths.push(toPath(segs));
    }
  }
  return paths;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Room each tray slot needs, in cells: the body plus a knob on each side. */
const SLOT = 1.5;

/** Grid that fits `count` pieces in `tray` with the biggest possible slots. */
export function trayGrid(n: number, count: number, tray: Rect) {
  let best = { cols: 1, rows: Math.max(count, 1), step: 0 };
  for (let cols = 1; cols <= Math.max(count, 1); cols++) {
    const rows = Math.ceil(count / cols);
    const step = Math.min(tray.w / cols, tray.h / rows);
    if (step > best.step) best = { cols, rows, step };
  }
  const scale = Math.min(1, best.step / ((BOARD / n) * SLOT));
  return { ...best, scale };
}

const home = (s: JigsawState, p: Piece) => {
  const cell = BOARD / s.n;
  return { x: p.col * cell, y: p.row * cell };
};

/** Center of a piece as drawn. */
export function visualCenter(s: JigsawState, p: Piece) {
  const cell = BOARD / s.n, h = home(s, p), k = p.small ? s.trayScale : 1;
  return { x: h.x + p.dx + (k * cell) / 2, y: h.y + p.dy + (k * cell) / 2 };
}

/** Offset that draws piece `p` (at scale small/full) centered on `c`. */
function offsetForCenter(s: JigsawState, p: Piece, c: { x: number; y: number }, small: boolean) {
  const cell = BOARD / s.n, h = home(s, p), k = small ? s.trayScale : 1;
  return { dx: c.x - h.x - (k * cell) / 2, dy: c.y - h.y - (k * cell) / 2 };
}

/** Grow a tray piece to full size around its center (when picked up). */
export function toFull(s: JigsawState, id: number): JigsawState {
  const p = s.pieces[id];
  if (!p.small) return s;
  const o = offsetForCenter(s, p, visualCenter(s, p), false);
  return { ...s, pieces: s.pieces.map((q) => (q.id === id ? { ...q, ...o, small: false } : q)) };
}

/**
 * Lay loose pieces out in a tidy grid in the tray (shrunk to fit), in `ids` order.
 * Pieces sitting in board cells and fixed blanks are left alone.
 */
export function arrangeTray(s: JigsawState, tray: Rect, ids?: number[]): JigsawState {
  const loose = (ids ?? s.pieces.map((p) => p.id)).filter((id) => {
    const p = s.pieces[id];
    return !p.locked && (p.small || slotOf(s, p) === null);
  });
  const g = trayGrid(s.n, s.n * s.n, tray); // size slots for a full tray so scale stays constant
  const next = { ...s, trayScale: g.scale };
  const stepX = tray.w / g.cols, stepY = tray.h / g.rows;
  const at = new Map(loose.map((id, i) => [id, { x: tray.x + ((i % g.cols) + 0.5) * stepX, y: tray.y + (Math.floor(i / g.cols) + 0.5) * stepY }]));
  next.pieces = s.pieces.map((p) => {
    const c = at.get(p.id);
    return c ? { ...p, ...offsetForCenter(next, p, c, true), small: true, placed: false } : p;
  });
  return next;
}

export function create(n: number, paths: string[], lockedIds: ReadonlySet<number>, tray: Rect, rng: Rng): JigsawState {
  const pieces: Piece[] = paths.map((path, id) => ({
    id, col: id % n, row: Math.floor(id / n), path, dx: 0, dy: 0,
    placed: lockedIds.has(id), locked: lockedIds.has(id), small: false,
  }));
  const order = pieces.map((p) => p.id);
  const ids = order.slice();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const s: JigsawState = { n, pieces, order, moves: 0, trayScale: 1 };
  // Mark every unlocked piece as loose before arranging.
  s.pieces = pieces.map((p) => (p.locked ? p : { ...p, small: true }));
  return arrangeTray(s, tray, ids);
}

/** Move a piece to the top of the draw order. */
export function raise(s: JigsawState, id: number): JigsawState {
  return { ...s, order: [...s.order.filter((i) => i !== id), id] };
}

export function setOffset(s: JigsawState, id: number, dx: number, dy: number): JigsawState {
  return { ...s, pieces: s.pieces.map((p) => (p.id === id ? { ...p, dx, dy } : p)) };
}

/** Board cell under a board-unit point, or null when the point is off the board. */
export function cellAt(n: number, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= BOARD || y >= BOARD) return null;
  const cell = BOARD / n;
  return Math.floor(y / cell) * n + Math.floor(x / cell);
}

/** Which board cell a piece currently sits in (null = loose in the tray). */
export function slotOf(s: JigsawState, p: Piece): number | null {
  if (p.small) return null;
  const cell = BOARD / s.n;
  const sx = p.col * cell + p.dx, sy = p.row * cell + p.dy;
  const c = Math.round(sx / cell), r = Math.round(sy / cell);
  const aligned = Math.abs(sx - c * cell) < 0.5 && Math.abs(sy - r * cell) < 0.5;
  return aligned && c >= 0 && r >= 0 && c < s.n && r < s.n ? r * s.n + c : null;
}

const offsetForSlot = (s: JigsawState, p: Piece, slot: number) => {
  const cell = BOARD / s.n;
  return { dx: (slot % s.n) * cell - p.col * cell, dy: Math.floor(slot / s.n) * cell - p.row * cell };
};

/** Center of the first tray grid spot with no piece in it (tray center if all are taken). */
export function freeTraySpot(s: JigsawState, id: number, tray: Rect) {
  const g = trayGrid(s.n, s.n * s.n, tray);
  const stepX = tray.w / g.cols, stepY = tray.h / g.rows;
  const others = s.pieces.filter((q) => q.id !== id && q.small).map((q) => visualCenter(s, q));
  for (let i = 0; i < g.cols * g.rows; i++) {
    const c = { x: tray.x + ((i % g.cols) + 0.5) * stepX, y: tray.y + (Math.floor(i / g.cols) + 0.5) * stepY };
    if (others.every((o) => Math.abs(o.x - c.x) > stepX / 2 || Math.abs(o.y - c.y) > stepY / 2)) return c;
  }
  return { x: tray.x + tray.w / 2, y: tray.y + tray.h / 2 };
}

export type DropResult = 'placed' | 'slotted' | 'swapped' | 'returned' | 'loose' | 'toTray';

/**
 * Drop a piece (full size or tray size) whose drag started at offset `from`.
 * Pieces "click" into board cells: dropped over the board, a piece snaps into the
 * cell under its center, whether or not it's the right one. Nothing locks: pieces
 * can be picked up again until the whole puzzle is solved. A piece already in that
 * cell swaps to where the dragged piece came from; a fixed blank sends it back.
 * Dropped off the board, it stays loose where it was let go.
 */
export function drop(s: JigsawState, id: number, from: From, tray: Rect): { state: JigsawState; result: DropResult } {
  const cell = BOARD / s.n;
  const p = s.pieces[id];
  const center = visualCenter(s, p);
  const target = cellAt(s.n, center.x, center.y);
  const moves = s.moves + 1;
  if (target === null) {
    // Off the board. Inside the tray it stays where it was let go (shrunk, kept fully
    // inside the tray); anywhere else it goes back to the tray: to the spot it came
    // from if it came from the tray, otherwise to a free tray spot.
    const c = center;
    const k = s.trayScale, half = (k * cell) / 2;
    const inTray = c.x >= tray.x && c.x <= tray.x + tray.w && c.y >= tray.y && c.y <= tray.y + tray.h;
    let spot: { x: number; y: number };
    if (inTray) {
      spot = {
        x: Math.min(Math.max(c.x, tray.x + half), tray.x + tray.w - half),
        y: Math.min(Math.max(c.y, tray.y + half), tray.y + tray.h - half),
      };
    } else if (from.small) {
      spot = visualCenter(s, { ...p, ...from });
    } else {
      spot = freeTraySpot(s, id, tray);
    }
    const o = offsetForCenter(s, p, spot, true);
    const pieces = s.pieces.map((q) => (q.id === id ? { ...q, ...o, small: true, placed: false } : q));
    return { state: { ...s, pieces, moves }, result: inTray ? 'loose' : 'toTray' };
  }

  const occupant = s.pieces.find((q) => q.id !== id && slotOf(s, q) === target);
  if (occupant?.locked) {
    // Back to where it came from (which may have been its own cell).
    const pieces = s.pieces.map((q) => (q.id === id ? { ...q, ...from, placed: !from.small && from.dx === 0 && from.dy === 0 } : q));
    return { state: { ...s, pieces, moves }, result: 'returned' };
  }

  let pieces = s.pieces.map((q) => {
    if (q.id === id) {
      const o = offsetForSlot(s, q, target);
      return { ...q, ...o, small: false, placed: target === q.id };
    }
    return q;
  });
  let result: DropResult = target === id ? 'placed' : 'slotted';
  if (occupant) {
    // Send the occupant to where the dragged piece started (its old cell, or the tray).
    const prev = { ...p, ...from };
    const prevSlot = slotOf(s, prev);
    const o = prevSlot === null
      ? offsetForCenter(s, occupant, visualCenter(s, prev), true)
      : offsetForSlot(s, occupant, prevSlot);
    const small = prevSlot === null;
    pieces = pieces.map((q) => (q.id === occupant.id ? { ...q, ...o, small, placed: prevSlot === q.id } : q));
    if (result !== 'placed') result = 'swapped';
  }
  // Fixed blank pieces sit at the bottom of the draw order.
  const lockedIds = pieces.filter((q) => q.locked).map((q) => q.id);
  const order = [...s.order.filter((i) => lockedIds.includes(i)), ...s.order.filter((i) => !lockedIds.includes(i))];
  return { state: { ...s, pieces, order, moves }, result };
}

export const isSolved = (s: JigsawState) => s.pieces.every((p) => p.placed);

export const placedCount = (s: JigsawState) => s.pieces.filter((p) => p.placed).length;
