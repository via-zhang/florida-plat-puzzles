<script lang="ts" generics="T extends string">
  // Segmented control (radio group).
  let { label, options, value = $bindable() }: { label: string; options: { id: T; label: string; title?: string; disabled?: boolean }[]; value: T } = $props();
  const name = `choice-${Math.random().toString(36).slice(2)}`;
</script>

<fieldset class="choice">
  <legend class="visually-hidden">{label}</legend>
  {#each options as o (o.id)}
    <label title={o.title}>
      <input type="radio" {name} value={o.id} bind:group={value} disabled={o.disabled} />
      <span>{o.label}</span>
    </label>
  {/each}
</fieldset>

<style>
  .choice {
    display: inline-flex; border: 1px solid var(--line); border-radius: 999px;
    padding: 3px; margin: 0; background: var(--surface); gap: 2px; min-width: 0;
  }
  label { position: relative; flex: 1; }
  input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  span {
    display: flex; align-items: center; justify-content: center;
    min-height: 38px; padding: 0 0.85rem; border-radius: 999px;
    font-weight: 600; font-size: 0.95rem; color: var(--muted); white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  input:checked + span { background: var(--accent); color: var(--accent-ink); }
  input:disabled + span { opacity: 0.45; }
  input:disabled { cursor: not-allowed; }
  input:focus-visible + span { outline: 3px solid var(--focus); outline-offset: 1px; }
  label:hover input:not(:checked) + span { color: var(--ink); }
  @media (max-width: 420px) { span { padding: 0 0.6rem; font-size: 0.9rem; } }
</style>
