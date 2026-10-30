/**
 * Dragging a piece in its own small layer above the board. The layer is just big
 * enough for the piece and is moved and scaled with CSS transforms, so neither the
 * board nor the layer is redrawn while the piece moves.
 */
export interface Pt { x: number; y: number }
export interface Box { left: number; top: number; width: number; height: number }

export interface Lift {
  id: number;
  /** The grabbed point in the piece's own (full-size, home) coordinates. */
  local: Pt;
  /** Pointer position at the grab, in client px and in board units. */
  client: Pt;
  start: Pt;
  /** The piece's layer, relative to the wrapper, and its viewBox (the piece's full-size bounds). */
  box: Box;
  viewBox: string;
  /** Grab point within the layer, in px (the origin for scaling). */
  origin: Pt;
  /** The whole board's box and viewBox, for overlays such as the drop target. */
  frame: Box;
  frameViewBox: string;
  /** Visual scale at the grab (tray scale or 1). */
  scale: number;
  /** Client px -> board units, fixed for the whole drag. */
  toBoard: (x: number, y: number) => Pt;
}

const SETTLE_MS = 150;

/**
 * Start lifting piece `id`, grabbed at `local` (home coordinates); `bounds` is the
 * piece's full-size outline box in the same coordinates.
 */
export function startLift(
  svg: SVGSVGElement, wrap: HTMLElement, e: PointerEvent, id: number, local: Pt, scale: number,
  bounds: { x: number; y: number; width: number; height: number },
): Lift {
  const r = svg.getBoundingClientRect(), w = wrap.getBoundingClientRect();
  const m = svg.getScreenCTM() ?? new DOMMatrix();
  const inv = m.inverse();
  const s = m.a; // px per board unit
  const pad = 4; // room for the outline stroke
  const b = { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + 2 * pad, height: bounds.height + 2 * pad };
  const origin = { x: (local.x - b.x) * s, y: (local.y - b.y) * s };
  const toBoard = (x: number, y: number) => ({ x: inv.a * x + inv.c * y + inv.e, y: inv.b * x + inv.d * y + inv.f });
  return {
    id, local, scale, origin, toBoard,
    client: { x: e.clientX, y: e.clientY },
    start: toBoard(e.clientX, e.clientY),
    box: { left: e.clientX - w.left - origin.x, top: e.clientY - w.top - origin.y, width: b.width * s, height: b.height * s },
    viewBox: `${b.x} ${b.y} ${b.width} ${b.height}`,
    frame: { left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height },
    frameViewBox: svg.getAttribute('viewBox') ?? '',
  };
}

/** Where the grabbed point sits for a piece drawn at home + (dx, dy), scaled by k about home. */
export const grabbedAt = (l: Lift, home: Pt, dx: number, dy: number, k: number): Pt =>
  ({ x: home.x + dx + k * (l.local.x - home.x), y: home.y + dy + k * (l.local.y - home.y) });

/** Offset that puts the grabbed point at `at` for a piece scaled by k about home. */
export const offsetFor = (l: Lift, home: Pt, at: Pt, k: number) =>
  ({ dx: at.x - home.x - k * (l.local.x - home.x), dy: at.y - home.y - k * (l.local.y - home.y) });

/**
 * Moves the layer with the pointer on every pointer event. Once per frame, `onFrame`
 * gets the pointer in board units and returns the visual scale for that spot.
 */
export function createMover(layer: () => HTMLElement | undefined, inner: () => HTMLElement | undefined) {
  let frame = 0;
  let pending: Pt | null = null;
  let scale = 1;
  let lift: Lift | null = null;
  let onFrame: (pt: Pt) => number = () => 1;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    frame = 0;
    if (!pending || !lift) return;
    const k = onFrame(lift.toBoard(pending.x, pending.y));
    const inn = inner();
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
      if (!lift) return;
      const el = layer();
      if (el) el.style.transform = `translate3d(${e.clientX - lift.client.x}px, ${e.clientY - lift.client.y}px, 0)`;
      pending = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(check);
    },
    /** Stop following the pointer; returns the current visual scale. */
    end() {
      cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      return scale;
    },
    /** Glide the layer to where the grabbed point ends up after the drop, then call `done`. */
    settle(svg: SVGSVGElement, at: Pt, k: number, done: () => void) {
      const el = layer(), inn = inner(), m = svg.getScreenCTM();
      if (!el || !inn || !m || !lift) { done(); return; }
      const x = m.a * at.x + m.e - lift.client.x, y = m.d * at.y + m.f - lift.client.y;
      el.style.transition = `transform ${SETTLE_MS}ms ease-out`;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      inn.style.transform = `scale(${k})`;
      settleTimer = setTimeout(done, SETTLE_MS);
    },
  };
}
