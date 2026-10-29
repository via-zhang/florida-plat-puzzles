import { createRng, shuffleInPlace } from './engine/rng';

/**
 * Pieces shown with present-day imagery in the Mixed view: half of them, picked from
 * the puzzle's seed. With an odd count, the extra piece goes either way.
 */
export function mixedPieces(seed: number, count: number): Set<number> {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const half = Math.floor(count / 2) + (count % 2 && rng() < 0.5 ? 1 : 0);
  const ids = shuffleInPlace(rng, Array.from({ length: count }, (_, i) => i));
  return new Set(ids.slice(0, half));
}
