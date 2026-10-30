<script lang="ts">
  import { assetUrl, formatCoords, loadSurvey, MAP_VIEWS, type Manifest, type MapView, type Square } from '../lib/catalog';
  import { DIFFICULTIES, GRID, HOW_TO, MODES, SURVEY_UNIT, type Difficulty, type Mode } from '../lib/engine/difficulty';
  import { randomSeed } from '../lib/engine/rng';
  import { loadPuzzle, type LoadedPuzzle } from '../lib/puzzle';
  import { chime } from '../lib/sound';
  import Choice from './Choice.svelte';
  import CompareSlider from './CompareSlider.svelte';
  import Dialog from './Dialog.svelte';
  import JigsawBoard from './JigsawBoard.svelte';
  import MiniMap from './MiniMap.svelte';
  import RotateBoard from './RotateBoard.svelte';
  import SidePanel from './SidePanel.svelte';
  import SlideBoard from './SlideBoard.svelte';
  import SurveyBoard from './SurveyBoard.svelte';

  let { manifest, square, mode = $bindable(), difficulty = $bindable(), soundOn = $bindable(true), view = $bindable('historical'), onMap, onRandom, onAbout, announce }: {
    manifest: Manifest; square: Square; mode: Mode; difficulty: Difficulty; soundOn: boolean; view: MapView;
    onMap: () => void; onRandom: () => void; onAbout: () => void; announce: (msg: string) => void;
  } = $props();

  const n = $derived(GRID[mode][difficulty]);
  const paperSrc = assetUrl('paper.webp');
  const paperUrl = `url(${paperSrc})`;

  let puzzle = $state<LoadedPuzzle | null>(null);
  let error = $state('');
  let seed = $state(randomSeed());
  let moves = $state(0);
  let placed = $state<[number, number] | null>(null);
  let won = $state(false);
  let showPicture = $state(false);

  $effect(() => {
    const sq = square;
    puzzle = null;
    error = '';
    loadPuzzle(manifest, sq).then((p) => { if (sq === square) puzzle = p; }).catch((e) => (error = String(e)));
  });

  function restart() {
    seed = randomSeed();
    moves = 0;
    placed = null;
    won = false;
  }

  // Restart whenever the square, mode or difficulty changes.
  $effect(() => { void square; void mode; void difficulty; restart(); });

  const progress = (m: number, p?: number, total?: number) => {
    moves = m;
    if (p !== undefined && total !== undefined) placed = [p, total];
  };
  // Settings for the next puzzle, chosen in the win dialog (start as the current ones).
  let nextMode = $state<Mode>('rotate');
  let nextDifficulty = $state<Difficulty>('easy');
  const win = (m: number) => {
    moves = m;
    nextMode = mode;
    nextDifficulty = difficulty;
    won = true;
    chime();
  };
  const applyNext = () => {
    won = false;
    mode = nextMode;
    difficulty = nextDifficulty;
  };
  // Present-day imagery: available once the puzzle has loaded it.
  const presentOk = $derived(!!manifest.present && (!puzzle || !!puzzle.presentUrl));
  $effect(() => {
    if (puzzle && view !== 'historical' && !puzzle.presentUrl) {
      view = 'historical';
      notify("Present-day imagery isn't available for this square right now.");
    }
  });
  // Reference image: start the comparison divider on the side matching the current view.
  let refPos = $state(100);
  $effect(() => { refPos = view === 'present' ? 0 : view === 'mixed' ? 50 : 100; });

  // Short notice shown over the puzzle (e.g. when a fixed piece is clicked).
  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(msg: string) {
    clearTimeout(toastTimer);
    toast = msg;
    toastTimer = setTimeout(() => (toast = ''), 2800);
  }

  const modeLabel = $derived(MODES.find((m) => m.id === mode)!.label);
  const diffLabel = $derived(DIFFICULTIES.find((d) => d.id === difficulty)!.label);
</script>

