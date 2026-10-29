<script lang="ts">
  import { assetUrl, type Manifest, type Square } from '../lib/catalog';
  let { manifest, square }: { manifest: Manifest; square: Square } = $props();
  const W = manifest.overview.width, H = manifest.overview.height;
  const cw = W / manifest.cols, ch = H / manifest.rows;
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="Location of this puzzle on the map of Florida">
  <image href={assetUrl(manifest.overview.file)} width={W} height={H} opacity="0.85" />
  <rect x={square.col * cw - cw} y={square.row * ch - ch} width={cw * 3} height={ch * 3} class="halo" />
  <rect x={square.col * cw} y={square.row * ch} width={cw} height={ch} class="spot" />
</svg>

<style>
  svg { display: block; width: 100%; height: auto; }
  .halo { fill: none; stroke: var(--accent); stroke-width: 6; opacity: 0.45; }
  .spot { fill: var(--accent); fill-opacity: 0.35; stroke: var(--accent); stroke-width: 6; }
</style>
