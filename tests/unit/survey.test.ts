import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/lib/engine/rng';
import * as S from '../../src/lib/engine/survey';

const tray = { x: 1050, y: 0, w: 820, h: 1000 };

/** Four irregular-ish pieces tiling the board: an L-shape cut, like survey units at a coast. */
const data: S.SurveyPieceData[] = [
  { path: 'M0 0L600 0L600 400L0 400Z', bbox: [0, 0, 600, 400], point: [300, 200] },
  { path: 'M600 0L1000 0L1000 400L600 400Z', bbox: [600, 0, 1000, 400], point: [800, 200] },
  { path: 'M0 400L400 400L400 1000L0 1000Z', bbox: [0, 400, 400, 1000], point: [200, 700] },
  { path: 'M400 400L1000 400L1000 1000L400 1000Z', bbox: [400, 400, 1000, 1000], point: [700, 700] },
];

const fresh = (locked: number[] = []) => S.create(data, new Set(locked), tray, createRng(3));

/** Pick up a piece and move its home-relative offset to (dx, dy). */
function carry(s: S.SurveyState, id: number, dx: number, dy: number) {
  const p = s.pieces[id];
  const from: S.From = { dx: p.dx, dy: p.dy, small: p.small };
  return { s: S.setOffset(S.toFull(s, id), id, dx, dy), from };
}

describe('survey', () => {
  it('starts with loose pieces shrunk into tidy tray slots, blanks fixed in place', () => {
    const s = fresh([1]);
    expect(s.pieces[1]).toMatchObject({ locked: true, placed: true, dx: 0, dy: 0 });
    expect(S.placedCount(s)).toBe(1);
    const centers = s.pieces.filter((p) => !p.locked).map((p) => S.visualCenter(s, p));
    for (const c of centers) {
      expect(c.x).toBeGreaterThan(tray.x);
      expect(c.x).toBeLessThan(tray.x + tray.w);
    }
    expect(new Set(centers.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`)).size).toBe(centers.length);
  });

  it('clicks a piece into its own place when dropped close to it', () => {
    const { s, from } = carry(fresh(), 2, 20, -15);
    const r = S.drop(s, 2, from, tray);
    expect(r.result).toBe('placed');
    expect(r.state.pieces[2]).toMatchObject({ dx: 0, dy: 0, placed: true, small: false });
  });

  it('sends a piece dropped in the wrong place on the board back to where it came from', () => {
    const s0 = fresh();
    const start = S.visualCenter(s0, s0.pieces[0]);
    const { s, from } = carry(s0, 0, 400, 500); // over piece 3's place
    const r = S.drop(s, 0, from, tray);
    expect(r.result).toBe('wrong');
    const c = S.visualCenter(r.state, r.state.pieces[0]);
    expect(r.state.pieces[0].small).toBe(true);
    expect(c.x).toBeCloseTo(start.x);
    expect(c.y).toBeCloseTo(start.y);
  });

  it('clicks in when dropped over its own outlined place, even if not close to home', () => {
    const { s, from } = carry(fresh(), 0, 150, 120); // far-ish, but the pointer is over its place
    const r = S.drop(s, 0, from, tray, { x: 500, y: 300 }, 0);
    expect(r.result).toBe('placed');
    const w = S.drop(s, 0, from, tray, { x: 800, y: 800 }, 3);
    expect(w.result).toBe('wrong');
  });

  it('never locks a placed piece: it can be dragged back off', () => {
    let { s, from } = carry(fresh(), 3, 0, 0);
    s = S.drop(s, 3, from, tray).state;
    expect(s.pieces[3].placed).toBe(true);
    const c = carry(s, 3, 700, 0); // into the tray
    const r = S.drop(c.s, 3, c.from, tray);
    expect(r.result).toBe('loose');
    expect(r.state.pieces[3]).toMatchObject({ placed: false, small: true });
  });

  it('pieces dropped outside the board and tray go back to the tray', () => {
    const { s, from } = carry(fresh(), 1, 0, -900); // above the board
    const r = S.drop(s, 1, from, tray);
    expect(r.result).toBe('toTray');
    expect(r.state.pieces[1].small).toBe(true);
  });

  it('is solved when every piece is home', () => {
    let s = fresh([0]);
    for (const p of s.pieces.filter((q) => !q.locked)) {
      const c = carry(s, p.id, 0, 0);
      s = S.drop(c.s, p.id, c.from, tray).state;
    }
    expect(S.isSolved(s)).toBe(true);
  });
});
