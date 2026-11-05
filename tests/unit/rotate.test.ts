import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/lib/engine/rng';
import * as R from '../../src/lib/engine/rotate';

describe('rotate', () => {
  const accepted = [[0], [0, 2], [0, 1, 2, 3], [0, 1, 2, 3]];
  const fixed = [false, false, false, true];

  it('locks only fixed (blank) tiles and starts every other tile turned', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = R.create(2, accepted, fixed, createRng(seed));
      expect(s.locked).toEqual([false, false, false, true]);
      expect(s.rot[3]).toBe(0);
      expect([1, 2, 3]).toContain(s.rot[0]);
      expect([1, 3]).toContain(s.rot[1]);
      // Accepted at every angle but not fixed: still turnable, and starts turned.
      expect([1, 2, 3]).toContain(s.rot[2]);
      expect(R.rotate(s, 2).rot[2]).toBe((s.rot[2] + 1) % 4);
    }
  });

  it('rotates clockwise and counter-clockwise, ignoring locked tiles', () => {
    let s = R.create(2, accepted, fixed, createRng(3));
    const before = s.rot[0];
    s = R.rotate(s, 0, 1);
    expect(s.rot[0]).toBe((before + 1) % 4);
    s = R.rotate(s, 0, -1);
    expect(s.rot[0]).toBe(before);
    expect(R.rotate(s, 3)).toBe(s);
    expect(s.moves).toBe(2);
  });

  it('is solved when every tile is at an accepted rotation', () => {
    const s = R.create(2, accepted, fixed, createRng(5));
    const solved = { ...s, rot: [0, 2, 0, 0] };
    expect(R.isSolved(solved)).toBe(true);
  });
});
