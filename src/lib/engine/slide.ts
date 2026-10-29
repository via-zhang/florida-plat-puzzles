import { type Rng, randInt } from './rng';

/**
 * Sliding tile puzzle. board[pos] = id of the tile at that position.
 * Tile ids equal their solved position. The tile whose id is `gapId` is the
 * missing one: wherever it sits on the board is the empty slot.
 */
export interface SlideState {
  n: number;
  board: number[];
  gapId: number;
  moves: number;
}

export function createSolved(n: number, gapId: number): SlideState {
  return { n, board: Array.from({ length: n * n }, (_, i) => i), gapId, moves: 0 };
}

export const gapPos = (s: SlideState) => s.board.indexOf(s.gapId);

const rc = (n: number, pos: number) => [Math.floor(pos / n), pos % n] as const;

/** Positions orthogonally adjacent to `pos`. */
export function neighbors(n: number, pos: number): number[] {
  const [r, c] = rc(n, pos);
  const out: number[] = [];
  if (r > 0) out.push(pos - n);
  if (r < n - 1) out.push(pos + n);
  if (c > 0) out.push(pos - 1);
  if (c < n - 1) out.push(pos + 1);
  return out;
}

/** A tile can move if it shares a row or column with the gap. */
export function canMove(s: SlideState, pos: number): boolean {
  const g = gapPos(s);
  if (pos === g) return false;
  const [r, c] = rc(s.n, pos);
  const [gr, gc] = rc(s.n, g);
  return r === gr || c === gc;
}

/**
 * Slide the tile at `pos` (and any tiles between it and the gap) toward the gap.
 * Returns a new state, or null when the move isn't legal. Counts as one move.
 */
export function move(s: SlideState, pos: number): SlideState | null {
  if (!canMove(s, pos)) return null;
  const board = s.board.slice();
  const g = gapPos(s);
  const sameRow = Math.floor(g / s.n) === Math.floor(pos / s.n);
  const step = sameRow ? Math.sign(pos - g) : Math.sign(pos - g) * s.n;
  let cur = g;
  while (cur !== pos) {
    board[cur] = board[cur + step];
    cur += step;
  }
  board[pos] = s.gapId;
  return { ...s, board, moves: s.moves + 1 };
}

/** Position of the tile that would move into the gap when pushed in `dir`. */
export function tileForDirection(s: SlideState, dir: 'up' | 'down' | 'left' | 'right'): number | null {
  const g = gapPos(s);
  const [r, c] = rc(s.n, g);
  // Pushing "up" moves the tile below the gap upward into it.
  if (dir === 'up' && r < s.n - 1) return g + s.n;
  if (dir === 'down' && r > 0) return g - s.n;
  if (dir === 'left' && c < s.n - 1) return g + 1;
  if (dir === 'right' && c > 0) return g - 1;
  return null;
}

/**
 * Solved when every tile is home, treating tiles in `interchangeable` (e.g. fully
 * blank paper tiles, possibly including the gap) as identical to each other.
 */
export function isSolved(s: SlideState, interchangeable: ReadonlySet<number> = new Set()): boolean {
  return s.board.every((id, pos) => id === pos || (interchangeable.has(id) && interchangeable.has(pos)));
}

/**
 * Shuffle by a random walk of legal single-step moves from the solved state, so
 * the result is always solvable. Never immediately undoes the previous step.
 */
export function shuffle(s: SlideState, rng: Rng, steps: number, interchangeable?: ReadonlySet<number>): SlideState {
  let board = s.board.slice();
  let g = board.indexOf(s.gapId);
  let prev = -1;
  const doWalk = (count: number) => {
    for (let i = 0; i < count; i++) {
      const options = neighbors(s.n, g).filter((p) => p !== prev);
      const p = options[randInt(rng, options.length)];
      board[g] = board[p];
      board[p] = s.gapId;
      prev = g;
      g = p;
    }
  };
  doWalk(steps);
  // Never return an already-solved board.
  while (isSolved({ ...s, board }, interchangeable)) doWalk(s.n * 2 + 1);
  return { ...s, board, moves: 0 };
}
