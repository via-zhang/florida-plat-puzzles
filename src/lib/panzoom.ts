/**
 * Pan and zoom an <svg> by changing its viewBox. Handles mouse wheel, drag to pan,
 * two-finger pinch, and taps. Pointer-downs on elements matching `ignore` (e.g.
 * draggable jigsaw pieces) are left alone.
 */
export interface ViewBox { x: number; y: number; w: number; h: number }

export interface PanZoomOptions {
  content: () => { w: number; h: number };
  /** Initial / reset view (defaults to all content). */
  home?: () => ViewBox;
  maxZoom?: number;
  ignore?: string;
  onTap?: (pt: { x: number; y: number }, e: PointerEvent) => void;
  onHover?: (pt: { x: number; y: number } | null) => void;
}

export interface PanZoom {
  zoomBy(factor: number): void;
  reset(): void;
  get zoom(): number;
  destroy(): void;
}

export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

export function panZoom(svg: SVGSVGElement, opts: PanZoomOptions): PanZoom {
  const maxZoom = opts.maxZoom ?? 6;
  let vbAspect = 0; // keeps the home view's aspect ratio while zooming
  const homeView = () => {
    const v = opts.home?.() ?? { x: 0, y: 0, ...opts.content() };
    vbAspect = v.h / v.w;
    return v;
  };
  let vb: ViewBox = homeView();
  const pointers = new Map<number, { x: number; y: number }>();
  let tapStart: { x: number; y: number; t: number; id: number } | null = null;
  let pinchDist = 0;

  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  const clamp = () => {
    const c = opts.content();
    vb.w = Math.min(Math.max(vb.w, c.w / maxZoom), c.w);
    vb.h = vb.w * (vbAspect || c.h / c.w);
    // Keep at least a little of the content in view.
    vb.x = Math.min(Math.max(vb.x, -vb.w * 0.25), c.w - vb.w * 0.75);
    vb.y = Math.min(Math.max(vb.y, -vb.h * 0.25), c.h - vb.h * 0.75);
    if (vb.w >= c.w) { vb.x = 0; vb.y = 0; }
  };

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const p = svgPoint(svg, cx, cy);
    const nw = vb.w / factor;
    const c = opts.content();
    const clampedW = Math.min(Math.max(nw, c.w / maxZoom), c.w);
    const k = clampedW / vb.w;
    vb = { x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w: vb.w * k, h: vb.h * k };
    clamp();
    apply();
  };

  // SVG units per client pixel (preserveAspectRatio "meet" uses the larger ratio).
  const unitsPerPx = () => Math.max(vb.w / svg.clientWidth, vb.h / svg.clientHeight);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX, e.clientY);
  };

  const ignored = (e: PointerEvent) => !!(opts.ignore && (e.target as Element).closest?.(opts.ignore));

  const onDown = (e: PointerEvent) => {
    if (ignored(e)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    if (pointers.size === 2) {
      tapStart = null;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse' && !ignored(e)) opts.onHover?.(svgPoint(svg, e.clientX, e.clientY));
      return;
    }
    const cur = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      if (tapStart && Math.hypot(cur.x - tapStart.x, cur.y - tapStart.y) < 6) return;
      tapStart = null;
      const u = unitsPerPx();
      vb.x -= (cur.x - prev.x) * u;
      vb.y -= (cur.y - prev.y) * u;
      clamp();
      apply();
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, cur);
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist = d;
      return;
    }
    pointers.set(e.pointerId, cur);
  };

  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (tapStart && tapStart.id === e.pointerId && performance.now() - tapStart.t < 600) {
      opts.onTap?.(svgPoint(svg, e.clientX, e.clientY), e);
    }
    tapStart = null;
    if (pointers.size < 2) pinchDist = 0;
  };

  const onLeave = () => opts.onHover?.(null);

  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', onLeave);
  apply();

  return {
    zoomBy(f) {
      const r = svg.getBoundingClientRect();
      zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
    },
    reset() {
      vb = homeView();
      apply();
    },
    get zoom() {
      return opts.content().w / vb.w;
    },
    destroy() {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      svg.removeEventListener('pointerleave', onLeave);
    },
  };
}
