<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { reducedMotion } from '../lib/ui.svelte';

  // An optional property of a task: a switch with a line saying what it means, and its choices
  // unfolding underneath while it's on. Used by the New task and task sheets.
  let {
    label,
    note,
    on,
    disabled = false,
    ontoggle,
    children,
  }: {
    label: string;
    note: string;
    on: boolean;
    disabled?: boolean;
    ontoggle: () => void;
    children?: Snippet;
  } = $props();
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 220, easing: cubicOut });
</script>

<div class="prop">
  <button class="toggle" role="switch" aria-checked={on} {disabled} onclick={ontoggle}>
    <span class="tt">
      <span class="tn">{label}</span>
      <span class="ts">{note}</span>
    </span>
    <span class="switch" class:on><span></span></span>
  </button>
  {#if on && children}
    <div class="more" transition:slide={unfold()}>{@render children()}</div>
  {/if}
</div>

<style>
  .prop:not(:first-child) {
    border-top: 1px solid var(--border);
  }
  .toggle {
    width: 100%;
    min-height: 64px;
    padding: 12px 14px 12px 16px;
    border: none;
    background: transparent;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 14px;
    text-align: left;
    cursor: pointer;
  }
  .toggle:disabled {
    cursor: default;
  }
  .toggle:disabled .switch {
    opacity: 0.45;
  }
  .toggle:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -4px;
    border-radius: var(--r-ctl);
  }
  .tt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tn {
    font: 400 15px/1.2 var(--font);
  }
  .ts {
    font: 400 13px/1.35 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .more {
    padding: 0 16px 16px;
  }
</style>
