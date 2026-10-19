<script lang="ts">
  import { fT, fTs } from '../lib/time';

  // A strip of time sliding under a fixed needle: drag it sideways to move the time the needle
  // points at, a minute at a time, or use the arrow keys. Times that can't be chosen are shaded.
  // The task being corrected shows as its capsule, other tasks on the record faintly, and now as
  // a rose mark. Used to correct when a task started or finished, and when the day started.
  let {
    value,
    range,
    span = null,
    others = [],
    now = null,
    hue,
    clock24,
    label,
    onchange,
  }: {
    value: number;
    range: [number, number];
    span?: [number, number] | null;
    others?: [number, number][];
    now?: number | null;
    hue: string;
    clock24: boolean;
    label: string;
    onchange: (v: number) => void;
  } = $props();

  const uid = $props.id();
  /** Pixels per minute: an hour either side of the needle on a phone. */
  const PX = 3;
  let w = $state(320);
  const x = (t: number) => w / 2 + (t - value) * PX;
  const ticks = $derived.by(() => {
    const reach = Math.ceil(w / 2 / PX) + 10;
    const out: number[] = [];
    for (let t = Math.ceil((value - reach) / 5) * 5; t <= value + reach; t += 5) out.push(t);
    return out;
  });

  function set(v: number) {
    const c = Math.min(range[1], Math.max(range[0], Math.round(v)));
    if (c !== value) onchange(c);
  }

  let drag: { x0: number; v0: number; id: number } | null = null;
  function down(e: PointerEvent) {
    if (e.button && e.button !== 0) return;
    drag = { x0: e.clientX, v0: value, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function move(e: PointerEvent) {
    // Dragging the strip left brings later times under the needle.
    if (drag && e.pointerId === drag.id) set(drag.v0 - (e.clientX - drag.x0) / PX);
  }
  const up = () => (drag = null);
  const STEPS: Record<string, number> = {
    ArrowLeft: -1,
    ArrowDown: -1,
    ArrowRight: 1,
    ArrowUp: 1,
    PageDown: -15,
    PageUp: 15,
  };
  function key(e: KeyboardEvent) {
    const to = e.key in STEPS ? value + STEPS[e.key] : e.key === 'Home' ? range[0] : e.key === 'End' ? range[1] : null;
    if (to == null) return;
    e.preventDefault();
    set(to);
  }
</script>

<div
  class="ruler"
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={range[0]}
  aria-valuemax={range[1]}
  aria-valuenow={value}
  aria-valuetext={fT(value, clock24)}
  data-no-swipe
  bind:clientWidth={w}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onkeydown={key}
>
  <svg width={w} height="68" aria-hidden="true">
    <defs>
      <pattern id="off-{uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" class="off-bg" />
        <line x1="0" y1="0" x2="0" y2="6" class="off-line" />
      </pattern>
    </defs>
    <!-- What can be chosen is a bright band; before the task before it ended, or after the
         next began or now, is struck out. -->
    <rect width={w} height="68" fill="url(#off-{uid})" />
    <rect class="ok" x={x(range[0])} y="0" width={Math.max(0, (range[1] - range[0]) * PX)} height="68" />

    {#each others as [a, b], k (k)}
      <rect class="other" x={x(a)} y="15" width={Math.max(2, (b - a) * PX)} height="12" rx="6" />
    {/each}
    {#if span}
      <rect x={x(span[0])} y="13" width={Math.max(4, (span[1] - span[0]) * PX)} height="16" rx="8" fill={hue} />
    {/if}

    {#each ticks as t (t)}
      <line class="tick" class:major={t % 15 === 0} x1={x(t)} x2={x(t)} y1={t % 15 === 0 ? 36 : 39} y2="46" />
      {#if t % 15 === 0}<text x={x(t)} y="61" text-anchor="middle">{fTs(t, clock24)}</text>{/if}
    {/each}

    {#if now != null}
      <line class="now" x1={x(now)} x2={x(now)} y1="6" y2="48" />
    {/if}
  </svg>
  <span class="needle" aria-hidden="true"></span>
</div>

<style>
  .ruler {
    position: relative;
    height: 68px;
    border-radius: var(--r-card);
    background: var(--sunk);
    overflow: hidden;
    cursor: ew-resize;
    /* Sideways drags move the strip; up and down still scroll the sheet. */
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
  }
  .ruler:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  svg {
    display: block;
  }
  .off-bg {
    fill: var(--sunk);
  }
  .off-line {
    stroke: var(--border);
    stroke-width: 3;
  }
  .ok {
    fill: var(--raised);
  }
  .other {
    fill: var(--line);
  }
  .tick {
    stroke: var(--faint);
    stroke-width: 1;
  }
  .tick.major {
    stroke: var(--muted);
  }
  text {
    font: 400 11px/1 var(--font);
    fill: var(--muted);
  }
  .now {
    stroke: var(--now);
    stroke-width: 2;
    stroke-linecap: round;
  }
  /* The needle: what the strip points at, always in the middle. */
  .needle {
    position: absolute;
    top: 4px;
    bottom: 18px;
    left: 50%;
    width: 2px;
    margin-left: -1px;
    border-radius: 2px;
    background: var(--text);
    pointer-events: none;
  }
  .needle::before {
    content: '';
    position: absolute;
    top: -4px;
    left: -4px;
    border: 5px solid transparent;
    border-top-color: var(--text);
  }
</style>
