<script lang="ts">
  import { retime } from '../lib/actions';
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, isPartial, schedule } from '../lib/schedule';
  import { dL, fT } from '../lib/time';
  import { hueColor, untimed } from '../lib/types';
  import SaveRow from './SaveRow.svelte';
  import TimeAdjust from './TimeAdjust.svelte';

  // Correcting a task's recorded times, in its sheet: when it started (and finished, once done)
  // as chips. Tapping one opens a strip of time to move it, with a step either way and a box to
  // type the time. Nothing changes until Save; meanwhile it says how the rest of the day would move.
  let { id }: { id: string } = $props();
  const it = $derived(P.item(id));
  const b = $derived(P.timeBounds(id));
  const active = $derived(!!it && isActive(it));
  const c24 = $derived(P.settings.clock24);

  let which = $state<'start' | 'end' | null>(null);
  let draft = $state<number | null>(null);
  const recorded = $derived(!it ? 0 : which === 'end' ? (it.endedAt ?? 0) : (it.startedAt ?? 0));
  const value = $derived(draft ?? recorded);
  const changed = $derived(draft != null && Math.round(draft) !== Math.round(recorded));
  const patch = $derived(which === 'end' ? { end: value } : { start: value });
  // The day as it would be with the change, to draw it and say what it does.
  const preview = $derived(changed ? retime(P.day, id, patch, P.n, P.n) : P.day);
  const pit = $derived(preview.items.find((i) => i.id === id) ?? it);
  const range = $derived<[number, number]>(!b ? [value, value] : which === 'end' && b.end ? b.end : b.start);
  const span = $derived<[number, number] | null>(
    pit?.startedAt != null ? [pit.startedAt, active ? P.n : (pit.endedAt ?? pit.startedAt)] : null,
  );
  const others = $derived(
    P.day.items
      .filter((i) => i.id !== id && i.startedAt != null && (isActive(i) || i.status === 'done' || isPartial(i)))
      .map((i): [number, number] => [i.startedAt!, isActive(i) ? P.n : (i.endedAt ?? i.startedAt!)]),
  );

  // How the rest of the day would move (a running task pushes what follows).
  const row = $derived(P.sch.rows.find((r) => r.it.id === id));
  const later = $derived(
    !!row && P.sch.rows.some((r) => r.idx > row.idx && r.it.status === 'todo' && !untimed(r.it.kind)),
  );
  const shift = $derived.by(() => {
    if (!row || !changed) return 0;
    const moved = schedule(P.planOf(preview), P.n).rows.find((r) => r.it.id === id);
    return moved ? Math.round(moved.end - row.end) : 0;
  });

  function pick(k: 'start' | 'end') {
    which = which === k ? null : k;
    draft = null;
  }
  function close() {
    which = null;
    draft = null;
  }
  function save() {
    if (changed) P.retime(id, patch);
    close();
  }
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
        onchange={(v) => (draft = v)}
      />
      <p class="note">
        {#if active}
          {shift && later
            ? `What comes after it moves ${dL(Math.abs(shift))} ${shift < 0 ? 'earlier' : 'later'}.`
            : 'Move it to when you really started.'}
        {:else if pit?.startedAt != null}
          Took {dL((pit.endedAt ?? pit.startedAt) - pit.startedAt - pit.pausedFor)}{pit.pausedFor >= 1
            ? `, paused ${dL(pit.pausedFor)}`
            : ''}.
        {/if}
      </p>
      <SaveRow ok={changed} onsave={save} oncancel={close} />
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
