<script lang="ts">
  import { assetUrl } from '../lib/catalog';
  // Brand + sound + About, shown at the top of the left-hand panel on every screen.
  let { soundOn = $bindable(true), onHome, onAbout }: { soundOn: boolean; onHome: () => void; onAbout: () => void } = $props();
</script>

<div class="side-header">
  <a class="brand" href="#/map" onclick={(e) => { e.preventDefault(); onHome(); }}>
    <img src={assetUrl('logo.svg')} alt="" width="36" height="36" />
    <span>Puzzles of Florida's Past</span>
  </a>
  <div class="actions">
    <button class="btn icon" aria-pressed={soundOn} aria-label={soundOn ? 'Sound on' : 'Sound off'} title={soundOn ? 'Sound on' : 'Sound off'}
            onclick={() => (soundOn = !soundOn)}>{soundOn ? '🔊' : '🔇'}</button>
    <button class="btn icon about" onclick={onAbout} aria-label="About" title="About">i</button>
  </div>
</div>

<style>
  .side-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-width: 0; }
  /* The title may wrap onto two lines so the panel keeps its width. */
  .brand { display: inline-flex; align-items: center; gap: 0.55rem; min-width: 0; color: inherit; text-decoration: none; font-family: var(--serif); font-weight: 700; font-size: 1.12rem; line-height: 1.15; text-wrap: balance; }
  .brand img { width: 36px; height: 36px; flex: none; }
  .actions { display: flex; gap: 0.35rem; flex: none; }
  .actions .btn { min-height: 34px; }
  .actions .btn.icon { width: 34px; }
  .about { font-family: var(--serif); font-style: italic; font-weight: 700; font-size: 1.05rem; }
</style>
