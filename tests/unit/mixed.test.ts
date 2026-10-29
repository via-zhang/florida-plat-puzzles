import { describe, expect, it } from 'vitest';
import { mixedPieces } from '../../src/lib/mixed';

describe('mixedPieces', () => {
  it('picks half of an even count', () => {
    for (const n of [4, 16, 36]) expect(mixedPieces(123, n).size).toBe(n / 2);
  });
  it('picks floor or ceil of half for an odd count, both over many seeds', () => {
    const sizes = new Set(Array.from({ length: 50 }, (_, s) => mixedPieces(s, 9).size));
    expect([...sizes].sort()).toEqual([4, 5]);
  });
  it('only uses valid piece ids', () => {
    for (const id of mixedPieces(7, 25)) expect(id >= 0 && id < 25).toBe(true);
  });
  it('is stable for a seed and varies across seeds', () => {
    expect([...mixedPieces(42, 25)]).toEqual([...mixedPieces(42, 25)]);
    const a = [...mixedPieces(1, 25)].sort().join(), b = [...mixedPieces(2, 25)].sort().join();
    expect(a).not.toBe(b);
  });
});
