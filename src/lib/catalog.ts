import type { Rng } from './engine/rng';

export interface Square {
  id: string;
  col: number;
  row: number;
  coverage: number;
  /** Every piece has map on it in every mode (no entirely blank pieces). */
  complete?: boolean;
  lon: number;
  lat: number;
}

export interface Manifest {
  attribution: string;
  squareMeters: number;
  cols: number;
  rows: number;
  sizes: number[];
  overview: { file: string; width: number; height: number };
  squares: Square[];
  /** Present-day Sentinel-2 imagery, when it has been built. */
  present?: { source: string; season: [string, string]; attribution: string; overview: string };
}

/** Which picture the puzzle shows: the historical plats, present-day imagery, or about half of each. */
export type MapView = 'historical' | 'present' | 'mixed';
export const MAP_VIEWS: { id: MapView; label: string; title?: string }[] = [
  { id: 'historical', label: 'Historical' },
  { id: 'present', label: 'Present' },
  { id: 'mixed', label: 'Mixed', title: 'About half the pieces historical, half present-day' },
];
export const isMapView = (s: unknown): s is MapView => s === 'historical' || s === 'present' || s === 'mixed';

const base = import.meta.env.BASE_URL;

export const assetUrl = (path: string) => `${base}${path}`;

let manifestPromise: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(assetUrl('puzzles/manifest.json')).then((r) => {
    if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
    return r.json();
  });
  return manifestPromise;
}

/** Pick the image size that suits the screen (board is at most ~92vw / 80vh). */
export function preferredSize(sizes: number[]): number {
  if (typeof window === 'undefined') return 800;
  const boardCss = Math.min(window.innerWidth * 0.92, window.innerHeight * 0.8, 900);
  const needed = boardCss * (window.devicePixelRatio || 1);
  const big = Math.max(...sizes);
  return needed > 900 ? big : sizes.filter((s) => s >= 800).sort((a, b) => a - b)[0] ?? big;
}

export const imageUrl = (sq: Square, size: number) => assetUrl(`puzzles/${sq.id}.${size}.webp`);

export interface SurveyLevels { easy: import('./engine/survey').SurveyPieceData[]; medium: import('./engine/survey').SurveyPieceData[]; hard: import('./engine/survey').SurveyPieceData[] }

const surveyCache = new Map<string, Promise<SurveyLevels>>();

/** Survey-mode pieces for a square (small JSON, cached). */
export function loadSurvey(sq: Square): Promise<SurveyLevels> {
  if (!surveyCache.has(sq.id)) {
    surveyCache.set(sq.id, fetch(assetUrl(`survey/${sq.id}.json`)).then((r) => {
      if (!r.ok) throw new Error(`survey pieces: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return surveyCache.get(sq.id)!;
}

export const presentUrl = (sq: Square, size: number) => assetUrl(`present/${sq.id}.${size}.webp`);

/** Picture URL for a square in either view. */
export const viewUrl = (sq: Square, size: number, view: MapView) => (view === 'present' ? presentUrl(sq, size) : imageUrl(sq, size));

/**
 * Random square for "New puzzle" / the first visit: only squares where every tile has
 * map on it (no blank pieces in any mode). Falls back to all squares if none are marked.
 */
export function randomSquare(m: Manifest, rng: Rng): Square {
  const complete = m.squares.filter((s) => s.complete);
  const pool = complete.length ? complete : m.squares;
  return pool[Math.floor(rng() * pool.length)];
}

export function formatCoords(sq: Square): string {
  const lat = `${Math.abs(sq.lat).toFixed(2)}°${sq.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(sq.lon).toFixed(2)}°${sq.lon >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}
