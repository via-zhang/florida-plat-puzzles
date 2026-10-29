import { describe, expect, it } from 'vitest';
import { analyzeCells, rotationDiff } from '../../src/lib/analysis';

const px = (size: number, f: (x: number, y: number) => [number, number, number, number]) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set(f(x, y), (y * size + x) * 4);
  return { size, data };
};

describe('analysis', () => {
  it('rotationDiff is zero for symmetric and large for directional patterns', () => {
    const s = 8;
    const flat = new Float32Array(s * s).fill(100);
    expect(rotationDiff(flat, s, 1)).toBe(0);
    const ramp = Float32Array.from({ length: s * s }, (_, i) => (i % s) * 30);
    expect(rotationDiff(ramp, s, 1)).toBeGreaterThan(20);
    expect(rotationDiff(ramp, s, 2)).toBeGreaterThan(20);
  });

  it('flags missing cells and featureless cells', () => {
    // 2x2 grid: top-left transparent, top-right plain color, bottom row has a diagonal line.
    const img = px(48, (x, y) => {
      if (x < 24 && y < 24) return [0, 0, 0, 0];
      if (y < 24) return [190, 160, 110, 255];
      return Math.abs((x % 24) - (y % 24)) < 2 ? [40, 30, 20, 255] : [190, 160, 110, 255];
    });
    const cells = analyzeCells(img, 2);
    expect(cells[0].missing).toBe(1);
    expect(cells[0].looksRightAt).toEqual([0, 1, 2, 3]);
    expect(cells[1].missing).toBe(0);
    expect(cells[1].looksRightAt).toEqual([0, 1, 2, 3]);
    expect(cells[2].looksRightAt).toEqual([0, 2]); // a diagonal looks the same upside down
  });
});
