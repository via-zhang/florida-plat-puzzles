import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/lib/engine/rng';
import * as J from '../../src/lib/engine/jigsaw';

const tray = { x: 1050, y: 0, w: 600, h: 1000 };

describe('jigsaw', () => {
  it('builds one closed path per piece', () => {
    const paths = J.buildPaths(4, createRng(1), true);
    expect(paths).toHaveLength(16);
    for (const p of paths) expect(p).toMatch(/^M[\d.\- ]+C.*Z$/);
  });

  it('square pieces have flat edges only', () => {
    const paths = J.buildPaths(3, createRng(1), false);
    expect(paths[4]).toBe('M333.3 333.3C333.3 333.3 666.7 333.3 666.7 333.3C666.7 333.3 666.7 666.7 666.7 666.7C666.7 666.7 333.3 666.7 333.3 666.7C333.3 666.7 333.3 333.3 333.3 333.3Z');
  });

  it('neighboring pieces share identical edge geometry', () => {
    // The right edge of piece 0 must contain the same coordinates as the left edge of piece 1.
    const paths = J.buildPaths(2, createRng(9), true);
    const nums = (s: string) => s.match(/-?\d+(\.\d+)?/g)!.join(' ');
    const coords0 = nums(paths[0]);
    const coords1 = nums(paths[1]);
    const mid = coords0.split(' ').filter((_, i, a) => i % 2 === 0 && Math.abs(+a[i] - 500) < 120);
    expect(mid.length).toBeGreaterThan(4);
    for (const x of mid) expect(coords1).toContain(x);
  });

  it('lays loose pieces out in a tidy, shrunken grid in the tray', () => {
    const rng = createRng(2);
    const s = J.create(4, J.buildPaths(4, rng, true), new Set([5]), tray, rng);
    expect(J.placedCount(s)).toBe(1); // the fixed blank piece
    expect(s.trayScale).toBeLessThan(1);
    const centers = s.pieces.filter((q) => !q.locked).map((q) => J.visualCenter(s, q));
    for (const c of centers) {
      expect(c.x).toBeGreaterThan(tray.x);
      expect(c.x).toBeLessThan(tray.x + tray.w);
      expect(c.y).toBeGreaterThan(tray.y);
      expect(c.y).toBeLessThan(tray.y + tray.h);
    }
    // No two pieces share a slot.
    const keys = new Set(centers.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`));
    expect(keys.size).toBe(centers.length);
    for (const q of s.pieces.filter((q) => !q.locked)) expect(J.slotOf(s, q)).toBeNull();
  });

  const fresh = () => {
    const rng = createRng(2);
    return J.create(4, J.buildPaths(4, rng, true), new Set([5]), tray, rng);
  };
  const cell = 250;
  /** Pick up piece `id` (grows to full size) and move its top-left to board point (x, y). */
  const carry = (s: J.JigsawState, id: number, x: number, y: number) => {
    const p = s.pieces[id];
    const from: J.From = { dx: p.dx, dy: p.dy, small: p.small };
    const t = J.toFull(s, id);
    return { s: J.setOffset(t, id, x - p.col * cell, y - p.row * cell), from };
  };

  it('grows a tray piece to full size around its center when picked up', () => {
    const s = fresh();
    const before = J.visualCenter(s, s.pieces[0]);
    const t = J.toFull(s, 0);
    expect(t.pieces[0].small).toBe(false);
    const after = J.visualCenter(t, t.pieces[0]);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clicks a piece into its own cell from anywhere inside it', () => {
    const { s, from } = carry(fresh(), 0, 90, -80); // center still inside cell 0
    const r = J.drop(s, 0, from, tray);
    expect(r.result).toBe('placed');
    expect(r.state.pieces[0]).toMatchObject({ dx: 0, dy: 0, placed: true, locked: false });
    expect(r.state.order[0]).toBe(5); // only the fixed blank sits underneath
  });

  it('clicks a piece into the wrong cell', () => {
    const { s, from } = carry(fresh(), 0, 260, 510); // over cell 9
    const r = J.drop(s, 0, from, tray);
    expect(r.result).toBe('slotted');
    expect(J.slotOf(r.state, r.state.pieces[0])).toBe(9);
    expect(r.state.pieces[0].placed).toBe(false);
  });

  it('swaps with a piece already in that cell, sending it to the tray spot', () => {
    let { s, from } = carry(fresh(), 0, 250, 500);
    s = J.drop(s, 0, from, tray).state; // piece 0 sits in cell 9
    const trayCenter = J.visualCenter(s, s.pieces[1]);
    const c = carry(s, 1, 250, 500);
    const r = J.drop(c.s, 1, c.from, tray);
    expect(r.result).toBe('swapped');
    expect(J.slotOf(r.state, r.state.pieces[1])).toBe(9);
    const p0 = r.state.pieces[0];
    expect(p0.small).toBe(true);
    expect(J.visualCenter(r.state, p0).x).toBeCloseTo(trayCenter.x);
    expect(J.visualCenter(r.state, p0).y).toBeCloseTo(trayCenter.y);
  });

  it('never locks a correctly placed piece: it can be swapped out or dragged off', () => {
    let { s, from } = carry(fresh(), 0, 0, 0);
    s = J.drop(s, 0, from, tray).state;
    expect(s.pieces[0].placed).toBe(true);
    const c = carry(s, 1, 0, 0);
    const r = J.drop(c.s, 1, c.from, tray);
    expect(r.result).toBe('swapped');
    expect(J.slotOf(r.state, r.state.pieces[1])).toBe(0);
    expect(r.state.pieces[0].placed).toBe(false);

    const off = carry(s, 0, 1200, 100);
    const r2 = J.drop(off.s, 0, off.from, tray);
    expect(r2.result).toBe('loose');
    expect(r2.state.pieces[0]).toMatchObject({ placed: false, small: true });
  });

  it('sends a piece back from a fixed blank cell', () => {
    const { s, from } = carry(fresh(), 0, 250, 250); // cell 5 holds the fixed blank
    const r = J.drop(s, 0, from, tray);
    expect(r.result).toBe('returned');
    expect(r.state.pieces[0]).toMatchObject(from);
  });

  it('shrinks pieces dropped off the board back to tray size', () => {
    const { s, from } = carry(fresh(), 0, 1200, 300);
    const r = J.drop(s, 0, from, tray);
    expect(r.result).toBe('loose');
    expect(r.state.pieces[0].small).toBe(true);
    expect(J.slotOf(r.state, r.state.pieces[0])).toBeNull();
  });

  it('sends a piece dropped outside the board and tray back to where it came from in the tray', () => {
    const s0 = fresh();
    const start = J.visualCenter(s0, s0.pieces[0]);
    const { s, from } = carry(s0, 0, 300, -500); // above the board
    const r = J.drop(s, 0, from, tray);
    expect(r.result).toBe('toTray');
    const c = J.visualCenter(r.state, r.state.pieces[0]);
    expect(r.state.pieces[0].small).toBe(true);
    expect(c.x).toBeCloseTo(start.x);
    expect(c.y).toBeCloseTo(start.y);
  });

  it('sends a piece dragged off the board (not into the tray) to a free tray spot', () => {
    let { s, from } = carry(fresh(), 0, 250, 500);
    s = J.drop(s, 0, from, tray).state; // now sitting in cell 9
    const c = carry(s, 0, -600, 300); // dragged out to the left of the board
    const r = J.drop(c.s, 0, c.from, tray);
    expect(r.result).toBe('toTray');
    const p = J.visualCenter(r.state, r.state.pieces[0]);
    expect(p.x).toBeGreaterThan(tray.x);
    expect(p.x).toBeLessThan(tray.x + tray.w);
    expect(p.y).toBeGreaterThan(tray.y);
    expect(p.y).toBeLessThan(tray.y + tray.h);
  });

  it('keeps pieces dropped in the tray fully inside it', () => {
    const { s, from } = carry(fresh(), 0, 1640 - 125, 990 - 125); // center just inside the bottom-right corner
    const r = J.drop(s, 0, from, tray);
    expect(r.result).toBe('loose');
    const c = J.visualCenter(r.state, r.state.pieces[0]);
    const half = (r.state.trayScale * cell) / 2;
    expect(c.x).toBeLessThanOrEqual(tray.x + tray.w - half + 0.001);
    expect(c.y).toBeLessThanOrEqual(tray.y + tray.h - half + 0.001);
  });

  it('drops a tray-size piece where it is drawn, without growing it first', () => {
    const s0 = fresh();
    const p = s0.pieces[0];
    const c0 = J.visualCenter(s0, p);
    // Nudge it within the tray, still at tray size.
    const s = J.setOffset(s0, 0, p.dx + 20, p.dy + 30);
    const r = J.drop(s, 0, { dx: p.dx, dy: p.dy, small: true }, tray);
    expect(r.result).toBe('loose');
    expect(r.state.pieces[0].small).toBe(true);
    const c = J.visualCenter(r.state, r.state.pieces[0]);
    expect(c.x).toBeCloseTo(c0.x + 20);
    expect(c.y).toBeCloseTo(c0.y + 30);
  });

  it('is solved when every piece is in its own cell', () => {
    const rng = createRng(4);
    let s = J.create(2, J.buildPaths(2, rng, false), new Set(), tray, rng);
    for (const p of s.pieces) {
      const from: J.From = { dx: p.dx, dy: p.dy, small: p.small };
      s = J.drop(J.setOffset(J.toFull(s, p.id), p.id, 0, 0), p.id, from, tray).state;
    }
    expect(J.isSolved(s)).toBe(true);
  });
});
