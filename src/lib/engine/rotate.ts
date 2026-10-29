import { type Rng, randInt } from './rng';

/**
 * Rotate puzzle. rot[i] is the tile's quarter-turns clockwise (0..3).
 * accepted[i] lists the rotations that look correct for tile i (always includes 0;
 * a symmetric or blank tile may look right at other angles too).
 * Tiles that look the same at every angle are locked upright.
 */
export interface RotateState {
  n: number;
  rot: number[];
  accepted: number[][];
  locked: boolean[];
  moves: number;
}

export function create(n: number, accepted: number[][], rng: Rng): RotateState {
  const rot: number[] = [];
  const locked: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    const ok = accepted[i] ?? [0];
    const isLocked = [0, 1, 2, 3].every((r) => ok.includes(r));
    locked.push(isLocked);
    if (isLocked) {
      rot.push(0);
    } else {
      const wrong = [1, 2, 3].filter((r) => !ok.includes(r));
      rot.push(wrong[randInt(rng, wrong.length)]);
    }
  }
  return { n, rot, accepted: accepted.map((a) => a ?? [0]), locked, moves: 0 };
}

/** Rotate tile i by 90° (dir = 1 clockwise, -1 counter-clockwise). */
export function rotate(s: RotateState, i: number, dir: 1 | -1 = 1): RotateState {
  if (s.locked[i]) return s;
  const rot = s.rot.slice();
  rot[i] = (rot[i] + dir + 4) % 4;
  return { ...s, rot, moves: s.moves + 1 };
}

export const isTileCorrect = (s: RotateState, i: number) => s.accepted[i].includes(s.rot[i]);

export const isSolved = (s: RotateState) => s.rot.every((_, i) => isTileCorrect(s, i));

export const remaining = (s: RotateState) => s.rot.filter((_, i) => !isTileCorrect(s, i)).length;
