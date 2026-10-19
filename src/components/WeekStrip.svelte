<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { dayDot } from '../lib/rows';
  import { keyDate, longDate } from '../lib/time';

  const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const week = $derived(
    P.weekKeys.map((k, i) => {
      const d = keyDate(k);
      return {
        k,
        l: LETTERS[i],
        n: d.getDate(),
        aria: longDate(d),
        sel: k === P.viewKey,
        isT: k === P.today,
        dot: dayDot(P.days[k], k, P.today),
      };
    }),
  );
</script>

<nav class="week" aria-label="Week">
  <button class="arrow" aria-label="Previous week" onclick={() => P.shiftWeek(-1)}>‹</button>
  {#each week as d (d.k)}
    <button
      class="day"
      class:sel={d.sel}
      class:today={d.isT && !d.sel}
      aria-label={d.aria}
      aria-current={d.sel ? 'date' : undefined}
      onclick={() => P.switchDay(d.k)}
    >
      <span class="l">{d.l}</span>
      <span class="n">{d.n}</span>
      <span class="dot" class:ringed={d.sel && d.dot} style:background={d.dot ?? 'transparent'}></span>
    </button>
  {/each}
  <button class="arrow" aria-label="Next week" onclick={() => P.shiftWeek(1)}>›</button>
</nav>

<style>
  .week {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 12px calc(var(--px) - 6px) 2px;
  }
  .arrow {
    width: 26px;
    height: 44px;
    border: none;
    background: transparent;
    color: var(--faint);
    font: 400 18px/1 var(--font);
    cursor: pointer;
    flex: none;
  }
  .day {
    flex: 1 1 0;
    min-width: 0;
    height: 56px;
    border: none;
    border-radius: var(--r-card);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    background: transparent;
    color: var(--text);
    box-sizing: border-box;
    padding: 0;
    transition:
      background 240ms,
      color 240ms;
  }
  .day.today {
    border: 1px solid var(--line);
  }
  .day.sel {
    background: var(--text);
    color: var(--bg);
  }
  .l {
    font: 400 11px/1 var(--font);
    opacity: 0.7;
  }
  .n {
    font: 400 16px/1 var(--font);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: var(--r-sm);
  }
  .dot.ringed {
    box-shadow: 0 0 0 1.5px var(--text);
  }
</style>
