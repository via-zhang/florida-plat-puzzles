export type Mode = 'slide' | 'rotate' | 'jigsaw' | 'survey';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** How to play each mode, shown in the left panel. */
export const HOW_TO: Record<Mode, string> = {
  rotate: 'Tap a tile to turn it clockwise; right-click, long-press or Shift+Enter turns it back. Blank tiles are fixed.',
  jigsaw: "Drag pieces onto the board: they click into a square. Rearrange freely until it's solved.",
  slide: "Tap a tile in the empty square's row or column, swipe, or use the arrow keys.",
  survey: 'Pieces are the surveyors\' townships. Drag each onto its outlined place; it clicks in when it\'s the right one.',
};

/** What a Survey piece is at each difficulty. */
export const SURVEY_UNIT: Record<Difficulty, string> = {
  easy: 'townships',
  medium: 'half townships',
  hard: 'quarter townships',
};

export const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'rotate', label: 'Rotate', blurb: 'Tap tiles to turn them upright' },
  { id: 'jigsaw', label: 'Jigsaw', blurb: 'Drag pieces onto the board' },
  { id: 'slide', label: 'Slide', blurb: 'Slide tiles into the empty space' },
  { id: 'survey', label: 'Survey', blurb: 'Pieces follow the 1800s survey lines' },
];

export const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

/** Grid size (n x n) for each mode and difficulty. */
export const GRID: Record<Mode, Record<Difficulty, number>> = {
  rotate: { easy: 3, medium: 4, hard: 5 },
  jigsaw: { easy: 3, medium: 4, hard: 5 },
  slide: { easy: 3, medium: 4, hard: 5 },
  // Survey pieces follow the survey lines, not a grid; this is only a size hint.
  survey: { easy: 3, medium: 4, hard: 5 },
};

/** Jigsaw pieces are plain squares on Easy, classic tabbed shapes otherwise. */
export const jigsawTabs = (d: Difficulty) => d !== 'easy';

/** Random-walk length used to shuffle Slide puzzles. */
export const SLIDE_SHUFFLE: Record<number, number> = { 3: 80, 4: 200, 5: 400, 6: 700 };

export const isMode = (s: string): s is Mode => MODES.some((m) => m.id === s);
export const isDifficulty = (s: string): s is Difficulty => DIFFICULTIES.some((d) => d.id === s);
