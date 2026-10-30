/**
 * Dragging a piece in its own layer above the board. The layer is moved and scaled
 * with CSS transforms, so the board itself is not redrawn while the piece moves.
 */
import { svgPoint } from './panzoom';

export interface Pt { x: number; y: number }

export interface Lift {
  id: number;
  /** The grabbed point in the piece's own (full-size, home) coordinates. */
  local: Pt;
  /** Pointer position at the grab, in client px and in board units. */
  client: Pt;
  start: Pt;
  /** Layer box over the board's <svg>, relative to the wrapper. */
  box: { left: number; top: number; width: number; height: number };
  /** Grab point within the layer, in px (the origin for scaling). */
  origin: Pt;
  viewBox: string;
  /** Visual scale at the grab (tray scale or 1). */
  scale: number;
}

const SETTLE_MS = 150;

export function startLift(svg: SVGSVGElement, wrap: HTMLElement, e: PointerEvent, id: number, local: Pt, scale: number): Lift {
  const r = svg.getBoundingClientRect(), w = wrap.getBoundingClientRect();
  return {
    id, local, scale,
    client: { x: e.clientX, y: e.clientY },
    start: svgPoint(svg, e.clientX, e.clientY),
    box: { left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height },
    origin: { x: e.clientX - r.left, y: e.clientY - r.top },
    viewBox: svg.getAttribute('viewBox') ?? '',
  };
}

/** Offset that draws the piece at full size with its grabbed point at `start`. */
export const liftOffset = (l: Lift) => ({ x: l.start.x - l.local.x, y: l.start.y - l.local.y });

/** Where the grabbed point sits for a piece drawn at home + (dx, dy), scaled by k about home. */
export const grabbedAt = (l: Lift, home: Pt, dx: number, dy: number, k: number): Pt =>
  ({ x: home.x + dx + k * (l.local.x - home.x), y: home.y + dy + k * (l.local.y - home.y) });

/** Offset that puts the grabbed point at `at` for a piece scaled by k about home. */
export const offsetFor = (l: Lift, home: Pt, at: Pt, k: number) =>
  ({ dx: at.x - home.x - k * (l.local.x - home.x), dy: at.y - home.y - k * (l.local.y - home.y) });

/**
 * Moves the layer with the pointer, at most once per frame. `onFrame` gets the
 * pointer in board units and returns the visual scale for that spot.
 */
export function createMover(svg: () => SVGSVGElement, layer: () => HTMLElement | undefined, inner: () => HTMLElement | undefined) {
  let frame = 0;
  let pending: Pt | null = null;
  let scale = 1;
  let lift: Lift | null = null;
  let onFrame: (pt: Pt) => number = () => 1;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const draw = () => {
    frame = 0;
    if (!pending || !lift) return;
    const el = layer(), inn = inner();
    if (el) el.style.transform = `translate3d(${pending.x - lift.client.x}px, ${pending.y - lift.client.y}px, 0)`;
    const k = onFrame(svgPoint(svg(), pending.x, pending.y));
    if (k !== scale && inn) inn.style.transform = `scale(${k})`;
    scale = k;
  };

  return {
    begin(l: Lift, frameFn: (pt: Pt) => number) {
      // A new grab cuts short any glide still running from the last drop.
      clearTimeout(settleTimer);
      const el = layer(), inn = inner();
      if (el) { el.style.transition = ''; el.style.transform = ''; }
      if (inn) inn.style.transform = `scale(${l.scale})`;
      lift = l;
      scale = l.scale;
      onFrame = frameFn;
    },
    move(e: PointerEvent) {
      pending = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(draw);
    },
    /** Stop following the pointer; returns the current visual scale. */
    end() {
      cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      return scale;
    },
    /** Glide the layer to where the grabbed point ends up after the drop, then call `done`. */
    settle(at: Pt, k: number, done: () => void) {
      const el = layer(), inn = inner(), m = svg().getScreenCTM();
      if (!el || !inn || !m || !lift) { done(); return; }
      const x = m.a * at.x + m.e - lift.client.x, y = m.d * at.y + m.f - lift.client.y;
      el.style.transition = `transform ${SETTLE_MS}ms ease-out`;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      inn.style.transform = `scale(${k})`;
      settleTimer = setTimeout(done, SETTLE_MS);
    },
  };
}
