<script lang="ts">
  import { planner, UNTIMED_CONFIRMS } from '../lib/planner.svelte';
  import { intoView } from '../lib/ui.svelte';
  import DisarmBar from './DisarmBar.svelte';

  interface Opt {
    l: string;
    on: () => void;
    kind?: 'pri' | 'danger';
  }
  let { q, d = '', opts, large = false }: { q: string; d?: string; opts: Opt[]; large?: boolean } = $props();

  // The button that opened this confirm is gone now, so move focus to the first choice.
  const focusFirst = (el: HTMLElement) => el.focus({ preventScroll: true });
</script>

<div class="confirm" class:large role="group" aria-label={q} {@attach intoView}>
  <div class="q">
    {q}
    {#if d}<span>{d}</span>{/if}
  </div>
  {#each opts as o, i (o.l)}
    {#if i === 0}
      <button class="opt {o.kind ?? ''}" onclick={o.on} {@attach focusFirst}>{o.l}</button>
    {:else}
      <button class="opt {o.kind ?? ''}" onclick={o.on}>{o.l}</button>
    {/if}
  {/each}
  <button class="opt" onclick={() => planner.disarm()}>Cancel</button>
  {#if !planner.confirm || !UNTIMED_CONFIRMS.includes(planner.confirm.type)}<DisarmBar />{/if}
</div>

<style>
  .confirm {
    padding: 10px 10px 12px 14px;
    border-radius: var(--r-card);
    background: var(--sunk);
    border: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    position: relative;
    overflow: hidden;
  }
  .confirm.large {
    padding: 12px 10px 14px 14px;
  }
  .q {
    flex: 1 1 130px;
    font: 400 14px/1.3 var(--font);
  }
  .large .q {
    flex-basis: 150px;
    font-size: 15px;
  }
  .q span {
    color: var(--muted);
  }
</style>
