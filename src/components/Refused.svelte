<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';

  // Changes made here that the account wouldn't take: keep a copy of them, or go with the account.
</script>

{#if P.syncStatus === 'refused'}
  <div class="row">
    <button class="btn-plain" onclick={() => P.exportData()}>Download a backup</button>
    <button class="btn-plain" onclick={() => P.takeAccounts()}>Use the account's copy</button>
  </div>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
