<script lang="ts">
  import { type Snippet, untrack } from 'svelte';
  import { reducedMotion } from '../lib/ui.svelte';

  // A list section on the day (Checklist, Habits) that folds away once it has more than three
  // entries. Folded, the first three stay in view with the third fading out, so it's plain there
  // is more. Each section remembers on this device whether it was folded.
  let {
    id,
    label,
    count,
    head,
    children,
    list = $bindable(null),
    kind = '',
  }: {
    /** Remembered under this name. */
    id: string;
    label: string;
    count: number;
    head: Snippet;
    /** The entries, as <li>s. `folded`: entries past the third are out of view. */
    children: Snippet<[boolean]>;
    list?: HTMLUListElement | null;
    /** An extra class for the section (what's in it). */
    kind?: string;
  } = $props();

  // Each section is keyed by its id, which never changes while it's on screen.
  const KEY = untrack(() => `elastic-day:folded:${id}`);
  const FOLD_AT = 3;
  function read(): boolean {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  }
  let folded = $state(read());
  const can = $derived(count > FOLD_AT);
  const shut = $derived(can && folded);

  function toggle() {
    folded = !folded;
    try {
      localStorage.setItem(KEY, folded ? '1' : '0');
    } catch {
      /* storage blocked: it just won't be remembered */
    }
  }

  // The folded height ends partway down the third entry; the open height fits them all.
  let full = $state(0);
  let short = $state(0);
  function measure() {
    if (!list) return;
    full = list.scrollHeight;
    const third = list.children[FOLD_AT - 1] as HTMLElement | undefined;
    short = third ? third.offsetTop + third.offsetHeight * 0.6 : full;
  }
  $effect(() => {
    if (!list) return;
    void count;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  });
  const uid = untrack(() => `sec-${id}`);
</script>

<section class="sec {kind}" aria-label={label}>
  <div class="head">
    {@render head()}
    {#if can}
      <button
        class="chev hit"
        aria-expanded={!shut}
        aria-controls={uid}
        aria-label={shut ? `Show all ${count}` : 'Show fewer'}
        onclick={toggle}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" class:up={!shut}
          ><path d="M4 6l4 4 4-4" /></svg
        >
      </button>
    {/if}
  </div>
  <div
    class="clip"
    class:shut
    class:still={reducedMotion.current}
    id={uid}
    style:height={can && full ? `${shut ? short : full}px` : undefined}
  >
    <ul bind:this={list}>
      {@render children(shut)}
    </ul>
  </div>
  {#if can}
    <button class="more" onclick={toggle}>{shut ? `Show all ${count}` : 'Show fewer'}</button>
  {/if}
</section>

<style>
  .sec {
    margin: 14px var(--px) 2px;
    padding: 12px 14px 6px 16px;
    border-radius: 16px;
    background: var(--raised);
    border: 1px solid var(--border);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 4px;
    min-height: 28px;
  }
  .chev {
    --hit-x: 12px;
    --hit-y: 10px;
    width: 28px;
    height: 28px;
    margin: -4px -6px -4px 0;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .chev svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 240ms ease;
  }
  .chev svg.up {
    transform: rotate(180deg);
  }
  .clip {
    overflow: hidden;
    transition: height 280ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .clip.shut {
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 30px), transparent);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 30px), transparent);
  }
  .clip.still {
    transition: none;
  }
  ul {
    position: relative; /* rows measure their place (offsetTop) from the list */
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .more {
    display: block;
    width: 100%;
    height: 40px;
    margin-top: 2px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 13px/1 var(--font);
    cursor: pointer;
    text-align: center;
  }
  .more:hover {
    color: var(--text);
  }
  @media (prefers-reduced-motion: reduce) {
    .clip,
    .chev svg {
      transition: none;
    }
  }
</style>
