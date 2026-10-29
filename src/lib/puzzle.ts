import { analyzeCells, analysisSize, BLANK, MOSTLY_MISSING, pieceMissing, readPixels, type CellInfo } from './analysis';
import { mixedPieces } from './mixed';
import { imageUrl, preferredSize, presentUrl, type Manifest, type MapView, type Square } from './catalog';

export interface LoadedPuzzle {
  square: Square;
  /** Historical plat image (defines the puzzle: missing data, gap, fixed pieces). */
  url: string;
  /** Present-day image of the same square, or null if unavailable. */
  presentUrl: string | null;
  img: HTMLImageElement;
  /**
   * Picture for each piece in a view (falls back to historical if present is unavailable).
   * Mixed needs the puzzle's seed and piece count to pick which pieces are present-day.
   */
  srcOf(view: MapView, seed: number, count: number): (id: number) => string;
  /** Analysis per grid size, computed lazily from the historical image. */
  cells(n: number): CellInfo[];
  /** Missing-data fraction for arbitrary piece shapes (Survey mode). */
  missing(paths: string[]): number[];
}

/** Load the first size that works, largest preferred first. */
async function loadImage(urlFor: (size: number) => string, sizes: number[]) {
  let last: unknown;
  for (const size of sizes) {
    const img = new Image();
    img.decoding = 'async';
    img.src = urlFor(size);
    try {
      await img.decode();
      return img;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Load the historical and present-day pictures in parallel. Only the historical one is required. */
export async function loadPuzzle(m: Manifest, square: Square): Promise<LoadedPuzzle> {
  const pref = preferredSize(m.sizes);
  const sizes = [pref, ...m.sizes.filter((s) => s < pref && s >= 800).sort((a, b) => b - a)];
  const [hist, pres] = await Promise.all([
    loadImage((s) => imageUrl(square, s), sizes),
    m.present ? loadImage((s) => presentUrl(square, s), sizes).catch(() => null) : Promise.resolve(null),
  ]);
  const cache = new Map<number, CellInfo[]>();
  const url = hist.src;
  const pUrl = pres?.src ?? null;
  return {
    square, url, presentUrl: pUrl, img: hist,
    srcOf(view, seed, count) {
      if (!pUrl || view === 'historical') return () => url;
      if (view === 'present') return () => pUrl;
      const mix = mixedPieces(seed, count);
      return (id) => (mix.has(id) ? pUrl : url);
    },
    cells(n) {
      if (!cache.has(n)) cache.set(n, analyzeCells(readPixels(hist, analysisSize(n)), n));
      return cache.get(n)!;
    },
    missing: (paths) => pieceMissing(hist, paths),
  };
}

/** Cells that are plain paper: visually interchangeable. */
export const blankCells = (cells: CellInfo[]) => new Set(cells.flatMap((c, i) => (c.missing >= BLANK ? [i] : [])));

/** Candidate cells for the Slide gap: mostly missing data. */
export const gapCandidates = (cells: CellInfo[]) => cells.flatMap((c, i) => (c.missing >= MOSTLY_MISSING ? [i] : []));