<SidePanel bind:soundOn onHome={onMap} {onAbout} credit={manifest.present?.attribution}>
  {#snippet side()}
    <div class="title">
      <h1>{formatCoords(square)}</h1>
      <p>{modeLabel} · {diffLabel} · {mode === 'survey' ? SURVEY_UNIT[difficulty] : `${n}×${n}`}</p>
    </div>

    <div class="group">
      <Choice label="Puzzle type" options={MODES.map((m) => ({ id: m.id, label: m.label, title: m.blurb }))} bind:value={mode} />
      <Choice label="Difficulty" options={DIFFICULTIES} bind:value={difficulty} />
      {#if manifest.present}
        <Choice label="Map" options={MAP_VIEWS.map((v) => ({ ...v, disabled: v.id !== 'historical' && !presentOk }))} bind:value={view} />
      {/if}
    </div>

    <p class="how">{HOW_TO[mode]}</p>

    <div class="stats-row">
      <div class="stats" aria-live="off">
        <span><strong>{moves}</strong> {moves === 1 ? 'move' : 'moves'}</span>
        {#if placed}<span><strong>{placed[0]}</strong>/{placed[1]} placed</span>{/if}
      </div>
      <button class="btn" onclick={restart} title="Reshuffle this puzzle">Restart</button>
    </div>

    <div class="ref">
      <button class="btn ref-toggle" aria-expanded={showPicture} aria-controls="ref-image" onclick={() => (showPicture = !showPicture)}>
        <span>Reference Image</span><span class="chev" aria-hidden="true">▾</span>
      </button>
      {#if showPicture}
        <div id="ref-image" class="ref-body">
          {#if puzzle?.presentUrl}
            <CompareSlider historical={puzzle.url} present={puzzle.presentUrl} bind:pos={refPos} {paperUrl} compact />
          {:else if puzzle}
            <img src={puzzle.url} alt="Finished puzzle for reference" style:background-image={paperUrl} />
          {:else}
            <div class="ref-placeholder" aria-busy="true"></div>
          {/if}
        </div>
      {/if}
    </div>

    <nav class="next" aria-label="Next puzzle">
      <button class="btn primary" onclick={onRandom} title="Random place, same settings">New puzzle</button>
      <button class="btn" onclick={onMap} title="Pick a place, same settings">Choose on map</button>
    </nav>
  {/snippet}

  <section class="stage" class:jigsaw={mode === 'jigsaw' || mode === 'survey'}>
    {#if error}
      <p class="msg">Couldn't load this puzzle ({error}). <button class="btn" onclick={onMap}>Choose on map</button></p>
    {:else if !puzzle}
      <div class="loading" aria-busy="true"><div class="spinner"></div><span>Unrolling the plat…</span></div>
    {:else}
      {#key `${seed}-${mode}-${n}`}
        <div class="board-box">
          {#if mode === 'slide'}
            <SlideBoard {puzzle} srcOf={puzzle.srcOf(view, seed, n * n)} {n} {seed} {paperUrl} onProgress={progress} onWin={win} {announce} />
          {:else if mode === 'rotate'}
            <RotateBoard {puzzle} srcOf={puzzle.srcOf(view, seed, n * n)} {n} {seed} {paperUrl} onProgress={progress} onWin={win} {announce} {notify} />
          {:else if mode === 'jigsaw'}
            <JigsawBoard {puzzle} srcOf={puzzle.srcOf(view, seed, n * n)} {n} {difficulty} {seed} {paperSrc} onProgress={progress} onWin={win} {announce} {notify} />
          {:else if mode === 'survey'}
            {#await loadSurvey(square)}
              <div class="loading" aria-busy="true"><div class="spinner"></div><span>Fetching the survey lines…</span></div>
            {:then levels}
              <SurveyBoard {puzzle} srcOf={puzzle.srcOf(view, seed, levels[difficulty].length)} data={levels[difficulty]} unit={SURVEY_UNIT[difficulty]} {seed} {paperSrc} onProgress={progress} onWin={win} {announce} {notify} />
            {:catch err}
              <p class="msg">Couldn't load the survey pieces ({err}).</p>
            {/await}
          {/if}
        </div>
      {/key}
    {/if}
    {#if toast}
      <div class="toast" role="status" aria-live="polite">{toast}</div>
    {/if}
  </section>
</SidePanel>

<Dialog bind:open={won} label="Puzzle solved" wide>
  <div class="win">
    <h2>Solved!</h2>
    <p class="sub">{modeLabel} · {diffLabel} in <strong>{moves}</strong> {moves === 1 ? 'move' : 'moves'}</p>
    <div class="win-grid">
      {#if puzzle?.presentUrl}
        <div class="full-cmp"><CompareSlider historical={puzzle.url} present={puzzle.presentUrl} {paperUrl} /></div>
      {:else if puzzle}<img class="full" src={puzzle.url} alt="The completed map square" style:background-image={paperUrl} />{/if}
      <div class="where">
        <MiniMap {manifest} {square} />
        <p><strong>{formatCoords(square)}</strong><br />A 20 km square of the GLO survey plats.</p>
      </div>
    </div>
    <div class="win-settings">
      <p>Next puzzle settings:</p>
      <Choice label="Puzzle type for the next puzzle" options={MODES.map((m) => ({ id: m.id, label: m.label }))} bind:value={nextMode} />
      <Choice label="Difficulty for the next puzzle" options={DIFFICULTIES} bind:value={nextDifficulty} />
    </div>
    <div class="win-actions">
      <button class="btn" onclick={() => { applyNext(); restart(); }}>Same place</button>
      <button class="btn" onclick={() => { applyNext(); onMap(); }}>Choose on map</button>
      <button class="btn primary" onclick={() => { applyNext(); onRandom(); }}>New puzzle</button>
    </div>
  </div>
</Dialog>

<style>
  .title h1 { font-size: 1.35rem; }
  .title p { margin: 0.15rem 0 0; color: var(--muted); font-size: 0.9rem; }
  .group { display: flex; flex-direction: column; gap: 0.5rem; }
  .group :global(.choice) { display: flex; width: 100%; }
  .group :global(.choice span) { min-height: 34px; padding: 0 0.45rem; font-size: 0.9rem; }
  .how { margin: 0; color: var(--muted); font-size: 0.85rem; line-height: 1.4; }
  .stats-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .stats { display: flex; flex-wrap: wrap; gap: 0 0.9rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .stats strong { color: var(--ink); font-size: 1.1rem; }

  .ref { display: flex; flex-direction: column; gap: 0.5rem; }
  .ref-toggle { justify-content: space-between; width: 100%; }
  .chev { transition: transform 0.2s; }
  .ref-toggle[aria-expanded='true'] .chev { transform: rotate(180deg); }
  .ref-body { display: flex; justify-content: center; padding: 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); animation: open 0.2s ease-out; }
  @keyframes open { from { opacity: 0; transform: translateY(-4px); } }
  /* Reference image shrinks to whatever height the panel has left, so the credit stays visible. */
  .ref-body img, .full { display: block; width: 100%; height: auto; aspect-ratio: 1; border-radius: 6px; background-color: var(--paper); background-size: 128px; }
  .ref-body img { max-height: max(72px, calc(100cqh - 665px)); width: auto; max-width: 100%; }
  .ref-body :global(.cmp-wrap) { width: min(100%, max(72px, calc(100cqh - 665px))); margin: 0 auto; }
  .full-cmp { min-width: 0; }
  .ref-placeholder { aspect-ratio: 1; border-radius: 6px; background: var(--surface-2); }

  .next { display: flex; gap: 0.5rem; }
  .next .btn { flex: 1; padding: 0 0.6rem; }

  /* Puzzle area on the right: as big as fits in the remaining space. */
  .stage { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; container-type: size; }
  .toast {
    position: absolute; left: 50%; top: 14px; transform: translateX(-50%); z-index: 10;
    max-width: min(90%, 420px); padding: 0.6rem 1rem; border-radius: 10px;
    background: var(--ink); color: var(--bg); font-size: 0.92rem; text-align: center;
    box-shadow: var(--shadow); pointer-events: none; animation: toast-in 0.18s ease-out;
  }
  @keyframes toast-in { from { opacity: 0; transform: translate(-50%, -6px); } }
  .board-box { width: min(100cqw, 100cqh); }
  .stage.jigsaw .board-box { width: 100%; height: 100%; }

  .loading { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; color: var(--muted); }
  .spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--accent); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .msg { text-align: center; }

  .win h2 { font-size: 1.8rem; }
  .sub { margin: 0.25rem 0 1rem; color: var(--muted); }
  .win-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1rem; align-items: start; }
  .where p { margin: 0.5rem 0 0; font-size: 0.9rem; color: var(--muted); }
  .where strong { color: var(--ink); }
  .win-settings { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 1rem; }
  .win-settings p { margin: 0; width: 100%; color: var(--muted); font-size: 0.9rem; }
  .win-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }

  @media (max-width: 760px) {
    .title h1 { font-size: 1.15rem; }
    .group { flex-direction: row; flex-wrap: wrap; }
    .group :global(.choice) { flex: 1 1 260px; }
    .next { flex-direction: row; flex-wrap: wrap; }
    .next .btn { flex: 1; }
    .ref-body img { width: 100%; max-width: 520px; max-height: none; margin: 0 auto; }
    .ref-body :global(.cmp-wrap) { width: min(100%, 520px); }
    .stage { container-type: inline-size; flex: none; }
    .board-box { width: 100%; }
    .stage.jigsaw .board-box { height: max(520px, 78dvh); }
    .win-grid { grid-template-columns: 1fr; }
    .where { display: grid; grid-template-columns: 110px 1fr; gap: 0.75rem; align-items: center; }
    .where p { margin: 0; }
  }
</style>
