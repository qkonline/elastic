<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, isPartial } from '../lib/schedule';
  import { dL, fT } from '../lib/time';
  import { hueColor, untimed } from '../lib/types';
  import TimeAdjust from './TimeAdjust.svelte';

  // Correcting a task's recorded times, in its sheet: when it started (and finished, once done)
  // as chips. Tapping one opens a strip of time to move it, with a step either way and a box to
  // type the time. Changes apply as you go; the rest of the day follows.
  let { id }: { id: string } = $props();
  const it = $derived(P.item(id));
  const b = $derived(P.timeBounds(id));
  const active = $derived(!!it && isActive(it));
  const c24 = $derived(P.settings.clock24);

  let which = $state<'start' | 'end' | null>(null);
  const value = $derived(!it ? 0 : which === 'end' ? (it.endedAt ?? 0) : (it.startedAt ?? 0));
  const range = $derived<[number, number]>(!b ? [value, value] : which === 'end' && b.end ? b.end : b.start);
  const span = $derived<[number, number] | null>(
    it?.startedAt != null ? [it.startedAt, active ? P.n : (it.endedAt ?? it.startedAt)] : null,
  );
  const others = $derived(
    P.day.items
      .filter((i) => i.id !== id && i.startedAt != null && (isActive(i) || i.status === 'done' || isPartial(i)))
      .map((i): [number, number] => [i.startedAt!, isActive(i) ? P.n : (i.endedAt ?? i.startedAt!)]),
  );

  // How the rest of the day moved since the strip was opened (a running task pushes what follows).
  const row = $derived(P.sch.rows.find((r) => r.it.id === id));
  const later = $derived(
    !!row && P.sch.rows.some((r) => r.idx > row.idx && r.it.status === 'todo' && !untimed(r.it.kind)),
  );
  let openedEnd = $state(0);
  const shift = $derived(row && which ? Math.round(row.end - openedEnd) : 0);

  function pick(k: 'start' | 'end') {
    which = which === k ? null : k;
    openedEnd = row?.end ?? 0;
  }
  const set = (v: number) => P.retime(id, which === 'end' ? { end: v } : { start: v });
</script>

{#if it?.startedAt != null}
  <div class="chips">
    <button
      class="chip"
      aria-pressed={which === 'start'}
      aria-expanded={which === 'start'}
      onclick={() => pick('start')}>Started {fT(it.startedAt, c24)}</button
    >
    {#if !active && it.endedAt != null}
      <button class="chip" aria-pressed={which === 'end'} aria-expanded={which === 'end'} onclick={() => pick('end')}
        >Finished {fT(it.endedAt, c24)}</button
      >
    {/if}
  </div>

  {#if which && !P.locked}
    <div class="edit">
      <TimeAdjust
        {value}
        {range}
        {span}
        {others}
        now={P.isToday ? P.n : null}
        hue={hueColor(it.hue)}
        clock24={c24}
        label={which === 'end' ? 'Finished at' : 'Started at'}
        late={Math.max(P.day.wrap, P.n)}
        onchange={set}
      />
      <p class="note">
        {#if active}
          {shift && later
            ? `What comes after it moves ${dL(Math.abs(shift))} ${shift < 0 ? 'earlier' : 'later'}.`
            : 'Move it to when you really started.'}
        {:else}
          Took {dL((it.endedAt ?? it.startedAt) - it.startedAt - it.pausedFor)}{it.pausedFor >= 1
            ? `, paused ${dL(it.pausedFor)}`
            : ''}.
        {/if}
      </p>
    </div>
  {/if}
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .edit {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 10px;
  }
  .note {
    margin: 0;
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
  }
</style>
