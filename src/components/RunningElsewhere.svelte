<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { isOver, worked } from '../lib/schedule';
  import { cd, dayDiff, keyDate, minutesInto, shortDate } from '../lib/time';

  // A timer left running (or paused) on another day, e.g. started last night.
  const e = $derived(P.screen.type === 'today' ? P.elsewhere : P.activeAnywhere);
  const w = $derived(e ? worked(e.it, minutesInto(e.key, P.clock)) : 0);
  // Left going on a day that's over: how long that says is no use. Today's card (UnfinishedDay)
  // asks what to do with it, so there it isn't said twice.
  const stale = $derived(!!e && !!P.days[e.key] && isOver(P.days[e.key], minutesInto(e.key, P.clock)));
  const asked = $derived(stale && P.screen.type === 'today' && P.view === 'day' && P.leftDay?.key === e?.key);
  // Work on a Boardo card counts up; anything else counts down to its time's up.
  const left = $derived(e ? (e.it.card ? w * 60 : (e.it.min - w) * 60) : 0);
  // Planning another day while today's timer runs, or a timer left going on an earlier day.
  const status = $derived.by(() => {
    if (!e) return '';
    const paused = e.it.status === 'paused';
    if (e.key === P.today) return paused ? 'Paused today' : 'Running today';
    const when = dayDiff(P.today, e.key) === -1 ? 'yesterday' : shortDate(keyDate(e.key));
    return `${paused ? 'Paused' : 'Still running'} from ${when}`;
  });
</script>

{#if e && !asked}
  <div class="banner" class:paused={e.it.status === 'paused'} class:over={left < 0 && !stale} role="status">
    <div class="text">
      <span class="t">{e.it.title}</span>
      <span class="s">{status}</span>
    </div>
    {#if !stale}<span class="count">{left >= 0 ? cd(left) : '+' + cd(-left)}</span>{/if}
    <button
      class="go"
      onclick={() => {
        if (P.screen.type !== 'today') P.openScreen({ type: 'today' });
        void P.switchDay(e.key);
      }}>Go to it</button
    >
  </div>
{/if}

<style>
  .banner {
    margin: 10px var(--px) 0;
    padding: 10px 10px 10px 16px;
    border-radius: var(--r-card);
    background: rgba(250, 204, 21, 0.12);
    box-shadow: inset 0 0 0 1.5px rgba(234, 179, 8, 0.6);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .banner.over {
    background: rgba(248, 113, 113, 0.08);
    box-shadow: inset 0 0 0 1.5px rgba(248, 113, 113, 0.55);
  }
  .banner.paused {
    background: color-mix(in oklab, var(--muted) 9%, transparent);
    box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--muted) 45%, transparent);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .t {
    font: 400 15px/1.3 var(--font);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s {
    font: 400 12px/1.2 var(--font);
    color: var(--muted);
  }
  .count {
    font: 400 17px/1 var(--font);
    color: var(--orT);
  }
  .over .count {
    color: var(--redT);
  }
  .paused .count {
    color: var(--muted);
  }
  .go {
    height: var(--btn);
    padding: 0 14px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
    white-space: nowrap;
  }
</style>
