<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { needsInstallForNotifications } from '../lib/platform';
  import { pushConfigured } from '../lib/push';

  // Offered right after a timer starts or a task gets a fixed time. "Not now" asks again
  // tomorrow; "Don't ask again" turns the suggestion off for good (notifications can still be
  // switched on in Settings).
  const install = needsInstallForNotifications();
  const reach = pushConfigured()
    ? 'even when Elastic is closed or your phone is locked'
    : 'while Elastic is in the background';
</script>

{#if P.notifyPrompt}
  <div class="card" role="region" aria-label="Notifications">
    {#if P.notifyPrompt === 'blocked'}
      <p class="body">
        Your browser has blocked notifications for this site. Allow them in the browser's site settings, then turn them
        on in Settings.
      </p>
      <div class="row">
        <button class="plain" onclick={() => (P.notifyPrompt = null)}>OK</button>
      </div>
    {:else}
      <p class="title">
        {P.notifyPrompt === 'fixed' ? 'Get a notification before fixed times?' : "Get a notification when time's up?"}
      </p>
      <p class="body">
        {#if install}
          On iPhone and iPad, notifications work once Elastic is on your Home Screen.
        {:else}
          You'll hear about it {reach}.
        {/if}
      </p>
      <div class="row">
        {#if install}
          <button class="pri" onclick={() => P.openSheet({ type: 'install' })}>Show me how</button>
        {:else}
          <button class="pri" onclick={() => P.answerNotifyPrompt('on')}>Turn on</button>
        {/if}
        <button class="plain" onclick={() => P.answerNotifyPrompt('later')}>Not now</button>
        <button class="text" onclick={() => P.answerNotifyPrompt('never')}>Don't ask again</button>
      </div>
    {/if}
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
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }
  button {
    height: var(--btn);
    padding: 0 14px;
    border-radius: var(--r-ctl);
    font: 400 14px/1 var(--font);
    cursor: pointer;
    white-space: nowrap;
  }
  .pri {
    border: 1px solid var(--text);
    background: var(--text);
    color: var(--bg);
  }
  .plain {
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
  }
  .text {
    border: none;
    background: transparent;
    color: var(--muted);
    padding: 0 6px;
  }
</style>
