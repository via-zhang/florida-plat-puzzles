<script lang="ts">
  import type { Snippet } from 'svelte';
  let { open = $bindable(false), label, children, wide = false }: { open: boolean; label: string; children: Snippet; wide?: boolean } = $props();
  let dlg: HTMLDialogElement;
  $effect(() => {
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  });
</script>

<dialog bind:this={dlg} aria-label={label} class:wide onclose={() => (open = false)}
        onclick={(e) => { if (e.target === dlg) open = false; }}>
  <div class="body">{@render children()}</div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--line); border-radius: 16px; padding: 0;
    background: var(--surface); color: var(--ink); box-shadow: var(--shadow);
    width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px);
  }
  dialog.wide { width: min(560px, calc(100vw - 32px)); }
  dialog::backdrop { background: rgb(20 14 8 / 0.55); backdrop-filter: blur(2px); }
  dialog[open] { animation: pop 0.22s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
  .body { padding: 1.25rem; }
</style>
