<script lang="ts">
  // Re-created (via {#key}) whenever its inputs change; props are read once at setup.
  import { createRng } from '../lib/engine/rng';
  import * as R from '../lib/engine/rotate';
  import { BLANK } from '../lib/analysis';
  import type { LoadedPuzzle } from '../lib/puzzle';
  import { tick } from '../lib/sound';

  let { puzzle, srcOf, n, seed, paperUrl, onProgress, onWin, announce, notify }: {
    puzzle: LoadedPuzzle; srcOf: (id: number) => string; n: number; seed: number; paperUrl: string;
    onProgress: (moves: number) => void; onWin: (moves: number) => void; announce: (msg: string) => void;
    notify: (msg: string) => void;
  } = $props();

  const cells = puzzle.cells(n);
  let game = $state(R.create(n, cells.map((c) => c.looksRightAt), createRng(seed)));
  // Cumulative angles so animation always turns the short way.
  let angle = $state(game.rot.map((r) => r * 90));
  let solved = $state(false);
  let size = $state(0);
  const t = $derived(size / n);
  const tiles = $derived(game.rot.map((_, i) => i));

  function turn(i: number, dir: 1 | -1) {
    if (solved) return;
    if (game.locked[i]) {
      notify(cells[i].missing >= BLANK
        ? "This tile is missing from the historical map, so it's fixed in place."
        : "On the historical map this tile looks the same at every angle, so it's fixed in place.");
      return;
    }
    game = R.rotate(game, i, dir);
    tick();
    angle[i] += dir * 90;
    onProgress(game.moves);
    if (R.isSolved(game)) {
      solved = true;
      // Settle every tile at its nearest upright angle so the picture is exact.
      angle = angle.map((a, k) => a - game.rot[k] * 90 + (game.rot[k] === 3 ? 360 : 0));
      announce(`Solved in ${game.moves} moves!`);
      setTimeout(() => onWin(game.moves), 500);
    }
  }

  // Long-press (touch) or right-click turns counter-clockwise.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;
  function press(i: number, e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; turn(i, -1); navigator.vibrate?.(10); }, 450);
  }
  const release = () => clearTimeout(pressTimer);
  function click(i: number, e: MouseEvent) {
    if (longPressed) { longPressed = false; return; }
    turn(i, e.shiftKey ? -1 : 1);
  }
  function context(i: number, e: MouseEvent) {
    e.preventDefault();
    if (!longPressed) turn(i, -1);
  }
  function key(e: KeyboardEvent) {
    // Arrow keys move focus around the grid.
    const i = Number((e.target as HTMLElement).dataset.i);
    if (Number.isNaN(i)) return;
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n }[e.key];
    if (!d) return;
    e.preventDefault();
    const j = i + d;
    if (j < 0 || j >= n * n || (Math.abs(d) === 1 && Math.floor(j / n) !== Math.floor(i / n))) return;
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-i="${j}"]`)?.focus();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="board" class:solved bind:clientWidth={size} style:grid-template-columns="repeat({n}, 1fr)" onkeydown={key}>
  {#each tiles as i (i)}
    <button
      class="tile"
      class:locked={game.locked[i]}
      data-i={i}
      aria-label={game.locked[i] ? `Tile ${i + 1}, blank, fixed in place` : `Tile ${i + 1}, turned ${game.rot[i] * 90} degrees`}
      aria-disabled={game.locked[i] || solved}
      style:transform="rotate({angle[i]}deg)"
      style:background-image="url({srcOf(i)}), {paperUrl}"
      style:background-size="{size}px {size}px, 256px 256px"
      style:background-position="{-(i % n) * t}px {-Math.floor(i / n) * t}px, {-(i % n) * t}px {-Math.floor(i / n) * t}px"
      onclick={(e) => click(i, e)}
      oncontextmenu={(e) => context(i, e)}
      onpointerdown={(e) => press(i, e)}
      onpointerup={release}
      onpointerleave={release}
      onpointercancel={release}
    ></button>
  {/each}
</div>

<style>
  .board {
    display: grid; width: 100%; aspect-ratio: 1; gap: 0;
    background: var(--slot); border-radius: 6px; overflow: hidden;
    box-shadow: var(--shadow); user-select: none; -webkit-touch-callout: none;
  }
  .tile {
    position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 0;
    background-color: var(--paper); background-repeat: no-repeat, repeat;
    box-shadow: inset 0 0 0 1px rgb(40 28 16 / 0.35);
    transition: transform 0.18s ease-out, box-shadow 0.3s, filter 0.3s;
    cursor: pointer; touch-action: manipulation;
  }
  .tile:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; z-index: 1; }
  .tile.locked { cursor: default; filter: saturate(0.8) brightness(0.96); }
  .solved .tile { box-shadow: none; filter: none; cursor: default; }
</style>
