<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dL } from '../lib/time';
  import InlineConfirm from './InlineConfirm.svelte';

  // "Postpone X?" with Later today / Tomorrow / Someday (no day yet). Mid-task, it notes that
  // logged time is kept.
  let {
    id,
    title,
    worked = 0,
    large = false,
  }: { id: string; title: string; worked?: number; large?: boolean } = $props();
</script>

<InlineConfirm
  {large}
  q="Postpone {title}?"
  d={worked >= 0.5 ? `${dL(worked)} worked stays logged.` : ''}
  opts={[
    { l: 'Later today', kind: 'pri', on: () => P.postpone(id, 'later') },
    { l: 'Tomorrow', on: () => P.postpone(id, 'tomorrow') },
    { l: 'Someday', on: () => P.postpone(id, 'someday') },
  ]}
/>
