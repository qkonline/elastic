<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, isPartial } from '../lib/schedule';
  import { fT, hhmm, hm } from '../lib/time';
  import TimeAdjust from './TimeAdjust.svelte';

  // Before the day starts: where the plan begins, and the wrap-up. Once it has started: when it
  // really started (if Start my day was tapped late, or early), and the wrap-up.
  const started = P.day.dayStarted;
  const bounds = P.dayStartBounds();
  // The day's tasks on the record, so it shows why the start can't go past the first of them.
  const done = P.day.items
    .filter((i) => i.startedAt != null && (isActive(i) || i.status === 'done' || isPartial(i)))
    .map((i): [number, number] => [i.startedAt!, isActive(i) ? P.n : (i.endedAt ?? i.startedAt!)]);
  let startedAt = $state(started ?? 0);
  let start = $state(hhmm(P.day.dayStart));
  let wrap = $state(hhmm(P.day.wrap));
  const from = $derived(started != null ? startedAt : start ? hm(start) : null);
  // A wrap-up at or before the start time means the day runs past midnight.
  const nextDay = $derived(from != null && !!wrap && hm(wrap) <= from % 1440);
  function save() {
    if (!start || !wrap) return;
    P.saveHours(hm(start), hm(wrap) + (nextDay ? 1440 : 0), started != null ? startedAt : undefined);
  }
  const note = $derived(
    started != null
      ? 'Move the start if you began before or after you tapped Start my day. Anything planned past your wrap-up gets flagged.'
      : 'The plan begins here until you tap Start my day. Going past the wrap-up time gets flagged, never blocked.',
  );
</script>

<div class="head">
  <span class="h">Day hours</span>
  <span class="note">{note}</span>
</div>
<div class="fields">
  {#if started == null}
    <label>Day starts <input type="time" data-autofocus bind:value={start} /></label>
  {:else if bounds}
    <div class="started">
      <span class="sl">Day started at {fT(startedAt, P.settings.clock24)}</span>
      <TimeAdjust
        value={startedAt}
        range={bounds}
        others={done}
        now={P.isToday ? P.n : null}
        hue="#f43f5e"
        clock24={P.settings.clock24}
        label="Day started at"
        late={Math.max(P.day.wrap, P.n)}
        onchange={(v) => (startedAt = v)}
      />
    </div>
  {/if}
  <label
    >Wrap up by
    <span class="w"
      >{#if nextDay}<span class="nd">next day</span>{/if}<input type="time" bind:value={wrap} /></span
    ></label
  >
</div>
<div class="foot">
  <button class="cancel" onclick={() => P.closeSheet()}>Cancel</button>
  <button class="save" onclick={save}>Save</button>
</div>

<style>
  .head {
    padding: 22px 20px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .h {
    font: 600 20px/1.2 var(--font);
  }
  .note {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .fields {
    padding: 10px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .started {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 6px;
  }
  .sl {
    font: 400 15px/1.2 var(--font);
  }
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font: 400 15px/1 var(--font);
  }
  input {
    height: 44px;
    padding: 0 10px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--sunk);
    color: var(--text);
    font: 400 15px/1 var(--font);
  }
  .w {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nd {
    font: 400 12px/1 var(--font);
    color: var(--muted);
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 20px 20px;
  }
  .cancel,
  .save {
    height: 44px;
    border-radius: var(--r-ctl);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .cancel {
    padding: 0 16px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
  }
  .save {
    padding: 0 20px;
    border: none;
    background: var(--text);
    color: var(--bg);
  }
</style>
