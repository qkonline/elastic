<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';

  // Offered once the account's email turns out to have a Boardo account in at least one board:
  // one tap links them, for every device. "No thanks" leaves it to Settings → Projects.
  const B = P.boardo;
  const boards = $derived(B.match ? (B.match.boards === 1 ? 'a board' : `${B.match.boards} boards`) : '');
</script>

{#if B.match && !B.connected && !B.declined}
  <div class="card" role="region" aria-label="Boardo">
    <p class="title">See your Boardo cards here?</p>
    <p class="body">
      You're in {boards} in Boardo as {B.match.email}. The cards assigned to you would show in your day on every device
      you use, and the time you work on them goes back to Boardo.
    </p>
    <div class="row">
      <button class="pri" disabled={B.busy} onclick={() => B.link()}>Show my cards</button>
      <button class="text" disabled={B.busy} onclick={() => B.decline()}>No thanks</button>
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
  .text {
    border: none;
    background: transparent;
    color: var(--muted);
    padding: 0 6px;
  }
</style>
