<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { planner as P } from '../lib/planner.svelte';
  import { reducedMotion } from '../lib/ui.svelte';

  // After tapping a check or a Start button before the day has started: start the day first.
  // Meanwhile the Start my day button itself jumps and lights up (StartDay.svelte). This sits
  // just above the bottom bar and goes by itself. After a habit tap it says what the tap did,
  // with Undo.
  const n = $derived(P.nudge);
</script>

{#if n}
  <div class="nudge" transition:fly={{ y: 14, duration: reducedMotion.current ? 0 : 220, easing: cubicOut }}>
    <span>{n.text}</span>
    {#if n.undo}<button class="undo" onclick={n.undo}>Undo</button>{/if}
  </div>
{/if}

<style>
  .nudge {
    position: fixed;
    z-index: 6;
    left: 16px;
    right: 16px;
    bottom: calc(var(--bar-h) + 40px + env(safe-area-inset-bottom) - var(--stuck, 0px));
    width: fit-content;
    max-width: 460px;
    margin: 0 auto;
    padding: 13px 20px;
    border-radius: var(--r-card);
    background: var(--text);
    color: var(--bg);
    font: 400 14px/1.4 var(--font);
    text-align: center;
    text-wrap: pretty;
    display: flex;
    align-items: center;
    gap: 14px;
    box-shadow:
      0 12px 30px -10px rgba(15, 23, 42, 0.5),
      0 2px 6px rgba(15, 23, 42, 0.18);
  }
  .undo {
    flex: none;
    height: 36px;
    margin: -8px -10px -8px 0;
    padding: 0 12px;
    border: none;
    border-radius: var(--r-ctl);
    background: color-mix(in oklab, var(--bg) 16%, transparent);
    color: var(--bg);
    font: 600 14px/1 var(--font);
    cursor: pointer;
  }
  /* Centred under the plan, between the sidebar and a task open beside it. */
  @media (min-width: 768px) {
    .nudge {
      left: calc(var(--side-w) + 16px);
      right: calc(var(--dock-w) + 16px);
    }
  }
</style>
