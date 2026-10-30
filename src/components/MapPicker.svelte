<script lang="ts">
  import { onMount } from 'svelte';
  import { assetUrl, formatCoords, MAP_VIEWS, viewUrl, type Manifest, type MapView, type Square } from '../lib/catalog';
  import { DIFFICULTIES, MODES, type Difficulty, type Mode } from '../lib/engine/difficulty';
  import { panZoom, type PanZoom } from '../lib/panzoom';
  import Choice from './Choice.svelte';
  import SidePanel from './SidePanel.svelte';

  let {
    manifest, mode = $bindable(), difficulty = $bindable(), selected = $bindable(null), soundOn = $bindable(true), view = $bindable('historical'),
    onPlay, onRandom, onAbout,
  }: {
    manifest: Manifest; mode: Mode; difficulty: Difficulty; selected: Square | null; soundOn: boolean; view: MapView;
    onPlay: (sq: Square) => void; onRandom: () => void; onAbout: () => void;
  } = $props();

  const W = manifest.overview.width;
  const H = manifest.overview.height;
  const cw = W / manifest.cols;
  const ch = H / manifest.rows;
  const byCell = new Map(manifest.squares.map((s) => [`${s.col},${s.row}`, s]));

  let svg: SVGSVGElement;
  let pz: PanZoom;
  let hover = $state<Square | null>(null);
  const overviewSrc = $derived(assetUrl(view === 'present' && manifest.present ? manifest.present.overview : manifest.overview.file));

  function squareNear(x: number, y: number, reach = 1.6): Square | null {
    const c = Math.floor(x / cw), r = Math.floor(y / ch);
    const exact = byCell.get(`${c},${r}`);
    if (exact) return exact;
    let best: Square | null = null, bestD = reach;
    for (const s of manifest.squares) {
      const d = Math.hypot(s.col + 0.5 - x / cw, s.row + 0.5 - y / ch);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  onMount(() => {
    // Start zoomed to the playable squares.
    const c0 = Math.min(...manifest.squares.map((s) => s.col)), c1 = Math.max(...manifest.squares.map((s) => s.col)) + 1;
    const r0 = Math.min(...manifest.squares.map((s) => s.row)), r1 = Math.max(...manifest.squares.map((s) => s.row)) + 1;
    const home = { x: (c0 - 0.5) * cw, y: (r0 - 0.5) * ch, w: (c1 - c0 + 1) * cw, h: (r1 - r0 + 1) * ch };
    pz = panZoom(svg, {
      content: () => ({ w: W, h: H }),
      home: () => home,
      maxZoom: 8,
      onTap: ({ x, y }) => {
        const s = squareNear(x, y);
        if (s && selected?.id === s.id) onPlay(s);
        else selected = s;
      },
      onHover: (p) => (hover = p ? squareNear(p.x, p.y, 0.01) : null),
    });
    return () => pz.destroy();
  });

  function onKey(e: KeyboardEvent) {
    // Arrow keys move the selection between playable squares.
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === 'Enter' && selected) return onPlay(selected);
    if (!d) return;
    e.preventDefault();
    const start = selected ?? manifest.squares[Math.floor(manifest.squares.length / 2)];
    for (let k = 1; k < Math.max(manifest.cols, manifest.rows); k++) {
      const s = byCell.get(`${start.col + d[0] * k},${start.row + d[1] * k}`);
      if (s) { selected = s; return; }
    }
  }
</script>

<SidePanel bind:soundOn onHome={() => (selected = null)} {onAbout} credit={manifest.present?.attribution}>
  {#snippet side()}
    <div class="intro">
      <h1>Pick a place</h1>
      <p>Tap a highlighted square on the map to choose where your puzzle comes from.</p>
    </div>

    <div class="group">
      <Choice label="Puzzle type" options={MODES.map((m) => ({ id: m.id, label: m.label, title: m.blurb }))} bind:value={mode} />
      <Choice label="Difficulty" options={DIFFICULTIES} bind:value={difficulty} />
      {#if manifest.present}
        <Choice label="Map" options={MAP_VIEWS} bind:value={view} />
      {/if}
    </div>

    <div class="choice-panel" aria-live="polite">
      {#if selected}
        <div class="sel">
          {#if view === 'mixed'}
            <!-- Mixed: historical on one side of the diagonal, present-day on the other. -->
            <div class="thumb mixed" role="img" aria-label="Preview of the selected map square, half historical and half present-day">
              <img src={viewUrl(selected, 256, 'historical')} alt="" width="256" height="256" />
              <img class="pres" src={viewUrl(selected, 256, 'present')} alt="" width="256" height="256" />
            </div>
          {:else}
            <img class="thumb" src={viewUrl(selected, 256, view)} alt="Preview of the selected map square" width="256" height="256" />
          {/if}
          <div class="meta">
            <h2>{formatCoords(selected)}</h2>
            <p>{Math.round(selected.coverage * 100)}% of this square survives in the mosaic.</p>
          </div>
        </div>
        <button class="btn primary" onclick={() => onPlay(selected!)}>Play {MODES.find((m) => m.id === mode)?.label}</button>
      {/if}
      <button class="btn" onclick={onRandom}>Random puzzle</button>
    </div>
  {/snippet}

  <div class="map-wrap">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svg}
      class="map"
      role="application"
      aria-label="Map of Florida. Playable squares are highlighted. Use arrow keys to choose a square and Enter to play."
      tabindex="0"
      onkeydown={onKey}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id="playable">
          {#each manifest.squares as s (s.id)}
            <rect x={s.col * cw} y={s.row * ch} width={cw} height={ch} />
          {/each}
        </clipPath>
      </defs>
      <image href={overviewSrc} width={W} height={H} class="dim" class:present={view === 'present'} />
      <image href={overviewSrc} width={W} height={H} clip-path="url(#playable)" />
      <g class="cells">
        {#each manifest.squares as s (s.id)}
          <rect x={s.col * cw} y={s.row * ch} width={cw} height={ch} />
        {/each}
      </g>
      {#if hover && hover.id !== selected?.id}
        <rect class="hover" x={hover.col * cw} y={hover.row * ch} width={cw} height={ch} />
      {/if}
      {#if selected}
        <rect class="selected" x={selected.col * cw} y={selected.row * ch} width={cw} height={ch} />
      {/if}
    </svg>
  </div>
</SidePanel>

<style>
  .intro h1 { font-size: 1.35rem; }
  .intro p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.9rem; }
  .group { display: flex; flex-direction: column; gap: 0.5rem; }
  .group :global(.choice) { display: flex; width: 100%; }
  .group :global(.choice span) { padding: 0 0.45rem; font-size: 0.9rem; }
  .choice-panel { display: flex; flex-direction: column; gap: 0.6rem; }
  .sel { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.6rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  /* Preview shrinks on shorter screens so the credit stays visible. */
  .thumb { width: min(100%, max(96px, calc(100cqh - 625px))); align-self: center; height: auto; aspect-ratio: 1; border-radius: 8px; background: var(--paper); background-image: var(--paper-url); background-size: 128px; }
  .thumb.mixed { position: relative; overflow: hidden; }
  .thumb.mixed img { position: absolute; inset: 0; width: 100%; height: 100%; }
  .thumb.mixed .pres { clip-path: polygon(100% 0, 100% 100%, 0 100%); }
  .meta h2 { font-size: 1.15rem; }
  .meta p { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.88rem; }

  .map-wrap {
    position: relative; flex: 1; min-height: 0; border-radius: var(--radius); overflow: hidden;
    background: var(--surface-2); border: 1px solid var(--line);
  }
  .map { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: none; cursor: pointer; user-select: none; }
  .map:focus-visible { outline-offset: -3px; }
  .dim { opacity: 0.22; filter: grayscale(0.7); }
  .dim.present { opacity: 0.4; filter: grayscale(0.5); }
  .cells rect { fill: transparent; stroke: rgb(255 250 235 / 0.55); stroke-width: 0.8; }
  .hover { fill: rgb(255 255 255 / 0.18); stroke: var(--ink); stroke-width: 2; }
  .selected { fill: none; stroke: var(--accent); stroke-width: 4; filter: drop-shadow(0 0 3px rgb(0 0 0 / 0.5)); }
  @media (prefers-color-scheme: dark) { .dim { opacity: 0.18; } }

  @media (max-width: 760px) {
    .intro h1 { font-size: 1.15rem; }
    .group { flex-direction: row; flex-wrap: wrap; }
    .group :global(.choice) { flex: 1 1 260px; }
    .sel { flex-direction: row; align-items: center; }
    .thumb { width: 88px; }
    .map-wrap { flex: none; height: 62svh; min-height: 320px; }
  }
</style>
