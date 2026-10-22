<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';

  // Signed in to an account that isn't set up yet (made with a passkey only, before accounts had
  // emails, or just made and still without a name): it doesn't sync until it is.
</script>

{#if P.syncStatus === 'paused' && !P.joinAsk && P.sheet?.type !== 'account'}
  <div class="card" role="region" aria-label="Account">
    <p class="title">Your plan isn't syncing</p>
    <p class="body">
      {P.session?.user.email
        ? 'Add your name to your account to start syncing.'
        : 'Add your name and email to your account to keep syncing. Everything you change meanwhile goes up then.'}
    </p>
    <div class="row">
      <button class="pri" onclick={() => P.openSheet({ type: 'account' })}>
        {P.session?.user.email ? 'Add your name' : 'Add name and email'}
      </button>
    </div>
  </div>
{/if}

<style>
  .card {
    margin: 10px var(--px) 0;
    padding: 14px 14px 12px 16px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  p {
    margin: 0;
  }
  .title {
    font: 400 15px/1.3 var(--font);
  }
  .body {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .row {
    display: flex;
    margin-top: 6px;
  }
  .pri {
    height: var(--btn);
    padding: 0 14px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--text);
    background: var(--text);
    color: var(--bg);
    font: 400 14px/1 var(--font);
    cursor: pointer;
    white-space: nowrap;
  }
</style>
