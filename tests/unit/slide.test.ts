import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/lib/engine/rng';
import * as S from '../../src/lib/engine/slide';

describe('slide', () => {
  it('starts solved and detects legal moves', () => {
    const s = S.createSolved(3, 8);
    expect(S.isSolved(s)).toBe(true);
    expect(S.gapPos(s)).toBe(8);
    expect(S.canMove(s, 7)).toBe(true);
    expect(S.canMove(s, 2)).toBe(true);
    expect(S.canMove(s, 0)).toBe(false);
    expect(S.canMove(s, 8)).toBe(false);
  });

  it('slides a whole row segment in one move', () => {
    const s = S.move(S.createSolved(3, 8), 6)!; // bottom-left: tiles 6,7 shift right
    expect(s.board).toEqual([0, 1, 2, 3, 4, 5, 8, 6, 7]);
    expect(s.moves).toBe(1);
  });

  it('slides a column segment', () => {
    const s = S.move(S.createSolved(3, 8), 2)!;
    expect(s.board).toEqual([0, 1, 8, 3, 4, 2, 6, 7, 5]);
  });

  it('rejects illegal moves', () => {
    expect(S.move(S.createSolved(3, 8), 0)).toBeNull();
  });

  it('shuffles into an unsolved but solvable board', () => {
    for (let seed = 1; seed < 40; seed++) {
      const start = S.createSolved(4, 5);
      const s = S.shuffle(start, createRng(seed), 200);
      expect(S.isSolved(s)).toBe(false);
      expect([...s.board].sort((a, b) => a - b)).toEqual(start.board);
      expect(solvable(s)).toBe(true);
    }
  });

  it('treats interchangeable blank tiles as identical', () => {
    // tiles 7 and 8 are both blank paper; 8 is the gap
    const blank = new Set([7, 8]);
    const s = { ...S.createSolved(3, 8), board: [0, 1, 2, 3, 4, 5, 6, 8, 7] };
    expect(S.isSolved(s)).toBe(false);
    expect(S.isSolved(s, blank)).toBe(true);
  });

  it('maps swipe directions to the tile next to the gap', () => {
    const s = S.createSolved(3, 4); // gap in the center
    expect(S.tileForDirection(s, 'up')).toBe(7);
    expect(S.tileForDirection(s, 'down')).toBe(1);
    expect(S.tileForDirection(s, 'left')).toBe(5);
    expect(S.tileForDirection(s, 'right')).toBe(3);
  });
});

/** Standard solvability test via permutation parity + gap distance. */
function solvable(s: S.SlideState): boolean {
  const perm = s.board;
  let inv = 0;
  const seen = new Array(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) { seen[j] = true; len++; }
    inv += len - 1;
  }
  const g = S.gapPos(s);
  const home = s.gapId;
  const dist = Math.abs(Math.floor(g / s.n) - Math.floor(home / s.n)) + Math.abs((g % s.n) - (home % s.n));
  return inv % 2 === dist % 2;
}
