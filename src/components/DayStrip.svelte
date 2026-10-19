<script lang="ts">
  import { planner as P } from '../lib/planner.svelte';
  import { isActive, isPartial, worked } from '../lib/schedule';
  import { apOf, dL, fNZ } from '../lib/time';
  import { hueColor, untimed } from '../lib/types';

  // The day at a glance: every task as a stretch of the strip, as long as the time it takes, in
  // its colour. Done is faded, the running task fills as it goes, idle time is hatched and
  // buffers are dashed; a line marks now. Above it, when the day started (or is planned) and
  // when it's likely done; with times hidden, how much is done and how much is left. Tapping
  // it opens the day's hours.
  const c24 = $derived(P.settings.clock24);
  const d = $derived(P.planDay);
  const started = $derived(d.dayStarted != null);
  const live = $derived(P.isToday && d.dayEnded == null);
  const n = $derived(P.n);
  const times = $derived(P.timesShown);

  interface Seg {
    key: string;
    min: number;
    bg: string;
    kind: 'solid' | 'gap' | 'buffer';
    faded?: boolean;
    /** Running: the share already worked. */
    fill?: number;
  }
  const rows = $derived(
    P.sch.rows.filter(
      (r) => !untimed(r.it.kind) && r.it.status !== 'skipped' && !(r.it.status === 'postponed' && !isPartial(r.it)),
    ),
  );
  const open = $derived(rows.some((r) => (r.it.status === 'todo' || isActive(r.it)) && r.it.kind !== 'buffer'));
  const from = $derived(
    rows.length ? Math.min(rows[0].start - (started ? rows[0].gap : 0), d.dayStarted ?? 1e9) : d.dayStart,
  );
  const likely = $derived(Math.ceil(P.sch.finish / 5) * 5);
  const lastEnd = $derived.by(() => {
    const ends = d.items.map((i) => i.endedAt).filter((x): x is number => x != null);
    return ends.length ? Math.max(...ends) : null;
  });
  const to = $derived(d.dayEnded ?? (rows.length ? Math.max(P.sch.finish, ...rows.map((r) => r.end)) : d.wrap));
  const span = $derived(Math.max(1, to - from));

  const segs = $derived.by((): Seg[] => {
    const out: Seg[] = [];
    for (const r of rows) {
      const it = r.it;
      if (started && r.gap >= 1) out.push({ key: it.id + '-gap', min: r.gap, bg: '', kind: 'gap' });
      const len = Math.max(1, r.end - r.start);
      if (it.kind === 'buffer') {
        out.push({ key: it.id, min: len, bg: '', kind: 'buffer' });
        continue;
      }
      const done = it.status === 'done' || isPartial(it);
      out.push({
        key: it.id,
        min: len,
        bg: hueColor(it.hue),
        kind: 'solid',
        faded: done,
        fill: isActive(it) ? Math.max(0, Math.min(1, worked(it, n) / len)) : undefined,
      });
    }
    return out;
  });
  const nowAt = $derived(live && started && open ? Math.max(0, Math.min(1, (n - from) / span)) : null);

  // Hour marks under the strip: the start, the end, and whole hours between, a few at most.
  const label = (m: number) => {
    const t = fNZ(m, c24);
    return c24 ? t : t.replace(/:00(?= )/, '').replace(` ${apOf(m, false)}`, '');
  };
  const ticks = $derived.by(() => {
    if (!times) return [];
    const out: { at: number; t: string; strong?: boolean }[] = [];
    out.push({ at: 0, t: fNZ(from, c24).replace(':00 ', ' ') });
    const step = span > 600 ? 180 : span > 300 ? 120 : 60;
    for (let h = Math.ceil((from + 30) / 60) * 60; h < to - 30; h += 60) {
      if ((h - Math.ceil((from + 30) / 60) * 60) % step === 0) out.push({ at: (h - from) / span, t: label(h) });
    }
    out.push({ at: 1, t: label(to) });
    if (nowAt != null) {
      const near = (a: number) => Math.abs(a - nowAt) < 0.17;
      return [...out.filter((x) => !near(x.at)), { at: nowAt, t: fNZ(n, c24).replace(/ (am|pm)$/, ''), strong: true }];
    }
    return out;
  });

  const doneMin = $derived(rows.reduce((s, r) => s + (r.it.kind === 'buffer' ? 0 : worked(r.it, n)), 0));
  const leftMin = $derived(live && open ? Math.max(0, likely - Math.max(n, from)) : 0);
  const over = $derived(live && open && started ? Math.round(likely - d.wrap) : 0);

  const head = $derived.by((): [string, string, boolean] => {
    if (!times) {
      if (!started) return [`${dL(to - from)} planned`, '', false];
      return [
        `${dL(doneMin)} done`,
        live && open ? `${dL(leftMin)} to go` : d.dayEnded != null ? 'Day ended' : '',
        false,
      ];
    }
    if (!started) return [`Planned ${fNZ(from, c24)} to ${fNZ(to, c24)}`, dL(to - from), false];
    const s = `Started ${fNZ(d.dayStarted!, c24)}`;
    if (d.dayEnded != null) return [`${fNZ(d.dayStarted!, c24)} to ${fNZ(d.dayEnded, c24)}`, 'Day ended', true];
    if (live && open) return [s, `Done by ${fNZ(likely, c24)}`, true];
    if (live) return [s, 'Nothing left to do', true];
    return [s, lastEnd != null ? `Last task done at ${fNZ(lastEnd, c24)}` : '', false];
  });
