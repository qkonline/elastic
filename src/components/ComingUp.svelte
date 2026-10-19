<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { fT } from '../lib/time';
  import { hueColor } from '../lib/types';

  // The heads-up before a fixed-time task, while the app is open. It goes when the task is due
  // to start, is started, or is closed here.
  const h = $derived(P.comingUp);
  const mins = $derived(h ? Math.max(1, Math.ceil((h.startsAt - P.clock) / 60000)) : 0);
</script>

{#if h}
  <div class="heads-up" style:--hue={hueColor(h.it.hue)}>
    <div class="text">
      <span class="t">{h.it.title}</span>
      <span class="s">Coming up at {fT(h.start, P.settings.clock24)}, in {mins} min</span>
    </div>
    <button class="close-x" aria-label="Close heads-up for {h.it.title}" onclick={() => P.dismissHeadsUp(h)}>×</button>
  </div>
{/if}

<style>
  .heads-up {
    margin: 10px var(--px) 0;
    padding: 6px 6px 6px 16px;
    border-radius: var(--r-card);
    background: color-mix(in oklab, var(--hue) 12%, transparent);
    box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--hue) 60%, transparent);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 0;
  }
  .t {
    font: 400 15px/1.3 var(--font);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
</style>
