<script lang="ts">
  // Wipe between the historical plat (left of the divider) and present-day imagery (right).
  let { historical, present, pos = $bindable(50), paperUrl, compact = false }: {
    historical: string; present: string; pos?: number; paperUrl: string; compact?: boolean;
  } = $props();
</script>

<div class="cmp-wrap">
<div class="cmp" class:compact style:--pos="{pos}%">
  <img class="present" src={present} alt="Present-day satellite view of this square" draggable="false" />
  <img class="historical" src={historical} alt="Historical survey plat of this square" draggable="false" style:background-image={paperUrl} />
  <div class="divider" aria-hidden="true"></div>
  <span class="knob" aria-hidden="true">⟷</span>
  <input
    type="range" min="0" max="100" step="1" bind:value={pos}
    aria-label="Compare: drag left for more present-day, right for more historical"
    aria-valuetext="{Math.round(pos)}% historical"
  />
</div>
<div class="labels" aria-hidden="true"><span>Historical</span><span>Present</span></div>
</div>

<style>
  .cmp-wrap { width: 100%; }
  .cmp { position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; user-select: none; touch-action: pan-y; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .historical { background-color: var(--paper); background-size: 128px; clip-path: inset(0 calc(100% - var(--pos)) 0 0); }
  .divider { position: absolute; top: 0; bottom: 0; left: var(--pos); width: 2px; margin-left: -1px; background: #fff; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35); pointer-events: none; }
  .knob {
    /* follows the divider but stays fully visible at either end */
    position: absolute; top: 50%; left: clamp(15px, var(--pos), calc(100% - 15px)); transform: translate(-50%, -50%); pointer-events: none;
    width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
    background: #fff; color: #3b2a1a; font-size: 15px; box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
  }
  .compact .knob { width: 24px; height: 24px; font-size: 12px; }
  /* The whole image is the slider: an invisible range input on top. */
  input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
  .cmp:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }
  .labels { display: flex; justify-content: space-between; margin-top: 0.3rem; color: var(--muted); font-size: 0.78rem; }
</style>
