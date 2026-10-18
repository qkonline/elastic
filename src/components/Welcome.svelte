<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { accountsAvailable } from '../lib/account';
  import { planner as P } from '../lib/planner.svelte';
  import { dL, fT } from '../lib/time';
  import { reducedMotion } from '../lib/ui.svelte';
  import DayShape, { describe, type Shape } from './DayShape.svelte';

  // First visit: two questions about the shape of the user's day, then straight into planning.
  let step = $state(0);
  let shape = $state<Shape>({ start: 540, length: 480, flex: false });
  let panel: HTMLElement | null = $state(null);
  const icon = import.meta.env.BASE_URL + 'icon.svg';
  const summary = $derived(describe(shape, P.settings.clock24, fT, dL));
  const move = () => (reducedMotion.current ? { duration: 0 } : { x: 24, duration: 220 });

  function finish(then?: 'add' | 'sample') {
    P.completeOnboarding(shape);
    if (then === 'add') P.openSheet({ type: 'add' });
    if (then === 'sample') P.loadSample();
  }

  onMount(() => panel?.focus({ preventScroll: true }));
</script>

<div
  class="welcome"
  tabindex="-1"
  role="dialog"
  aria-modal="true"
  aria-label="Welcome"
  bind:this={panel}
  out:fade={{ duration: 200 }}
>
  <div class="inner">
    {#key step}
      <div class="step" in:fly={move()}>
        {#if step === 0}
          <img class="mark" src={icon} alt="" width="64" height="64" />
          <h1>Plan the day you actually have.</h1>
          <p class="lead">
            Add what you want to do and how long it takes. Elastic Day works out the times, and when something runs
            long, the rest of your day moves with it.
          </p>
          <div class="actions">
            <button class="pri" onclick={() => (step = 1)}>Get started</button>
            <button class="text" onclick={() => finish()}>Skip for now</button>
            {#if accountsAvailable()}
              <button class="text" disabled={P.accountBusy} onclick={() => P.signIn()}
                >I use Elastic Day on another device</button
              >
            {/if}
          </div>
          {#if P.accountMsg?.err}
            <p class="hint err" role="status">{P.accountMsg.t}</p>
          {/if}
        {:else if step === 1}
          <p class="count">1 of 2</p>
          <h2>When does your day usually start?</h2>
          <DayShape part="start" {shape} clock24={P.settings.clock24} onchange={(s) => (shape = s)} />
          <p class="hint">
            {shape.flex
              ? 'Your day starts whenever you press Start my day.'
              : 'Your plan starts here until you press Start my day.'}
          </p>
          <div class="actions">
            <button class="pri" onclick={() => (step = 2)}>Next</button>
            <button class="text" onclick={() => (step = 0)}>Back</button>
          </div>
        {:else if step === 2}
          <p class="count">2 of 2</p>
          <h2>How long is a productive day for you?</h2>
          <DayShape part="length" {shape} clock24={P.settings.clock24} onchange={(s) => (shape = s)} />
          <p class="summary">Your day: {summary}</p>
          <p class="hint">
            If a day runs past midnight, it stays one day until you end it. Late nights count as the day you started.
          </p>
          <div class="actions">
            <button class="pri" onclick={() => (step = 3)}>Next</button>
            <button class="text" onclick={() => (step = 1)}>Back</button>
          </div>
        {:else}
          <img class="mark" src={icon} alt="" width="64" height="64" />
          <h2>You're set.</h2>
          <p class="summary">Your day: {summary}</p>
          <p class="hint">You can change this any time in Settings.</p>
          <div class="actions">
            <button class="pri" onclick={() => finish('add')}>Add your first task</button>
            <button class="sec" onclick={() => finish('sample')}>Try a sample day</button>
            <button class="text" onclick={() => finish()}>Start with an empty day</button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .welcome:focus {
    outline: none;
  }
  .welcome {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--bg);
    overflow-y: auto;
    display: flex;
  }
  .inner {
    margin: auto;
    width: 100%;
    max-width: 440px;
    padding: calc(40px + env(safe-area-inset-top)) 24px calc(32px + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .mark {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    margin-bottom: 6px;
  }
  h1 {
    margin: 0;
    font: 400 32px/1.12 var(--font);
    letter-spacing: -0.025em;
    text-wrap: balance;
  }
  h2 {
    margin: 0 0 4px;
    font: 400 24px/1.2 var(--font);
    letter-spacing: -0.015em;
    text-wrap: balance;
  }
  .lead {
    margin: 0;
    font: 400 16px/1.55 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .count {
    margin: 0;
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
  .summary {
    margin: 6px 0 0;
    font: 400 16px/1.4 var(--font);
  }
  .hint {
    margin: 0;
    font: 400 13px/1.5 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 14px;
  }
  .actions button {
    height: 52px;
    border-radius: 14px;
    font: 400 16px/1 var(--font);
    cursor: pointer;
  }
  .pri {
    border: none;
    background: var(--text);
    color: var(--bg);
  }
  .sec {
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
  }
  .text {
    border: none;
    background: transparent;
    color: var(--muted);
  }
  .err {
    color: var(--redT);
  }
</style>
