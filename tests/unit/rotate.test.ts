import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/lib/engine/rng';
import * as R from '../../src/lib/engine/rotate';

describe('rotate', () => {
  const accepted = [[0], [0, 2], [0, 1, 2, 3], [0]];

  it('starts every unlocked tile wrong and locks fully symmetric tiles', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = R.create(2, accepted, createRng(seed));
      expect(s.locked).toEqual([false, false, true, false]);
      expect(s.rot[2]).toBe(0);
      expect(R.remaining(s)).toBe(3);
      expect([1, 3]).toContain(s.rot[1]);
    }
  });

  it('rotates clockwise and counter-clockwise, ignoring locked tiles', () => {
    let s = R.create(2, accepted, createRng(3));
    const before = s.rot[0];
    s = R.rotate(s, 0, 1);
    expect(s.rot[0]).toBe((before + 1) % 4);
    s = R.rotate(s, 0, -1);
    expect(s.rot[0]).toBe(before);
    expect(R.rotate(s, 2)).toBe(s);
    expect(s.moves).toBe(2);
  });

  it('is solved when every tile is at an accepted rotation', () => {
    const s = R.create(2, accepted, createRng(5));
    const solved = { ...s, rot: [0, 2, 0, 0] };
    expect(R.isSolved(solved)).toBe(true);
  });
});
