<script lang="ts" module>
  // Open or shut stays as it was while the app is open (changing day redraws the plan).
  let open = $state(false);
</script>

<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { planner as P } from '../lib/planner.svelte';
  import { reducedMotion } from '../lib/ui.svelte';
  import SectionHead from './SectionHead.svelte';
  import SomedayList from './SomedayList.svelte';

  // Tasks with no day yet, folded away at the foot of Today: the bar says how many, and opens on
  // the list (on a computer they're in the column beside the plan instead).
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 220, easing: cubicOut });
</script>

<section class="sec" aria-label="Someday">
  <SectionHead
    icon="someday"
    title="Someday"
    tally={String(P.someday.length)}
    inset
    {open}
    ontoggle={() => (open = !open)}
    controls="someday-list"
  />
  {#if open}
    <div id="someday-list" class="body" transition:slide={unfold()}>
      <p class="hint">Tasks with no day yet. Tap one to plan it.</p>
      <SomedayList />
    </div>
  {/if}
</section>

<style>
  .sec {
    margin: 14px var(--px) 2px;
    border-radius: var(--r-card);
    background: var(--raised);
  }
  .body {
    padding: 10px 0 4px;
  }
  .hint {
    margin: 0;
    padding: 0 16px 4px;
    font: 400 14px/1.4 var(--font);
    color: var(--muted);
  }
</style>
