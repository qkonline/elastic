<script lang="ts">
  import { type Snippet, untrack } from 'svelte';
  import { reducedMotion } from '../lib/ui.svelte';
  import SectionHead from './SectionHead.svelte';

  // A list section on the day (Checklist, Habits, Projects) under its title bar. Past three
  // entries it's folded: the first three stay in view with the third fading out into a Show all
  // button. It always opens folded; Show all opens it until the next time it's shown.
  let {
    id,
    label,
    icon,
    tally = '',
    count,
    children,
    list = $bindable(null),
    kind = '',
  }: {
    id: string;
    label: string;
    icon: 'checks' | 'habits' | 'projects';
    /** "1/5": how many are done. */
    tally?: string;
    count: number;
    /** The entries, as <li>s. `folded`: entries past the third are out of view. */
    children: Snippet<[boolean]>;
    list?: HTMLUListElement | null;
    /** An extra class for the section (what's in it). */
    kind?: string;
  } = $props();

  const FOLD_AT = 3;
  let folded = $state(true);
  const can = $derived(count > FOLD_AT);
  const shut = $derived(can && folded);

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
  <SectionHead {icon} title={label} {tally} inset />
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
    <button class="more hit" class:over={shut} aria-expanded={!shut} aria-controls={uid} onclick={() => (folded = !folded)}
      >{shut ? `Show all ${count}` : 'Show fewer'}</button
    >
  {/if}
</section>

<style>
  .sec {
    display: flex;
    flex-direction: column;
    margin: 14px var(--px) 2px;
    padding-bottom: 6px;
    border-radius: var(--r-card);
    background: var(--raised);
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
    padding: 2px 14px 0 16px;
  }
  /* A soft key under the list; folded, it sits on the faded tail of the third entry. */
  .more {
    --hit-y: 6px;
    position: relative;
    align-self: center;
    height: 32px;
    margin: 4px 0 6px;
    padding: 0 14px;
    border: none;
    border-radius: var(--r-ctl);
    background: color-mix(in oklab, var(--text) 8%, var(--raised));
    color: var(--text);
    font: 500 13px/1 var(--font);
    cursor: pointer;
  }
  .more.over {
    margin-top: -14px;
  }
  .more:hover {
    background: color-mix(in oklab, var(--text) 13%, var(--raised));
  }
  @media (prefers-reduced-motion: reduce) {
    .clip {
      transition: none;
    }
  }
</style>
