<script lang="ts">
  // The title bar of a list on the day (Checklist, Habits, Projects, Timed tasks): a tinted band
  // with the list's two-tone icon, its name and how many are done. Inside a card (`inset`) it runs
  // across the card's top; on its own it's a band of its own.
  // With `ontoggle`, the whole bar is a button that folds the list under it open and shut.
  let {
    icon,
    title,
    tally = '',
    inset = false,
    open = false,
    ontoggle,
    controls,
  }: {
    icon: 'checks' | 'habits' | 'projects' | 'timed' | 'someday' | 'upcoming';
    title: string;
    tally?: string;
    inset?: boolean;
    open?: boolean;
    ontoggle?: () => void;
    controls?: string;
  } = $props();
</script>

{#snippet glyph()}
  <svg viewBox="0 0 22 22" width="20" height="20" aria-hidden="true">
    {#if icon === 'checks'}
      <rect x="3" y="3.5" width="6.5" height="6.5" rx="1.5" class="a" />
      <path d="M4.6 6.9l1.3 1.3 2-2.4" class="b" />
      <rect x="3" y="12.5" width="6.5" height="6.5" rx="1.5" class="a" />
      <path d="M13 6.75h6M13 15.75h6" class="a" />
    {:else if icon === 'habits'}
      <circle cx="11" cy="11" r="7.5" class="a soft" />
      <circle cx="11" cy="11" r="7.5" class="b arc" />
    {:else if icon === 'projects'}
      <rect x="3" y="3.5" width="16" height="15" rx="2" class="a" />
      <path d="M8.5 3.5v15M14 3.5v15" class="a" />
      <path d="M5.2 7h1.2" class="b" />
    {:else if icon === 'someday'}
      <rect x="3" y="8" width="16" height="11" rx="2" class="a" />
      <path d="M5.5 4.5h11" class="a" />
      <circle cx="11" cy="13.5" r="1.6" class="b dot" />
    {:else if icon === 'upcoming'}
      <rect x="3" y="4" width="16" height="15" rx="2" class="a" />
      <path d="M3 9h16M8 2v4M14 2v4" class="a" />
      <path d="M8 14h6" class="b" />
    {:else}
      <path d="M5 3.5v6" class="b thick" />
      <path d="M5 13v5.5" class="a thick" />
      <path d="M9.5 6.5h9M9.5 15.75h6.5" class="a" />
    {/if}
  </svg>
{/snippet}

{#if ontoggle}
  <h2 class="shead tog" class:inset class:open>
    <button aria-expanded={open} aria-controls={controls} onclick={ontoggle}>
      {@render glyph()}
      <span class="t">{title}</span>
      {#if tally}<span class="tally">{tally}</span>{/if}
      <svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
    </button>
  </h2>
{:else}
  <div class="shead" class:inset>
    {@render glyph()}
    <h2>{title}</h2>
    {#if tally}<span class="tally">{tally}</span>{/if}
  </div>
{/if}

<style>
  .shead {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 14px 0 12px;
    box-sizing: border-box;
    border-radius: var(--r-card);
    background: color-mix(in oklab, var(--accent) 10%, var(--raised));
  }
  .shead.inset {
    border-radius: var(--r-card) var(--r-card) 0 0;
    border-bottom: 1px solid color-mix(in oklab, var(--accent) 16%, var(--border));
  }
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font: 600 15px/1.2 var(--font);
    letter-spacing: -0.01em;
    color: var(--text);
  }
  /* Folding: the bar is the button; shut, it's a band of its own, open, the top of its card. */
  .tog {
    margin: 0;
    padding: 0;
    font: inherit;
  }
  .tog.open.inset {
    border-radius: var(--r-card) var(--r-card) 0 0;
  }
  .tog:not(.open).inset {
    border-radius: var(--r-card);
    border-bottom: none;
  }
  .tog button {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    margin: 0 -14px 0 -12px;
    padding: 0 14px 0 12px;
    border: none;
    border-radius: inherit;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .t {
    flex: 1;
    min-width: 0;
    font: 600 15px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .chev {
    stroke: var(--muted);
    stroke-width: 1.6;
    transition: transform 200ms ease;
  }
  .open .chev {
    transform: rotate(180deg);
  }
  .dot {
    fill: var(--now);
    stroke: none;
  }
  .tally {
    font: 500 13px/1 var(--font);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  svg {
    flex: none;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .a {
    stroke: var(--accent);
  }
  .b {
    stroke: var(--now);
  }
  .thick {
    stroke-width: 3;
  }
  .soft {
    stroke-opacity: 0.35;
  }
  .arc {
    stroke-width: 2.2;
    stroke-dasharray: 30 47.2;
    transform: rotate(-90deg);
    transform-origin: 11px 11px;
  }
</style>
