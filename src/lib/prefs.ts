import { isMapView, type MapView } from './catalog';
import { type Difficulty, type Mode, isDifficulty, isMode } from './engine/difficulty';

const KEY = 'plat-puzzles:prefs';

export interface Prefs { mode: Mode; difficulty: Difficulty; sound: boolean; view: MapView }

export function loadPrefs(): Prefs {
  const fallback: Prefs = { mode: 'rotate', difficulty: 'easy', sound: true, view: 'historical' };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      mode: isMode(v.mode) ? v.mode : fallback.mode,
      difficulty: isDifficulty(v.difficulty) ? v.difficulty : fallback.difficulty,
      sound: typeof v.sound === 'boolean' ? v.sound : fallback.sound,
      view: isMapView(v.view) ? v.view : fallback.view,
    };
  } catch {
    return fallback;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode etc.): preferences just aren't remembered */
  }
}