</script>

{#if rows.length}
  <button
    class="strip"
    aria-label={`${head[0]}${head[1] ? ', ' + head[1] : ''}${P.locked ? '' : '. Change day hours'}`}
    onclick={() => (P.locked ? P.sayLocked() : P.openSheet({ type: 'hours' }))}
  >
    <span class="line">
      <span>{head[0]}</span>
      {#if head[1]}<span class:strong={head[2]} class:late={over > 0}>{head[1]}</span>{/if}
    </span>
    <span class="bar" aria-hidden="true">
      {#each segs as s (s.key)}
        <span
          class="seg {s.kind}"
          class:faded={s.faded}
          style:flex-grow={s.min}
          style:--c={s.bg}
          style:--fill="{(s.fill ?? 0) * 100}%"
          class:running={s.fill != null}
        ></span>
      {/each}
      {#if nowAt != null}<span class="now" style:left="{nowAt * 100}%"></span>{/if}
    </span>
    {#if ticks.length}
      <span class="ticks" aria-hidden="true">
        {#each ticks as t, i (i)}
          <span class:strong={t.strong} class:first={t.at < 0.06} class:last={t.at > 0.94} style:left="{t.at * 100}%"
            >{t.t}</span
          >
        {/each}
      </span>
    {/if}
    {#if over > 0}
      <span class="over">{dL(over)} past your {fNZ(d.wrap, c24)} wrap-up</span>
    {/if}
  </button>
{/if}

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: calc(100% - 2 * var(--px));
    margin: 14px var(--px) 0;
    padding: 14px;
    border: none;
    border-radius: var(--r-card);
    background: var(--raised);
    color: var(--muted);
    font: 400 13px/1.3 var(--font);
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px 16px;
  }
  .strong {
    color: var(--text);
    font: 600 15px/1.3 var(--font);
  }
  .late {
    color: var(--redT);
  }
  .bar {
    position: relative;
    display: flex;
    gap: 2px;
    height: 26px;
  }
  .seg {
    flex: 1 1 0;
    min-width: 2px;
    border-radius: var(--r-bar);
    background: var(--c);
  }
  .seg.faded {
    opacity: 0.4;
  }
  .seg.running {
    opacity: 1;
    background: linear-gradient(
      90deg,
      var(--c) 0 var(--fill),
      color-mix(in oklab, var(--c) 32%, var(--raised)) var(--fill) 100%
    );
  }
  .seg.gap {
    background: repeating-linear-gradient(135deg, var(--border) 0 3px, var(--raised) 3px 6px);
  }
  .seg.buffer {
    background: transparent;
    border: 1.5px dashed var(--faint);
    box-sizing: border-box;
  }
  .now {
    position: absolute;
    top: -5px;
    bottom: -5px;
    width: 2px;
    margin-left: -1px;
    background: var(--text);
    border-radius: 1px;
  }
  .ticks {
    position: relative;
    height: 14px;
    font: 400 11px/14px var(--font);
  }
  .ticks span {
    position: absolute;
    top: 0;
    translate: -50% 0;
    white-space: nowrap;
  }
  .ticks .first {
    translate: 0 0;
  }
  .ticks .last {
    translate: -100% 0;
  }
  .ticks .strong {
    color: var(--text);
    font-weight: 600;
  }
  .over {
    font: 400 13px/1.3 var(--font);
    color: var(--redT);
  }
</style>
