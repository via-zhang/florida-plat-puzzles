<script lang="ts">
  // Attribution for the map imagery.
  let { extra = '' }: { extra?: string } = $props();
</script>

<p class="credit">
  Historical maps: <a href="https://www.labins.org/survey_data/landrecords/landrecords.cfm" target="_blank" rel="noopener">General Land Office survey plats</a>,
  processed by the <a href="https://www.floridamuseum.ufl.edu/" target="_blank" rel="noopener">Florida Museum of Natural History</a>'s
  AI for Human Ecology Lab
  {#if extra}<br />Present-day: {extra} (<a href="https://planetarycomputer.microsoft.com/" target="_blank" rel="noopener">Planetary Computer</a>){/if}
</p>

<style>
  .credit { margin: 0; color: var(--muted); font-size: 0.8rem; line-height: 1.4; }
  .credit a { color: inherit; }
</style>
