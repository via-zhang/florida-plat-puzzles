<script lang="ts">
  import Dialog from './Dialog.svelte';
  let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Dialog bind:open label="About Puzzles of Florida's Past" wide>
  <h2>About</h2>
  <p>
    Every puzzle is a 20 km square cut from a mosaic of <strong>General Land Office (GLO) survey plats</strong>,
    the hand-drawn maps surveyors made as they laid out Florida's townships, ranges, and sections in the 1800s.
    You'll find section grids, rivers, swamps, hammocks, and surveyors' notes.
  </p>
  <p>
    Some sheets are missing from the mosaic. Those gaps show as plain paper; pieces with no map at all don't move.
  </p>
  <p>
    Switch the <strong>Map</strong> to <strong>Present</strong> to solve the puzzle with today's satellite view of the same square
    (a cloud-free Sentinel-2 composite of the latest dry season), or to <strong>Mixed</strong> for a combination of historical and present puzzle pieces. 
    You can switch any time without losing your progress, and the Reference Image lets you slide between then and now.
  </p>
  <h3>How to play</h3>
  <ul>
    <li><strong>Rotate:</strong> tap to turn a tile clockwise; right-click or long-press turns it back.</li>
    <li><strong>Jigsaw:</strong> drag pieces from the tray onto the board. They click into a square; rearrange until it's solved.</li>
    <li><strong>Slide:</strong> tap a tile in line with the empty space, swipe, or use arrow keys.</li>
  </ul>
  <p class="credit">
    Historical maps: <a href="https://www.labins.org/survey_data/landrecords/landrecords.cfm" target="_blank" rel="noopener">General Land Office survey plats</a> (Land Boundary
    Information System), processed by the
    <a href="https://www.floridamuseum.ufl.edu/" target="_blank" rel="noopener">Florida Museum of Natural History</a>'s
    AI for Human Ecology Lab.
    Present-day imagery: contains modified Copernicus Sentinel data, accessed through
    <a href="https://planetarycomputer.microsoft.com/" target="_blank" rel="noopener">Microsoft Planetary Computer</a>.
  </p>
  <div class="end"><button class="btn primary" onclick={() => (open = false)}>Close</button></div>
</Dialog>

<style>
  h2 { font-size: 1.6rem; margin-bottom: 0.5rem; }
  h3 { font-size: 1.1rem; margin-top: 1rem; }
  p, li { color: var(--ink); }
  ul { padding-left: 1.2rem; }
  .credit { color: var(--muted); font-size: 0.9rem; }
  .credit a { color: inherit; }
  .end { display: flex; justify-content: flex-end; }
</style>
