<script lang="ts">
  // Re-created (via {#key}) whenever its inputs change; props are read once at setup.
  import { onMount } from 'svelte';
  import { jigsawTabs, type Difficulty } from '../lib/engine/difficulty';
  import * as J from '../lib/engine/jigsaw';
  import { createRng } from '../lib/engine/rng';
  import { svgPoint } from '../lib/panzoom';
  import { blankCells, type LoadedPuzzle } from '../lib/puzzle';
  import { click, tick } from '../lib/sound';

  let { puzzle, srcOf, n, difficulty, seed, paperSrc, onProgress, onWin, announce, notify }: {
    puzzle: LoadedPuzzle; srcOf: (id: number) => string; n: number; difficulty: Difficulty; seed: number; paperSrc: string;
    onProgress: (moves: number, placed: number, total: number) => void;
    onWin: (moves: number) => void; announce: (msg: string) => void; notify: (msg: string) => void;
  } = $props();

  const B = J.BOARD;
  const GAP = 50;
  const cell = B / n;
  const TRAY = 820;

  // Tray beside the board in landscape, below it in portrait.
  let landscape = $state(true);
  const trayRect = (land: boolean): J.Rect =>
    land ? { x: B + GAP, y: 0, w: TRAY, h: B } : { x: 0, y: B + GAP, w: B, h: TRAY };
  const content = () => (landscape ? { w: B + GAP + TRAY, h: B } : { w: B, h: B + GAP + TRAY });

  const rng = createRng(seed);
  const cells = puzzle.cells(n);
  let game = $state(J.create(n, J.buildPaths(n, rng, jigsawTabs(difficulty)), blankCells(cells), trayRect(true), rng));
  // One image pattern per picture in use.
  const srcs = $derived([...new Set(game.pieces.map((_, id) => srcOf(id)))]);
  let solved = $state(false);
  const uid = `jg${seed}`;

  let wrap: HTMLDivElement;
  let svg: SVGSVGElement;

  onMount(() => {
    const ro = new ResizeObserver(([e]) => {
      const land = e.contentRect.width / Math.max(e.contentRect.height, 1) > 1.15;
      if (land !== landscape) relayout(land);
    });
    landscape = wrap.clientWidth / Math.max(wrap.clientHeight, 1) > 1.15;
    if (!landscape) relayout(false, true);
    ro.observe(wrap);
    onProgress(0, J.placedCount(game), n * n);
    return () => ro.disconnect();
  });

  /** Re-tidy loose pieces into the new tray, keeping their reading order. */
  function relayout(land: boolean, _force = false) {
    landscape = land;
    const byPos = game.pieces
      .filter((p) => p.small)
      .map((p) => ({ id: p.id, c: J.visualCenter(game, p) }))
      .sort((a, b) => (Math.abs(a.c.y - b.c.y) > 20 ? a.c.y - b.c.y : a.c.x - b.c.x))
      .map((e) => e.id);
    game = J.arrangeTray(game, trayRect(land), byPos);
  }

  // Dragging
  let drag = $state<{ id: number; px: number; py: number; dx: number; dy: number; from: J.From } | null>(null);

  function grab(id: number, e: PointerEvent) {
    const p = game.pieces[id];
    if (solved) return;
    if (p.locked) { notify("This piece is missing from the historical map, so it's fixed in place."); return; }
    e.stopPropagation();
    e.preventDefault(); // no focus-scroll or text selection mid-drag
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const from = { dx: p.dx, dy: p.dy, small: p.small };
    // Tray pieces grow to full size when picked up, centered under the pointer.
    game = J.raise(J.toFull(game, id), id);
    if (p.small) {
      // Grow around the pointer: the spot you grabbed stays under your finger.
      const k = game.trayScale, hx = p.col * cell, hy = p.row * cell;
      const local = { x: hx + (pt.x - hx - p.dx) / k, y: hy + (pt.y - hy - p.dy) / k };
      game = J.setOffset(game, id, pt.x - local.x, pt.y - local.y);
    }
    const r = game.pieces[id];
    drag = { id, px: pt.x, py: pt.y, dx: r.dx, dy: r.dy, from };
  }
  function moveDrag(e: PointerEvent) {
    if (!drag) return;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    game = J.setOffset(game, drag.id, drag.dx + pt.x - drag.px, drag.dy + pt.y - drag.py);
  }
  function release() {
    if (!drag) return;
    const { id, from } = drag;
    drag = null;
    place(id, from);
  }

  /** Cell the dragged piece would click into (for the highlight). */
  const hoverCell = $derived.by(() => {
    if (!drag) return null;
    const p = game.pieces[drag.id];
    return J.cellAt(n, p.col * cell + p.dx + cell / 2, p.row * cell + p.dy + cell / 2);
  });

  function place(id: number, from: J.From) {
    const { state: next, result } = J.drop(game, id, from, trayRect(landscape));
    game = next;
    const placed = J.placedCount(game);
    onProgress(game.moves, placed, n * n);
    if (result === 'placed' || result === 'slotted' || result === 'swapped') { click(0.8); announce(`Piece clicked into a square. ${placed} of ${n * n} in the right place.`); }
    else if (result === 'returned') { tick(); announce('That square holds a fixed blank piece.'); }
    else if (result === 'toTray') { tick(); announce('Piece returned to the tray.'); }
    if (J.isSolved(game)) {
      solved = true;
      announce(`Solved in ${game.moves} moves!`);
      setTimeout(() => onWin(game.moves), 600);
    }
  }

  // Keyboard: arrows move the focused piece a square at a time, Enter clicks it in.
  let keyFrom: ({ id: number } & J.From) | null = null;
  function key(id: number, e: KeyboardEvent) {
    const p = game.pieces[id];
    if (p.locked || solved) return;
    const step = cell;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) {
      e.preventDefault();
      if (keyFrom?.id !== id) keyFrom = { id, dx: p.dx, dy: p.dy, small: p.small };
      game = J.raise(J.toFull(game, id), id);
      const q = game.pieces[id];
      game = J.setOffset(game, id, q.dx + d[0], q.dy + d[1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const from = keyFrom?.id === id ? keyFrom : { dx: p.dx, dy: p.dy, small: p.small };
      keyFrom = null;
      game = J.toFull(game, id);
      place(id, from);
    }
  }
</script>

<div class="wrap" bind:this={wrap}>
  <svg bind:this={svg} class="jigsaw" class:solved preserveAspectRatio="xMidYMid meet"
       viewBox="0 0 {content().w} {content().h}"
       role="application" aria-label="Jigsaw board. Drag pieces onto the board; they click into a square."
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
    <g class="slots" aria-hidden="true">
      {#each Array.from({ length: n - 1 }, (_, i) => (i + 1) * cell) as v}
        <line x1={v} y1="0" x2={v} y2={B} />
        <line x1="0" y1={v} x2={B} y2={v} />
      {/each}
    </g>
    {#if hoverCell !== null}
      <rect class="target" x={(hoverCell % n) * cell} y={Math.floor(hoverCell / n) * cell} width={cell} height={cell} />
    {/if}
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
        transform={p.small
          ? `translate(${p.col * cell + p.dx} ${p.row * cell + p.dy}) scale(${game.trayScale}) translate(${-p.col * cell} ${-p.row * cell})`
          : `translate(${p.dx} ${p.dy})`}
        tabindex={p.locked || solved ? -1 : 0}
        role="button"
        aria-label={p.locked ? `Piece ${id + 1}, blank, fixed in place` : `Piece ${id + 1}. Arrow keys move it a square at a time, Enter clicks it in.`}
        onpointerdown={(e) => grab(id, e)}
        onkeydown={(e) => key(id, e)}
        filter={drag?.id === id ? `url(#${uid}-lift)` : undefined}
      >
        <path d={p.path} fill="url(#{uid}-paper)" />
        <path d={p.path} fill="url(#{uid}-img{srcs.indexOf(srcOf(id))})" class="face" />
      </g>
    {/each}
  </svg>
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: 6px; width: 100%; height: 100%; min-height: 0; }
  .jigsaw { display: block; flex: 1; min-height: 0; width: 100%; touch-action: none; user-select: none; }
  .board-bg { fill: var(--slot); stroke: var(--board-edge); stroke-width: 4; }
  .slots line { stroke: rgb(255 245 225 / 0.12); stroke-width: 1.5; stroke-dasharray: 6 6; vector-effect: non-scaling-stroke; }
  .target { fill: rgb(255 240 200 / 0.14); stroke: var(--accent); stroke-width: 3; vector-effect: non-scaling-stroke; }
  .tray { fill: var(--surface-2); stroke: var(--line); stroke-width: 2; stroke-dasharray: 10 8; }
  .piece { cursor: grab; outline: none; }
  .piece.dragging { cursor: grabbing; }
  .piece.locked, .solved .piece { cursor: default; }
  .face { stroke: rgb(40 28 16 / 0.55); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .locked .face { stroke: rgb(40 28 16 / 0.18); }
  .solved .face { stroke: transparent; transition: stroke 0.6s; }
  .piece:focus-visible .face { stroke: var(--focus); stroke-width: 3; }
</style>
