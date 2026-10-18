<script lang="ts">
  // A habit's progress as a ring in its colour. An amount fills one segment per unit (a glass of
  // water each), up to twelve; past that, or for minutes, it fills as one arc. A yes/no habit
  // and a habit to break are a plain ring that fills when met.
  import { hueColor, inkOn, type Hue } from '../lib/types';

  let {
    hue,
    value,
    target,
    segments = false,
    met,
    slipped = false,
    size = 28,
  }: {
    hue: Hue;
    value: number;
    target: number;
    /** One segment per unit (amounts up to 12). */
    segments?: boolean;
    met: boolean;
    /** A habit to break, slipped today. */
    slipped?: boolean;
    size?: number;
  } = $props();

  const R = 11;
  const C = 2 * Math.PI * R;
  const share = $derived(Math.max(0, Math.min(1, target ? value / target : 0)));
  const n = $derived(segments ? Math.max(1, Math.min(12, Math.round(target))) : 1);
  /** Gap between segments, as a share of the circle. */
  const GAP = 0.035;

  // A segment's arc from the top, clockwise: [start, end] as shares of the circle.
  function arc(a: number, b: number): string {
    const p = (t: number) => {
      const ang = 2 * Math.PI * t - Math.PI / 2;
      return `${(12 + R * Math.cos(ang)).toFixed(3)} ${(12 + R * Math.sin(ang)).toFixed(3)}`;
    };
    return `M ${p(a)} A ${R} ${R} 0 ${b - a > 0.5 ? 1 : 0} 1 ${p(b)}`;
  }
  const segs = $derived(
    Array.from({ length: n }, (_, i) => ({
      d: arc(i / n + GAP / 2, (i + 1) / n - GAP / 2),
      on: i < Math.floor(value),
    })),
  );
</script>

<svg
  class="ring"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden="true"
  style:--c={hueColor(hue)}
  style:--ink={inkOn(hue)}
>
  {#if slipped}
    <circle class="track" cx="12" cy="12" r={R} />
    <path class="x" d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
  {:else if met}
    <circle class="full" cx="12" cy="12" r={R + 1} />
    <path class="tick" d="M7.6 12.3l3 3 5.8-6.4" />
  {:else if segments && n > 1}
    {#each segs as s, i (i)}
      <path class="seg" class:on={s.on} d={s.d} />
    {/each}
  {:else}
    <circle class="track" cx="12" cy="12" r={R} />
    {#if share > 0}
      <circle
        class="fill"
        cx="12"
        cy="12"
        r={R}
        stroke-dasharray="{(share * C).toFixed(2)} {C.toFixed(2)}"
        transform="rotate(-90 12 12)"
      />
    {/if}
  {/if}
</svg>

<style>
  .ring {
    display: block;
    flex: none;
    overflow: visible;
  }
  .track,
  .seg {
    fill: none;
    stroke: color-mix(in oklab, var(--c) 22%, var(--line));
    stroke-width: 2.4;
  }
  .seg {
    stroke-linecap: round;
    transition: stroke 220ms;
  }
  .seg.on,
  .fill {
    fill: none;
    stroke: var(--c);
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .fill {
    transition: stroke-dasharray 260ms ease-out;
  }
  .full {
    fill: var(--c);
  }
  .tick {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .x {
    fill: none;
    stroke: var(--redT);
    stroke-width: 2;
    stroke-linecap: round;
  }
  @media (prefers-reduced-motion: reduce) {
    .seg,
    .fill {
      transition: none;
    }
  }
</style>
