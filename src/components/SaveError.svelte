<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';

  // Saving on this device is failing. The latest changes live only in this window until a save
  // works, so say so, keep trying, and offer a backup that includes them.
</script>

{#if P.saveError}
  <div class="banner" role="alert">
    <p class="t">
      {P.saveError === 'full'
        ? "This device is out of storage, so Elastic can't save."
        : "Elastic can't save on this device right now."}
    </p>
    <p class="s">
      Your latest changes are only in this window until it can. It keeps trying. Download a backup to keep them safe.
    </p>
    <button class="go" onclick={() => P.exportData()}>Download a backup</button>
  </div>
{/if}

<style>
  .banner {
    margin: 10px var(--px) 0;
    padding: 12px 12px 12px 16px;
    border-radius: var(--r-card);
    background: rgba(248, 113, 113, 0.08);
    box-shadow: inset 0 0 0 1.5px rgba(248, 113, 113, 0.55);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  p {
    margin: 0;
  }
  .t {
    font: 400 15px/1.3 var(--font);
    color: var(--redT);
  }
  .s {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .go {
    margin-top: 6px;
    height: var(--btn);
    padding: 0 14px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
    white-space: nowrap;
  }
</style>
