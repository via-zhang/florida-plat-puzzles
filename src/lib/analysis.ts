/**
 * Per-cell analysis of a puzzle image, done in the browser after it loads:
 * how much of each cell is missing data (transparent), and which rotations of
 * the cell look the same as upright (for the Rotate fairness rule).
 */
export interface CellInfo {
  /** Fraction of the cell that is missing data (0..1). */
  missing: number;
  /** Quarter-turn rotations that look like the upright tile (always includes 0). */
  looksRightAt: number[];
}

/** RGBA pixels of an image scaled to size x size. */
export interface Pixels {
  size: number;
  data: Uint8ClampedArray;
}

/** Paper color (matches public/paper.webp) used where data is missing. */
const PAPER = [202, 168, 109];
const SAMPLE = 24; // analysis resolution per cell
export const BLANK = 0.97; // treated as plain paper
export const MOSTLY_MISSING = 0.75;
const SAME_THRESHOLD = 6; // mean abs luminance difference (0..255) that counts as "looks the same"

export function readPixels(img: HTMLImageElement | ImageBitmap, size: number): Pixels {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  return { size, data: ctx.getImageData(0, 0, size, size).data };
}

export const analysisSize = (n: number) => n * SAMPLE;

export function analyzeCells(px: Pixels, n: number): CellInfo[] {
  const s = Math.floor(px.size / n);
  const out: CellInfo[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const lum = new Float32Array(s * s);
      let missing = 0;
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = ((r * s + y) * px.size + (c * s + x)) * 4;
          const a = px.data[i + 3] / 255;
          if (a < 0.5) missing++;
          const rr = px.data[i] * a + PAPER[0] * (1 - a);
          const gg = px.data[i + 1] * a + PAPER[1] * (1 - a);
          const bb = px.data[i + 2] * a + PAPER[2] * (1 - a);
          lum[y * s + x] = 0.299 * rr + 0.587 * gg + 0.114 * bb;
        }
      }
      const frac = missing / (s * s);
      const looksRightAt = frac >= BLANK ? [0, 1, 2, 3] : [0, ...[1, 2, 3].filter((k) => rotationDiff(lum, s, k) < SAME_THRESHOLD)];
      out.push({ missing: frac, looksRightAt });
    }
  }
  return out;
}

/** Mean absolute difference between a square luminance grid and itself rotated k quarter-turns. */
export function rotationDiff(lum: Float32Array, s: number, k: number): number {
  let sum = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let sx = x, sy = y;
      for (let i = 0; i < k; i++) [sx, sy] = [sy, s - 1 - sx];
      sum += Math.abs(lum[y * s + x] - lum[sy * s + sx]);
    }
  }
  return sum / (s * s);
}

/**
 * Fraction of each piece (an SVG path in 0-1000 board units) that is missing data,
 * measured on a small canvas. Used to find Survey pieces that are entirely blank.
 */
export function pieceMissing(img: HTMLImageElement, paths: string[], res = 250): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, res, res);
  const alpha = ctx.getImageData(0, 0, res, res).data;
  return paths.map((d) => {
    ctx.clearRect(0, 0, res, res);
    ctx.save();
    ctx.scale(res / 1000, res / 1000);
    ctx.fillStyle = '#fff';
    ctx.fill(new Path2D(d));
    ctx.restore();
    const mask = ctx.getImageData(0, 0, res, res).data;
    let inside = 0, missing = 0;
    for (let i = 3; i < mask.length; i += 4) {
      if (mask[i] > 127) {
        inside++;
        if (alpha[i] < 128) missing++;
      }
    }
    return inside ? missing / inside : 1;
  });
}
