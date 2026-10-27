<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import { ICON_GROUPS, iconFor, isIcon, type IconName } from '../lib/icons';
  import type { Hue } from '../lib/types';
  import { reducedMotion } from '../lib/ui.svelte';
  import TaskIcon from './TaskIcon.svelte';

  // The icon in a check's or habit's Edit form: picked from the name unless one is chosen here.
  // Like the rest of the form, the choice waits for Update.
  let {
    title,
    icon,
    hue,
    onpick,
  }: { title: string; icon: string | null; hue: Hue; onpick: (icon: IconName | null) => void } = $props();

  let open = $state(false);
  const auto = $derived(iconFor(title));
  const chosen = $derived(isIcon(icon) ? icon : null);
  const shown = $derived(chosen ?? auto);
  const unfold = () => ({ duration: reducedMotion.current ? 0 : 220, easing: cubicOut });
  const name = (n: string) => (n.charAt(0).toUpperCase() + n.slice(1)).replace(/-\d*/g, ' ').trim();
</script>

<div class="icon-card">
  <button class="pick" aria-expanded={open} onclick={() => (open = !open)}>
    <TaskIcon name={shown} {hue} size={40} />
    <span class="tt">
      <span class="tn">Icon</span>
      <span class="ts">{chosen ? 'Chosen by you' : 'Picked from the name'}</span>
    </span>
    <span class="go">{open ? 'Done' : 'Change'}</span>
  </button>
  {#if open}
    <div class="all" transition:slide={unfold()}>
      <button class="auto" aria-pressed={!chosen} onclick={() => onpick(null)}>
        <TaskIcon name={auto} {hue} size={32} />
        <span>From the name</span>
      </button>
      {#each ICON_GROUPS as [label, names] (label)}
        <span class="glabel">{label}</span>
        <div class="icons">
          {#each names as n (n)}
            <button
              class="ib"
              aria-pressed={chosen === n}
              aria-label={name(n)}
              title={name(n)}
              onclick={() => onpick(n)}
            >
              <TaskIcon name={n} {hue} size={40} />
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .icon-card {
    border: 1px solid var(--border);
    border-radius: var(--r-card);
    background: var(--raised);
    overflow: hidden;
  }
  .pick {
    width: 100%;
    min-height: 64px;
    padding: 12px 16px;
    border: none;
    background: transparent;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 14px;
    text-align: left;
    cursor: pointer;
  }
  .pick:focus-visible {
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
  }
  .go {
    font: 500 14px/1 var(--font);
    color: var(--accent);
  }
  .all {
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .auto {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 4px 14px 4px 6px;
    border: 1px solid var(--line);
    border-radius: var(--r-ctl);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .glabel {
    margin-top: 6px;
    font: 500 13px/1.2 var(--font);
    color: var(--muted);
  }
  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 4px;
  }
  .ib {
    height: 48px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: var(--r-card);
    background: transparent;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .ib[aria-pressed='true'],
  .auto[aria-pressed='true'] {
    border-color: var(--text);
  }
  .ib:focus-visible,
  .auto:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
