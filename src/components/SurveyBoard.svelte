<script lang="ts">
  // Survey mode: pieces are real survey units (townships, half / quarter townships).
  // Re-created (via {#key}) whenever its inputs change; props are read once at setup.
  import { onMount } from 'svelte';
  import { BLANK } from '../lib/analysis';
  import { createRng } from '../lib/engine/rng';
  import * as S from '../lib/engine/survey';
  import { svgPoint } from '../lib/panzoom';
  import type { LoadedPuzzle } from '../lib/puzzle';
  import { click, tick } from '../lib/sound';

  let { puzzle, srcOf, data, unit, seed, paperSrc, onProgress, onWin, announce, notify }: {
    puzzle: LoadedPuzzle; srcOf: (id: number) => string; data: S.SurveyPieceData[]; unit: string; seed: number; paperSrc: string;
    onProgress: (moves: number, placed: number, total: number) => void;
    onWin: (moves: number) => void; announce: (msg: string) => void; notify: (msg: string) => void;
  } = $props();

  const B = S.BOARD;
  const GAP = 50;
  const TRAY = 820;
  const total = data.length;

  let landscape = $state(true);
  const trayRect = (land: boolean): S.Rect =>
    land ? { x: B + GAP, y: 0, w: TRAY, h: B } : { x: 0, y: B + GAP, w: B, h: TRAY };
  const content = () => (landscape ? { w: B + GAP + TRAY, h: B } : { w: B, h: B + GAP + TRAY });

  // Pieces that are entirely missing from the historical map start in place, fixed.
  const missing = puzzle.missing(data.map((d) => d.path));
  const locked = new Set(missing.flatMap((m, i) => (m >= BLANK ? [i] : [])));
  let game = $state(S.create(data, locked, trayRect(true), createRng(seed)));
  // One image pattern per picture in use.
  const srcs = $derived([...new Set(game.pieces.map((_, id) => srcOf(id)))]);
  let solved = $state(false);
  const uid = `sv${seed}`;

  let wrap: HTMLDivElement;
  let svg: SVGSVGElement;

  onMount(() => {
    const ro = new ResizeObserver(([e]) => {
      const land = e.contentRect.width / Math.max(e.contentRect.height, 1) > 1.15;
      if (land !== landscape) relayout(land);
    });
    landscape = wrap.clientWidth / Math.max(wrap.clientHeight, 1) > 1.15;
    if (!landscape) relayout(false);
    ro.observe(wrap);
    onProgress(0, S.placedCount(game), total);
    return () => ro.disconnect();
  });

  /** Re-pack loose pieces into the new tray shape. */
  function relayout(land: boolean) {
    landscape = land;
    game = S.arrangeTray(game, trayRect(land));
  }

  let drag = $state<{ id: number; px: number; py: number; dx: number; dy: number; from: S.From } | null>(null);

  function grab(id: number, e: PointerEvent) {
    const p = game.pieces[id];
    if (solved) return;
    if (p.locked) { notify("This piece is missing from the historical map, so it's fixed in place."); return; }
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const from = { dx: p.dx, dy: p.dy, small: p.small };
    game = S.raise(S.toFull(game, id), id);
    if (p.small) {
      // Grow around the pointer: the spot you grabbed stays under your finger.
      const k = game.trayScale, hx = p.bbox[0], hy = p.bbox[1];
      const local = { x: hx + (pt.x - hx - p.dx) / k, y: hy + (pt.y - hy - p.dy) / k };
      game = S.setOffset(game, id, pt.x - local.x, pt.y - local.y);
    }
    const r = game.pieces[id];
    drag = { id, px: pt.x, py: pt.y, dx: r.dx, dy: r.dy, from };
  }
  // The place under the pointer while dragging, outlined like the jigsaw's target square.
  let slotEls: SVGPathElement[] = $state([]);
  let hoverSlot = $state<number | null>(null);
  function slotAt(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x > B || y > B) return null;
    const p = new DOMPoint(x, y);
    const i = slotEls.findIndex((el) => el?.isPointInFill(p));
    return i >= 0 ? i : null;
  }
  function moveDrag(e: PointerEvent) {
    if (!drag) return;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    game = S.setOffset(game, drag.id, drag.dx + pt.x - drag.px, drag.dy + pt.y - drag.py);
    hoverSlot = slotAt(pt.x, pt.y);
  }
  function release(e: PointerEvent) {
    if (!drag) return;
    const { id, from } = drag;
    drag = null;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    place(id, from, pt, slotAt(pt.x, pt.y));
    hoverSlot = null;
  }

  function place(id: number, from: S.From, pointer?: { x: number; y: number }, slot?: number | null) {
    const { state: next, result } = S.drop(game, id, from, trayRect(landscape), pointer, slot);
    game = next;
    const placed = S.placedCount(game);
    onProgress(game.moves, placed, total);
    if (result === 'placed') { click(0.9); announce(`Piece clicked into place. ${placed} of ${total}.`); }
    // Wrong spot: soft tick and a screen-reader message.
    else if (result === 'wrong') { tick(); announce('Not that place; the piece went back to the tray.'); }
    else if (result === 'toTray') { tick(); announce('Piece returned to the tray.'); }
    if (S.isSolved(game)) {
      solved = true;
      announce(`Solved in ${game.moves} moves!`);
      setTimeout(() => onWin(game.moves), 600);
    }
  }

  // Keyboard: arrows move the focused piece, Enter drops it.
  let keyFrom: ({ id: number } & S.From) | null = null;
  function key(id: number, e: KeyboardEvent) {
    const p = game.pieces[id];
    if (p.locked || solved) return;
    const step = 25;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) {
      e.preventDefault();
      if (keyFrom?.id !== id) keyFrom = { id, dx: p.dx, dy: p.dy, small: p.small };
      game = S.raise(S.toFull(game, id), id);
      const q = game.pieces[id];
      game = S.setOffset(game, id, q.dx + d[0], q.dy + d[1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const from = keyFrom?.id === id ? keyFrom : { dx: p.dx, dy: p.dy, small: p.small };
      keyFrom = null;
      game = S.toFull(game, id);
      place(id, from);
    }
  }

  const transform = (p: S.SurveyPiece) =>
    p.small
      ? `translate(${p.bbox[0] + p.dx} ${p.bbox[1] + p.dy}) scale(${game.trayScale}) translate(${-p.bbox[0]} ${-p.bbox[1]})`
      : `translate(${p.dx} ${p.dy})`;
</script>

<div class="wrap" bind:this={wrap}>
  <svg bind:this={svg} class="survey" class:solved preserveAspectRatio="xMidYMid meet"
       viewBox="0 0 {content().w} {content().h}"
       role="application" aria-label="Survey board: drag each {unit.replace(/s$/, '')} to its place on the board."
       onpointermove={moveDrag} onpointerup={release} onpointercancel={release}>
    <defs>
      {#each srcs as s, k (s)}
        <pattern id="{uid}-img{k}" patternUnits="userSpaceOnUse" width={B} height={B}>
          <image href={s} width={B} height={B} preserveAspectRatio="none" />
        </pattern>
      {/each}
      <pattern id="{uid}-paper" patternUnits="userSpaceOnUse" width="200" height="200">
        <image href={paperSrc} width="200" height="200" />
      </pattern>
      <filter id="{uid}-lift" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="3" dy="5" stdDeviation="4" flood-opacity="0.45" />
      </filter>
    </defs>

    <rect class="board-bg" x="0" y="0" width={B} height={B} />
    <!-- The survey lines themselves: each piece's place on the board. -->
    <g class="slots" aria-hidden="true">
      {#each data as d, i}<path d={d.path} bind:this={slotEls[i]} />{/each}
    </g>
    {#if landscape}
      <rect class="tray" x={B + GAP / 2} y="0" width={TRAY + GAP / 2} height={B} rx="16" />
    {:else}
      <rect class="tray" x="0" y={B + GAP / 2} width={B} height={TRAY + GAP / 2} rx="16" />
    {/if}

    {#each game.order as id (id)}
      {@const p = game.pieces[id]}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        data-piece={p.locked ? undefined : ''}
        class="piece"
        class:placed={p.placed}
        class:locked={p.locked}
        class:dragging={drag?.id === id}
        transform={transform(p)}
        tabindex={p.locked || solved ? -1 : 0}
        role="button"
        aria-label={p.locked ? `Piece ${id + 1}, blank, fixed in place` : `Piece ${id + 1}. Arrow keys move it, Enter drops it.`}
        onpointerdown={(e) => grab(id, e)}
        onkeydown={(e) => key(id, e)}
        filter={drag?.id === id ? `url(#${uid}-lift)` : undefined}
      >
        <path d={p.path} fill="url(#{uid}-paper)" />
        <path d={p.path} fill="url(#{uid}-img{srcs.indexOf(srcOf(id))})" class="face" />
      </g>
    {/each}
    <!-- Outline of the place the piece will drop into, drawn on top. -->
    {#if hoverSlot !== null}
      <path class="target" d={data[hoverSlot].path} aria-hidden="true" />
    {/if}
  </svg>
</div>

<style>
  .wrap { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
  .survey { display: block; flex: 1; min-height: 0; width: 100%; touch-action: none; user-select: none; }
  .board-bg { fill: var(--slot); stroke: var(--board-edge); stroke-width: 4; }
  .slots path { fill: none; stroke: rgb(255 245 225 / 0.28); stroke-width: 1.5; stroke-dasharray: 7 6; vector-effect: non-scaling-stroke; }
  .target { fill: rgb(255 240 200 / 0.14); stroke: var(--accent); stroke-width: 3; vector-effect: non-scaling-stroke; pointer-events: none; }
  .tray { fill: var(--surface-2); stroke: var(--line); stroke-width: 2; stroke-dasharray: 10 8; }
  .piece { cursor: grab; outline: none; }
  .piece.dragging { cursor: grabbing; }
  .piece.locked, .solved .piece { cursor: default; }
  .face { stroke: rgb(40 28 16 / 0.55); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .locked .face, .placed .face { stroke: rgb(40 28 16 / 0.18); }
  .solved .face { stroke: transparent; transition: stroke 0.6s; }
  .piece:focus-visible .face { stroke: var(--focus); stroke-width: 3; }
</style>
