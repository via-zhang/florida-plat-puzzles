<script lang="ts">
  import type { Snippet } from 'svelte';
  import Credit from './Credit.svelte';
  import SideHeader from './SideHeader.svelte';

  // Two-column page: controls on the left, the main content (puzzle or map) on the right.
  let { soundOn = $bindable(true), onHome, onAbout, side, children, credit = '' }: {
    soundOn: boolean; onHome: () => void; onAbout: () => void; side: Snippet; children: Snippet; credit?: string;
  } = $props();
</script>

<div class="page">
  <aside class="side">
    <SideHeader bind:soundOn {onHome} {onAbout} />
    {@render side()}
    <div class="credit-side"><Credit extra={credit} /></div>
  </aside>
  <div class="main">{@render children()}</div>
  <div class="credit-bottom"><Credit extra={credit} /></div>
</div>

<style>
  .page {
    display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px;
    height: 100dvh; padding: max(14px, env(safe-area-inset-top)) 20px 14px;
  }
  .side {
    display: flex; flex-direction: column; gap: 0.75rem; min-height: 0; overflow-y: auto;
    padding: 2px 4px 2px 2px; /* room for focus rings */
    container-type: size; /* lets the reference image size itself to the space left */
  }
  .credit-side { margin-top: auto; padding-top: 0.5rem; }
  /* Short screens: tighten spacing so the panel still fits without scrolling. */
  @media (max-height: 760px) { .side { gap: 0.5rem; } .credit-side { padding-top: 0.25rem; } }
  .main { min-height: 0; min-width: 0; display: flex; flex-direction: column; }
  .credit-bottom { display: none; }

  /* Phones: stack the controls above the content, credit at the very bottom. */
  @media (max-width: 760px) {
    .page { grid-template-columns: 1fr; height: auto; min-height: 100dvh; gap: 12px; padding: max(10px, env(safe-area-inset-top)) 12px 12px; }
    .side { overflow: visible; gap: 0.6rem; container-type: normal; }
    .credit-side { display: none; }
    .credit-bottom { display: block; text-align: center; }
  }
</style>
