<script lang="ts">
  import { onMount } from 'svelte';
  import About from './components/About.svelte';
  import MapPicker from './components/MapPicker.svelte';
  import PlayView from './components/PlayView.svelte';
  import { assetUrl, loadManifest, randomSquare, type Manifest, type MapView, type Square } from './lib/catalog';
  import { isDifficulty, isMode, type Mode } from './lib/engine/difficulty';
  import { setSoundEnabled } from './lib/sound';
  import { createRng, randomSeed } from './lib/engine/rng';
  import { loadPrefs, savePrefs } from './lib/prefs';

  const prefs = loadPrefs();
  // A fresh visit opens straight into a random Rotate puzzle; difficulty is remembered.
  let mode = $state<Mode>('rotate');
  let difficulty = $state(prefs.difficulty);
  let manifest = $state<Manifest | null>(null);
  let error = $state('');
  let playing = $state<Square | null>(null);
  let selected = $state<Square | null>(null);
  let aboutOpen = $state(false);
  let liveMsg = $state('');
  let soundOn = $state(prefs.sound);
  let view = $state<MapView>(prefs.view);

  $effect(() => savePrefs({ mode, difficulty, sound: soundOn, view }));
  $effect(() => { setSoundEnabled(soundOn); });

  // URL hash routes: #/play/<square>/<mode>/<difficulty> and #/map.
  // Screen changes push history (so Back works); setting changes replace it.
  // A trailing /present or /mixed picks that view; no suffix means historical.
  const viewSuffix = () => (view === 'historical' ? '' : `/${view}`);
  const hashFor = () => (playing ? `#/play/${playing.id}/${mode}/${difficulty}${viewSuffix()}` : `#/map${viewSuffix()}`);

  function readHash() {
    if (!manifest) return;
    const parts = location.hash.split('/');
    const [, route, id, m, d] = parts;
    if (parts.length > 1) { const last = parts.at(-1); view = last === 'present' || last === 'mixed' ? last : 'historical'; }
    if (!manifest.present) view = 'historical';
    if (route === 'map') {
      playing = null;
      return;
    }
    const sq = route === 'play' ? manifest.squares.find((s) => s.id === id) : undefined;
    if (sq) {
      if (m && isMode(m)) mode = m;
      if (d && isDifficulty(d)) difficulty = d;
      playing = selected = sq;
    } else {
      // No (valid) route: start a random Rotate puzzle.
      mode = 'rotate';
      playing = selected = randomSquare(manifest, createRng(randomSeed()));
    }
    history.replaceState(null, '', hashFor());
  }

  $effect(() => {
    if (!manifest) return; // don't touch the URL until readHash() has run
    const target = hashFor();
    if (location.hash !== target) history.replaceState(null, '', target);
  });

  function navigate(sq: Square | null) {
    playing = sq;
    if (sq) selected = sq;
    history.pushState(null, '', hashFor());
    window.scrollTo(0, 0);
  }

  onMount(() => {
    loadManifest().then((m) => { manifest = m; readHash(); }).catch((e) => (error = String(e)));
    const onPop = () => readHash();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  function announce(msg: string) {
    liveMsg = '';
    setTimeout(() => (liveMsg = msg), 30);
  }

  const play = (sq: Square) => navigate(sq);
  const showMap = () => navigate(null);
  const random = () => {
    if (!manifest) return;
    // Avoid repeating the current square.
    const rng = createRng(randomSeed());
    let sq = randomSquare(manifest, rng);
    for (let i = 0; i < 5 && sq.id === playing?.id; i++) sq = randomSquare(manifest, rng);
    navigate(sq);
  };
</script>

<div class="shell" style:--paper-url="url({assetUrl('paper.webp')})">
  {#if error}
    <p class="msg">Couldn't load the puzzle catalog: {error}</p>
  {:else if !manifest}
    <p class="msg">Loading map…</p>
  {:else if playing}
    <PlayView {manifest} square={playing} bind:mode bind:difficulty bind:soundOn bind:view onMap={showMap} onRandom={random} onAbout={() => (aboutOpen = true)} {announce} />
  {:else}
    <MapPicker {manifest} bind:mode bind:difficulty bind:selected bind:soundOn bind:view onPlay={play} onRandom={random} onAbout={() => (aboutOpen = true)} />
  {/if}
</div>

<div class="visually-hidden" role="status" aria-live="polite">{liveMsg}</div>
<About bind:open={aboutOpen} />

<style>
  .shell { flex: 1; display: flex; flex-direction: column; min-height: 100dvh; }
  .msg { text-align: center; margin-top: 20vh; color: var(--muted); }
</style>
