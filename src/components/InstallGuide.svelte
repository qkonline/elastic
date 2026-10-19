<script lang="ts">
  import { install } from '../lib/install.svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { isMacSafari } from '../lib/platform';

  // Safari can't be asked to install from a button, so show the two or three taps it takes.
  const mac = isMacSafari();
</script>

<div class="head">
  <span class="h">{mac ? 'Add to your Dock' : 'Add to your Home Screen'}</span>
  <span class="note">Elastic then opens from its own icon, in its own window, like any other app.</span>
</div>
{#if install.installed}
  <p class="done">It's installed. You can open Elastic from its icon now.</p>
{:else if mac}
  <ol>
    <li>In Safari's menu bar, open <b>File</b>.</li>
    <li>Choose <b>Add to Dock…</b></li>
    <li>Click <b>Add</b>.</li>
  </ol>
{:else}
  <ol>
    <li>
      Tap the <b>Share</b> button <span class="share" aria-hidden="true"></span> in Safari (at the bottom of the screen, or
      next to the address bar).
    </li>
    <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
    <li>Tap <b>Add</b>.</li>
  </ol>
{/if}
<div class="foot">
  <button class="ok" onclick={() => P.closeSheet()}>Got it</button>
</div>

<style>
  .head {
    padding: 22px 20px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .h {
    font: 600 20px/1.2 var(--font);
  }
  .note,
  .done {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .done {
    margin: 10px 20px;
  }
  ol {
    margin: 10px 20px 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font: 400 15px/1.45 var(--font);
  }
  b {
    font-weight: 400;
    color: var(--text);
    background: var(--sunk);
    padding: 1px 6px;
    border-radius: 6px;
  }
  /* A small drawing of Safari's share icon: a box with an arrow out of the top. */
  .share {
    display: inline-block;
    width: 12px;
    height: 11px;
    margin: 0 2px -1px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 2px;
    position: relative;
  }
  .share::before {
    content: '';
    position: absolute;
    left: 50%;
    top: -7px;
    width: 1.5px;
    height: 11px;
    margin-left: -0.75px;
    background: currentColor;
  }
  .share::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -7px;
    width: 5px;
    height: 5px;
    margin-left: -3.5px;
    border-left: 1.5px solid currentColor;
    border-top: 1.5px solid currentColor;
    transform: rotate(45deg);
    transform-origin: center;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    padding: 20px;
  }
  .ok {
    height: 44px;
    padding: 0 20px;
    border-radius: var(--r-ctl);
    border: none;
    background: var(--text);
    color: var(--bg);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
</style>
