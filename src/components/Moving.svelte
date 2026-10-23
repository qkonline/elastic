<script lang="ts">
  import { onMount } from 'svelte';
  import { installed, MOVED_TO } from '../lib/move';
  import { planner as P } from '../lib/planner.svelte';

  // The last build left at the app's old address: it brings this copy's latest changes to the
  // account, then opens the new address, signed in. A Home Screen app asks first, since its icon
  // keeps the old address and needs adding again.
  const icon = import.meta.env.BASE_URL + 'icon.svg?v=4';
  const host = new URL(MOVED_TO).host;
  const fromHomeScreen = installed();
  let asked = $state(!fromHomeScreen);

  const go = () => {
    asked = true;
    void P.moveHome();
  };
  onMount(() => {
    if (!fromHomeScreen) go();
  });
</script>

<div class="gate" role="dialog" aria-modal="true" aria-label="Elastic has moved">
  <main class="inner">
    <img class="mark" src={icon} alt="" width="56" height="56" />
    <h1>Elastic has moved</h1>
    <p class="lede">It now lives at <strong>{host}</strong>. Your plan and your sign-in come with you.</p>

    {#if !asked}
      <p class="lede">
        This Home Screen app still opens the old address. When the new one opens, add it to your Home Screen again, then
        remove this one.
      </p>
      <button class="key ink" onclick={go}>Open the new Elastic</button>
    {:else}
      <p class="status" role="status">
        {P.moving === 'offline'
          ? "You're offline. Connect to the internet to bring your latest changes across."
          : P.moving === 'unreachable'
            ? `${host} can't be reached from this network yet. It keeps trying, so you can leave this open.`
            : P.moving === 'going'
              ? 'Opening the new Elastic…'
              : 'Bringing your latest changes across…'}
      </p>
    {/if}
  </main>
</div>

<style>
  .gate {
    position: fixed;
    inset: 0;
    z-index: 40;
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
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .mark {
    width: 56px;
    height: 56px;
    border-radius: var(--r-card);
  }
  h1 {
    margin: 0;
    font: 600 32px/1.12 var(--font);
    letter-spacing: -0.025em;
  }
  .lede {
    margin: 0;
    font: 400 16px/1.55 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .lede strong {
    font-weight: 600;
    color: var(--text);
  }
  .status {
    margin: 6px 0 0;
    font: 400 15px/1.45 var(--font);
  }
  .key {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 52px;
    margin: 6px 0 4px;
    border-radius: var(--r-card);
    border: 1px solid var(--text);
    background: var(--text);
    color: var(--bg);
    box-shadow: 0 4px 0 color-mix(in oklab, var(--text) 55%, var(--bg));
    font: 500 16px/1 var(--font);
    cursor: pointer;
  }
  .key:active {
    translate: 0 3px;
    box-shadow: 0 1px 0 color-mix(in oklab, var(--text) 55%, var(--bg));
  }
</style>
