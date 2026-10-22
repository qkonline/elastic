<script lang="ts">
  // The title bar of a list on the day (Checklist, Habits, Projects, Timed tasks): a tinted band
  // with the list's two-tone icon, its name and how many are done. Inside a card (`inset`) it runs
  // across the card's top; on its own it's a band of its own.
  let {
    icon,
    title,
    tally = '',
    inset = false,
  }: {
    icon: 'checks' | 'habits' | 'projects' | 'timed';
    title: string;
    tally?: string;
    inset?: boolean;
  } = $props();
</script>

<div class="shead" class:inset>
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
    {:else}
      <path d="M5 3.5v6" class="b thick" />
      <path d="M5 13v5.5" class="a thick" />
      <path d="M9.5 6.5h9M9.5 15.75h6.5" class="a" />
    {/if}
  </svg>
  <h2>{title}</h2>
  {#if tally}<span class="tally">{tally}</span>{/if}
</div>

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
