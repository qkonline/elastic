<script lang="ts">
  import { leftAtEnd, planner as P, stoppedBy } from '../lib/planner.svelte';
  import { isActive, worked } from '../lib/schedule';
  import { dayDiff, dL, fT, keyDate, longDate, minutesInto, weekdayLong } from '../lib/time';
  import { type Item, SOMEDAY } from '../lib/types';

  // On Today, when the last day worked on was never ended: what to do with what was left on it.
  // Nothing moves until a button is tapped, and each one ends that day, so it's asked once.
  const d = $derived(P.view === 'day' && P.isToday && !P.locked ? P.leftDay : null);
  const name = $derived(
    !d
      ? ''
      : dayDiff(P.today, d.key) === -1
        ? 'Yesterday'
        : dayDiff(P.today, d.key) > -7
          ? weekdayLong(keyDate(d.key))
          : longDate(keyDate(d.key)),
  );
  const act = $derived(d?.items.find(isActive) ?? null);
  const until = $derived(d && act ? stoppedBy(d, act, minutesInto(d.key, P.clock)) : 0);
  const left = $derived(d ? d.items.filter(leftAtEnd) : []);
  // A timer left paused wasn't finished: what's left of it can come along.
  const rows = $derived([
    ...(act && act.status === 'paused' && !act.card && act.repeat === 'Once' ? [act] : []),
    ...left,
  ]);
  const rest = (i: Item) => (isActive(i) ? Math.max(5, Math.round(i.min - worked(i, until))) : i.min);
  const total = $derived(rows.reduce((s, i) => s + rest(i), 0));

  let choosing = $state(false);
  // Ticked unless said otherwise; a meeting that's over shouldn't follow you.
  let off = $state<Record<string, boolean>>({});
  const on = (i: Item) => !(off[i.id] ?? i.kind === 'fixed');
  const picked = $derived(rows.filter(on).map((i) => i.id));
  const go = (ids: string[], to: string) => {
    if (d) void P.endLeftDay(d.key, ids, to);
    choosing = false;
  };
</script>

{#if d}
  <section class="card" aria-label="{name} wasn't ended">
    <div class="t">
      <h2>{name} wasn't ended</h2>
      <p>
        {#if rows.length}
          {rows.length === 1 ? `${rows[0].title} is` : `${rows.length} things are`} left{total ? `, ${dL(total)}` : ''}.
        {/if}
        {#if act && act.status === 'running' && !act.card}
          {act.title} was left running. It counts as finished when its time was up, {fT(until, P.settings.clock24)}.
        {:else if act?.card}
          {act.title} was left {act.status}. It will be set aside.
        {/if}
        <button class="link" onclick={() => void P.switchDay(d.key)}
          >Look at {name === 'Yesterday' ? 'yesterday' : name}</button
        >
      </p>
    </div>

    {#if rows.length > 1 && choosing}
      <ul>
        {#each rows as it (it.id)}
          <li>
            <label>
              <input type="checkbox" checked={on(it)} onchange={() => (off[it.id] = on(it))} />
              <span class="what">{it.title}</span>
              {#if rest(it)}<span class="m">{dL(rest(it))}</span>{/if}
            </label>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="acts">
      {#if rows.length}
        <button class="pri" disabled={!picked.length} onclick={() => go(picked, P.today)}
          >{rows.length === 1 ? 'Move it to today' : `Move ${picked.length} to today`}</button
        >
        <button disabled={!picked.length} onclick={() => go(picked, SOMEDAY)}>To Someday</button>
        <button onclick={() => go([], P.today)}>Leave {rows.length === 1 ? 'it' : 'them'}</button>
        {#if rows.length > 1 && !choosing}<button class="link" onclick={() => (choosing = true)}>Choose</button>{/if}
      {:else}
        <button class="pri" onclick={() => go([], P.today)}>End {name === 'Yesterday' ? 'yesterday' : name}</button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .card {
    margin: 12px var(--px) 2px;
    padding: 14px 16px;
    border-radius: var(--r-card);
    border: 1px solid var(--border);
    background: var(--raised);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    margin: 0 0 4px;
    font: 600 15px/1.3 var(--font);
  }
  p {
    margin: 0;
    font: 400 14px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .acts button {
    height: 44px;
    padding: 0 16px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .acts .pri {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
  }
  button:disabled {
    opacity: 0.45;
  }
  .link,
  .acts .link {
    border: none;
    background: none;
    padding: 0 4px;
    color: var(--accentT);
    font: inherit;
    cursor: pointer;
  }
  .acts .link {
    font: 400 14px/1 var(--font);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  label {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    cursor: pointer;
  }
  input {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--text);
  }
  .what {
    flex: 1;
    min-width: 0;
    font: 400 15px/1.3 var(--font);
  }
  .m {
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
</style>
