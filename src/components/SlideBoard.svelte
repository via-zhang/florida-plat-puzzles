<script lang="ts">
  // Re-created (via {#key}) whenever its inputs change; props are read once at setup.
  import { SLIDE_SHUFFLE } from '../lib/engine/difficulty';
  import { createRng } from '../lib/engine/rng';
  import * as S from '../lib/engine/slide';
  import { blankCells, gapCandidates, type LoadedPuzzle } from '../lib/puzzle';
  import { tick } from '../lib/sound';

  let { puzzle, srcOf, n, seed, paperUrl, onProgress, onWin, announce }: {
    puzzle: LoadedPuzzle; srcOf: (id: number) => string; n: number; seed: number; paperUrl: string;
    onProgress: (moves: number) => void; onWin: (moves: number) => void; announce: (msg: string) => void;
  } = $props();

  const cells = puzzle.cells(n);
  const rng = createRng(seed);
  // The missing piece is missing data when there is some; otherwise the classic bottom-right.
  const candidates = gapCandidates(cells);
  const gapId = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : n * n - 1;
  const blanks = blankCells(cells);
  const same = blanks.has(gapId) ? blanks : new Set([...blanks].filter((i) => i !== gapId));

  let game = $state(S.shuffle(S.createSolved(n, gapId), rng, SLIDE_SHUFFLE[n] ?? 300, same));
  let solved = $state(false);
  let size = $state(0);
  const t = $derived(size / n);

  function play(pos: number) {
    if (solved) return;
    const next = S.move(game, pos);
    if (!next) return;
    game = next;
    tick();
    onProgress(game.moves);
    if (S.isSolved(game, same)) {
      solved = true;
      // Snap every tile to its exact home.
      game = { ...game, board: game.board.map((_, i) => i) };
      announce(`Solved in ${game.moves} moves!`);
      setTimeout(() => onWin(game.moves), 450);
    }
  }

  function key(e: KeyboardEvent) {
    const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[e.key as 'ArrowUp'];
    if (!dir) return;
    e.preventDefault();
    const p = S.tileForDirection(game, dir);
    if (p !== null) play(p);
  }

  // Swipe anywhere on the board: the tile next to the gap moves in the swipe direction.
  let swipe: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => (swipe = { x: e.clientX, y: e.clientY });
  function up(e: PointerEvent) {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    const p = S.tileForDirection(game, dir);
    if (p !== null) play(p);
  }

  // Tiles keep a fixed DOM order so their moves animate.
  const tileIds = Array.from({ length: n * n }, (_, i) => i);
  const posOf = (id: number) => game.board.indexOf(id);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="board"
  class:solved
  bind:clientWidth={size}
  onkeydown={key}
  onpointerdown={down}
  onpointerup={up}
  style:--paper-url={paperUrl}
>
  {#each tileIds as id (id)}
    {#if id !== gapId || solved}
      {@const pos = posOf(id)}
      <button
        class="tile"
        class:gap-tile={id === gapId}
        aria-label={`Tile from row ${Math.floor(id / n) + 1}, column ${(id % n) + 1}`}
        disabled={solved || !S.canMove(game, pos)}
        style:width="{t}px"
        style:height="{t}px"
        style:transform="translate({(pos % n) * t}px, {Math.floor(pos / n) * t}px)"
        style:background-image="url({srcOf(id)}), {paperUrl}"
        style:background-size="{size}px {size}px, 256px 256px"
        style:background-position="{-(id % n) * t}px {-Math.floor(id / n) * t}px, {-(id % n) * t}px {-Math.floor(id / n) * t}px"
        onclick={() => play(pos)}
      ></button>
    {/if}
  {/each}
</div>

<style>
  .board {
    position: relative; width: 100%; aspect-ratio: 1; border-radius: 6px;
    background: var(--slot); box-shadow: inset 0 2px 10px rgb(0 0 0 / 0.6), var(--shadow);
    touch-action: none; user-select: none; overflow: hidden;
  }
  .tile {
    position: absolute; left: 0; top: 0; padding: 0; border: 0; border-radius: 0;
    background-color: var(--paper); background-repeat: no-repeat, repeat;
    box-shadow: inset 0 0 0 1px rgb(40 28 16 / 0.35), inset 1px 1px 0 rgb(255 255 255 / 0.18);
    transition: transform 0.14s ease-out, box-shadow 0.3s;
    cursor: pointer;
  }
  .tile:disabled { cursor: default; color: inherit; opacity: 1; }
  .tile:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; z-index: 1; }
  .solved .tile { box-shadow: none; }
  .gap-tile { animation: drop-in 0.4s ease-out; }
  @keyframes drop-in { from { opacity: 0; transform-origin: center; scale: 1.15; } to { opacity: 1; scale: 1; } }
</style>
