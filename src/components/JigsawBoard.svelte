<script lang="ts">
  // Re-created (via {#key}) whenever its inputs change; props are read once at setup.
  import { onMount } from 'svelte';
  import { jigsawTabs, type Difficulty } from '../lib/engine/difficulty';
  import * as J from '../lib/engine/jigsaw';
  import { createRng } from '../lib/engine/rng';
  import { createMover, grabbedAt, liftOffset, offsetFor, startLift, type Lift, type Pt } from '../lib/lift';
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

  // Dragging: the piece moves in its own layer (see lib/lift.ts).
  let lift = $state<Lift | null>(null);
  let liftFrom: J.From | null = null;
  let settling = false;
  let hoverCell = $state<number | null>(null);
  let layer = $state<HTMLDivElement>();
  let layerInner = $state<HTMLDivElement>();
  const mover = createMover(() => svg, () => layer, () => layerInner);
  const home = (p: J.Piece) => ({ x: p.col * cell, y: p.row * cell });
  const onBoard = (pt: Pt) => pt.x >= 0 && pt.y >= 0 && pt.x <= B && pt.y <= B;
  const inTray = (pt: Pt) => {
    const t = trayRect(landscape);
    return pt.x >= t.x && pt.y >= t.y && pt.x <= t.x + t.w && pt.y <= t.y + t.h;
  };
  /** Full size over the board, tray size over the tray, unchanged elsewhere. */
  const scaleAt = (pt: Pt, k: number) => (onBoard(pt) ? 1 : inTray(pt) ? game.trayScale : k);

  function grab(id: number, e: PointerEvent) {
    const p = game.pieces[id];
    if (solved) return;
    if (p.locked) { notify("This piece is missing from the historical map, so it's fixed in place."); return; }
    e.stopPropagation();
    e.preventDefault(); // no focus-scroll or text selection mid-drag
    settling = false;
    svg.setPointerCapture(e.pointerId);
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const k = p.small ? game.trayScale : 1, h = home(p);
    const local = { x: h.x + (pt.x - h.x - p.dx) / k, y: h.y + (pt.y - h.y - p.dy) / k };
    liftFrom = { dx: p.dx, dy: p.dy, small: p.small };
    game = J.raise(game, id);
    lift = startLift(svg, wrap, e, id, local, k);
    let scale = k;
    mover.begin(lift, (at) => {
      scale = scaleAt(at, scale);
      const c = { x: at.x - lift!.local.x + h.x + cell / 2, y: at.y - lift!.local.y + h.y + cell / 2 };
      const next = scale === 1 ? J.cellAt(n, c.x, c.y) : null;
      if (next !== hoverCell) hoverCell = next;
      return scale;
    });
  }
  function moveDrag(e: PointerEvent) {
    if (lift && !settling) mover.move(e);
  }
  function release(e: PointerEvent) {
    if (!lift || settling || !liftFrom) return;
    const l = lift, id = l.id, from = liftFrom;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const k = scaleAt(pt, mover.end());
    const p = game.pieces[id], h = home(p);
    game = { ...game, pieces: game.pieces.map((q) => (q.id === id ? { ...q, ...offsetFor(l, h, pt, k), small: k !== 1 } : q)) };
    hoverCell = null;
    place(id, from);
    const q = game.pieces[id], kf = q.small ? game.trayScale : 1;
    settling = true;
    mover.settle(grabbedAt(l, h, q.dx, q.dy, kf), kf, finishSettle);
  }
  function finishSettle() {
    settling = false;
    lift = null;
    liftFrom = null;
  }

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
        class:lifted={lift?.id === id}
        transform={p.small
          ? `translate(${p.col * cell + p.dx} ${p.row * cell + p.dy}) scale(${game.trayScale}) translate(${-p.col * cell} ${-p.row * cell})`
          : `translate(${p.dx} ${p.dy})`}
        tabindex={p.locked || solved ? -1 : 0}
        role="button"
        aria-label={p.locked ? `Piece ${id + 1}, blank, fixed in place` : `Piece ${id + 1}. Arrow keys move it a square at a time, Enter clicks it in.`}
        onpointerdown={(e) => grab(id, e)}
        onkeydown={(e) => key(id, e)}
      >
        <path d={p.path} fill="url(#{uid}-paper)" />
        <path d={p.path} fill="url(#{uid}-img{srcs.indexOf(srcOf(id))})" class="face" />
      </g>
    {/each}
  </svg>
  {#if lift}
    {@const p = game.pieces[lift.id]}
    {@const o = liftOffset(lift)}
    <div class="lift" bind:this={layer} aria-hidden="true"
         style:left="{lift.box.left}px" style:top="{lift.box.top}px" style:width="{lift.box.width}px" style:height="{lift.box.height}px">
      <div class="lift-inner" bind:this={layerInner}
           style:transform-origin="{lift.origin.x}px {lift.origin.y}px"
           style:transform="scale({lift.scale})">
        <svg viewBox={lift.viewBox} preserveAspectRatio="xMidYMid meet">
          <g transform="translate({o.x} {o.y})">
            <path d={p.path} fill="url(#{uid}-paper)" />
            <path d={p.path} fill="url(#{uid}-img{srcs.indexOf(srcOf(lift.id))})" class="face" />
          </g>
        </svg>
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; overflow: clip; display: flex; flex-direction: column; gap: 6px; width: 100%; height: 100%; min-height: 0; }
  .jigsaw { display: block; flex: 1; min-height: 0; width: 100%; touch-action: none; user-select: none; }
  .board-bg { fill: var(--slot); stroke: var(--board-edge); stroke-width: 4; }
  .slots line { stroke: rgb(255 245 225 / 0.12); stroke-width: 1.5; stroke-dasharray: 6 6; vector-effect: non-scaling-stroke; }
  .target { fill: rgb(255 240 200 / 0.14); stroke: var(--accent); stroke-width: 3; vector-effect: non-scaling-stroke; }
  .tray { fill: var(--surface-2); stroke: var(--line); stroke-width: 2; stroke-dasharray: 10 8; }
  .piece { cursor: grab; outline: none; }
  .piece.lifted { opacity: 0; }
  .lift { position: absolute; z-index: 1; pointer-events: none; will-change: transform; }
  .lift-inner { width: 100%; height: 100%; will-change: transform; transition: transform 0.18s ease-out; filter: drop-shadow(2px 4px 4px rgb(0 0 0 / 0.4)); }
  .lift svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .piece.locked, .solved .piece { cursor: default; }
  .face { stroke: rgb(40 28 16 / 0.55); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .locked .face { stroke: rgb(40 28 16 / 0.18); }
  .solved .face { stroke: transparent; transition: stroke 0.6s; }
  .piece:focus-visible .face { stroke: var(--focus); stroke-width: 3; }
</style>
