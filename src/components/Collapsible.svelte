<script lang="ts">
  import { type Snippet, untrack } from 'svelte';
  import { reducedMotion } from '../lib/ui.svelte';
  import SectionHead from './SectionHead.svelte';

  // A list section on the day (Checklist, Habits, Projects) under its title bar. Past three
  // entries it's folded: the first three stay in view with the third fading out, above a Show all
  // button. It always opens folded; Show all opens it until the next time it's shown.
  // With `bar` it shuts down to its title bar, which opens it (a started day on a computer, so
  // the timeline comes up the screen; the user's pick, 1 Nov 2026). `opened` says whether it is.
  // With `fold` false the list is never folded to three (Projects, whose boards fold instead).
  let {
    id,
    label,
    icon,
    tally = '',
    count,
    children,
    strip,
    list = $bindable(null),
    kind = '',
    bar = false,
    opened = $bindable(false),
    fold = true,
  }: {
    id: string;
    label: string;
    icon: 'checks' | 'habits' | 'projects';
    /** "1/5": how many are done. */
    tally?: string;
    count: number;
    /** The entries, as <li>s. `folded`: entries past the third are out of view. */
    children: Snippet<[boolean]>;
    /** Shown under the title bar, above the entries. */
    strip?: Snippet;
    list?: HTMLUListElement | null;
    /** An extra class for the section (what's in it). */
    kind?: string;
    /** Shut to the title bar until it's opened. */
    bar?: boolean;
    opened?: boolean;
    fold?: boolean;
  } = $props();

  const barShut = $derived(bar && !opened);

  const FOLD_AT = 3;
  let folded = $state(true);
  const can = $derived(fold && count > FOLD_AT);
  const shut = $derived(can && folded);

  // The folded height ends partway down the third entry; the open height fits them all.
  let full = $state(0);
  let short = $state(0);
  function measure() {
    if (!list) return;
    full = list.scrollHeight;
    const third = list.children[FOLD_AT - 1] as HTMLElement | undefined;
    short = third ? third.offsetTop + third.offsetHeight * 0.7 : full;
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

<section class="sec {kind}" class:barred={barShut} aria-label={label}>
  {#if bar}
    <SectionHead
      {icon}
      title={label}
      {tally}
      inset
      open={opened}
      ontoggle={() => (opened = !opened)}
      controls="{uid}-all"
    />
  {:else}
    <SectionHead {icon} title={label} {tally} inset />
  {/if}
  {#if !barShut}
    <div class="all" id="{uid}-all">
      {#if strip}{@render strip()}{/if}
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
        <button class="more hit" aria-expanded={!shut} aria-controls={uid} onclick={() => (folded = !folded)}
          >{shut ? `Show all ${count}` : 'Show fewer'}<svg
            viewBox="0 0 12 12"
            width="11"
            height="11"
            aria-hidden="true"
            class:up={!shut}><path d="M3 4.5l3 3 3-3" /></svg
          ></button
        >
      {/if}
    </div>
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
  .sec.barred {
    padding-bottom: 0;
  }
  .all {
    display: flex;
    flex-direction: column;
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
  /* Show all / Show fewer: a link-like control under the list, its arrow turning with it. */
  .more {
    --hit-x: 12px;
    --hit-y: 10px;
    position: relative;
    align-self: center;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    margin: 2px 0 4px;
    padding: 0 4px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--accent);
    font: 500 13px/1 var(--font);
    cursor: pointer;
  }
  .more:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .more svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 240ms ease;
  }
  .more svg.up {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .clip,
    .more svg {
      transition: none;
    }
  }
</style>
