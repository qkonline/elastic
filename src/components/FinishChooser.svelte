<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dL, fT } from '../lib/time';
  import InlineConfirm from './InlineConfirm.svelte';

  // Done on a task well over time: it may have been finished a while ago and Done tapped late.
  // It's already done as of that tap: this only moves the finish back.
  let {
    id,
    title,
    worked,
    min,
    large = false,
  }: { id: string; title: string; worked: number; min: number; large?: boolean } = $props();
  const upAt = $derived(P.timeUpAt(id));
</script>

{#if upAt != null}
  <InlineConfirm
    {large}
    q="When did you finish {title}?"
    d="It ran {dL(worked - min)} over."
    opts={[
      { l: `When time was up, ${fT(upAt, P.settings.clock24)}`, kind: 'pri', on: () => P.finishAt(id, upAt) },
      { l: 'Just now', on: () => P.finishedNow(id) },
    ]}
    cancel={{ l: 'Still going', on: () => P.stillGoing(id) }}
  />
{/if}
