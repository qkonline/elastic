<script lang="ts">
  import { accountsAvailable } from '../lib/account';
  import { install } from '../lib/install.svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { hasNotifications, needsInstallForNotifications } from '../lib/platform';
  import { pushConfigured } from '../lib/push';
  import { dL, fT, hhmm, hm, keyDate, shortDate } from '../lib/time';
  import { FIXED_LEADS, type ShowTimes, type ThemePref } from '../lib/types';
  import DayShape, { describe, type Shape } from './DayShape.svelte';
  import DisarmBar from './DisarmBar.svelte';

  let fileEl: HTMLInputElement | null = $state(null);
  const S = $derived(P.settings);
  const shape = $derived<Shape>({ start: S.defStart, length: S.dayLength, flex: S.flexStart });
  const setShape = (x: Shape) =>
    P.setSettings({ defStart: x.start, dayLength: x.length, defWrap: x.start + x.length, flexStart: x.flex });
  // The browser's permission can change from its own UI, so re-read it on every clock tick.
  const permission = $derived.by(() => {
    void P.clock;
    return hasNotifications() ? Notification.permission : null;
  });
  const notifyOn = $derived(S.notify && permission === 'granted');
  const notifyText = $derived.by(() => {
    if (needsInstallForNotifications())
      return 'On iPhone and iPad, notifications work once Elastic Day is on your Home Screen.';
    if (!permission) return "This browser can't show notifications; the chime and vibration still work.";
    if (permission === 'denied')
      return "Notifications are blocked for this site. Allow them in your browser's site settings to turn them on here.";
    const what = S.fixedLead ? "when time's up and before fixed times" : "when time's up";
    if (notifyOn)
      return pushConfigured()
        ? `You'll get one ${what}, even with Elastic Day closed or your phone locked.`
        : `You'll get one ${what} while Elastic Day is in the background.`;
    return `Get a notification ${what}, even when you're not looking at Elastic Day.`;
  });

  function toggleNotify() {
    if (notifyOn) P.disableNotifications();
    else void P.enableNotifications();
  }
  const count = $derived(P.day.items.length);
  const syncText = $derived(
    !P.session
      ? 'Use the same plan on your phone and your computer.'
      : P.syncStatus === 'offline'
        ? "On. You're offline, so changes will sync when you're back."
        : 'On. Your plan is the same on every device you sign in on.',
  );

  const THEMES: [ThemePref, string][] = [
    ['match', 'Match device'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  const CLOCKS: [boolean, string][] = [
    [true, '24-hour'],
    [false, '12-hour'],
  ];
  const TIMES: [ShowTimes, string][] = [
    ['started', 'Once the day starts'],
    ['always', 'Always'],
    ['never', 'Never'],
  ];

  function sample() {
    if (count) P.arm('sample', 'day');
    else P.loadSample();
  }
</script>

<div class="head">
  <span class="h">Settings</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  <section class="card">
    <span class="ct">Display</span>
    <div class="setting">
      <span class="ol">Theme</span>
      <div class="row">
        {#each THEMES as [k, l] (k)}
          <button class="chip" aria-pressed={S.themePref === k} onclick={() => P.setSettings({ themePref: k })}
            >{l}</button
          >
        {/each}
      </div>
    </div>
    <div class="setting">
      <span class="ol">Clock</span>
      <div class="row">
        {#each CLOCKS as [k, l] (l)}
          <button class="chip" aria-pressed={S.clock24 === k} onclick={() => P.setSettings({ clock24: k })}>{l}</button>
        {/each}
      </div>
    </div>
    <div class="setting">
      <span class="ol">Habits</span>
      <div class="row">
        <button
          class="chip"
          aria-pressed={S.habitsPlace === 'checklist'}
          onclick={() => P.setSettings({ habitsPlace: 'checklist' })}>In the Checklist</button
        >
        <button
          class="chip"
          aria-pressed={S.habitsPlace === 'separate'}
          onclick={() => P.setSettings({ habitsPlace: 'separate' })}>In a section of their own</button
        >
      </div>
    </div>
    <div class="setting">
      <span class="ol">Show times on the timeline</span>
      <div class="row">
        {#each TIMES as [k, l] (k)}
          <button class="chip" aria-pressed={S.showTimes === k} onclick={() => P.setSettings({ showTimes: k })}
            >{l}</button
          >
        {/each}
      </div>
    </div>
  </section>

  {#if accountsAvailable() || P.session}
    <section class="card g12">
      <span class="ct">Sync across devices</span>
      <span class="muted">{syncText}</span>
      <button class="btn-plain self" onclick={() => P.openSheet({ type: 'account' })}
        >{P.session ? 'Manage' : 'Set up'}</button
      >
    </section>
  {/if}

  {#if install.method}
    <section class="card g12">
      <span class="ct">Install Elastic Day</span>
      <span class="muted">
        Add it to your {install.method === 'mac'
          ? 'Dock'
          : install.method === 'ios'
            ? 'Home Screen'
            : 'home screen or desktop'}. It gets its own icon and opens in its own window, like any other app.
      </span>
      {#if install.method === 'prompt'}
        <button class="btn-plain self" onclick={() => install.prompt()}>Install</button>
      {:else}
        <button class="btn-plain self" onclick={() => P.openSheet({ type: 'install' })}>Show me how</button>
      {/if}
    </section>
  {/if}

  <section class="card g12">
    <div class="alert">
      <div class="at">
        <span class="ct">Sound</span>
        <span class="muted">Two soft notes when time's up, one before a fixed time. Phones also vibrate.</span>
      </div>
      <button
        class="switch hit"
        style:--hit-x="0px"
        class:on={S.alertOn}
        role="switch"
        aria-checked={S.alertOn}
        aria-label="Sound"
        onclick={() => P.setSettings({ alertOn: !S.alertOn })}><span></span></button
      >
    </div>
    <div class="alert">
      <div class="at">
        <span class="ct">Notifications</span>
        <span class="muted">{notifyText}</span>
      </div>
      <button
        class="switch hit"
        style:--hit-x="0px"
        class:on={notifyOn}
        role="switch"
        aria-checked={notifyOn}
        aria-label="Notifications"
        disabled={!notifyOn && (permission === null || permission === 'denied')}
        onclick={toggleNotify}><span></span></button
      >
    </div>
    {#if needsInstallForNotifications()}
      <button class="btn-plain self" onclick={() => P.openSheet({ type: 'install' })}>Show me how</button>
    {/if}
    <div class="setting">
      <span class="ol">Heads-up before a fixed time</span>
      <div class="row">
        {#each FIXED_LEADS as m (m)}
          <button class="chip" aria-pressed={S.fixedLead === m} onclick={() => P.setSettings({ fixedLead: m })}
            >{m ? `${m} min` : 'None'}</button
          >
        {/each}
      </div>
    </div>
  </section>

  <section class="card g12">
    <span class="ct">Weekly review</span>
    <span class="muted">When your week in review comes up, with a notification if they're on.</span>
    <div class="row">
      {#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as d, i (d)}
        <button class="chip" aria-pressed={S.reviewDay === i} onclick={() => P.setSettings({ reviewDay: i })}
          >{d}</button
        >
      {/each}
    </div>
    <label class="at">
      <span class="ol">At</span>
      <input
        type="time"
        aria-label="Weekly review time"
        value={hhmm(S.reviewAt)}
        onchange={(e) => e.currentTarget.value && P.setSettings({ reviewAt: hm(e.currentTarget.value) })}
      />
    </label>
  </section>

  <section class="card g12">
    <span class="ct">Your day</span>
    <span class="muted">Used for days you haven't planned yet.</span>
    <div class="setting">
      <span class="ol">Starts</span>
      <DayShape part="start" {shape} clock24={S.clock24} onchange={setShape} />
    </div>
    <div class="setting">
      <span class="ol">A productive day is</span>
      <DayShape part="length" {shape} clock24={S.clock24} onchange={setShape} />
    </div>
    <span class="muted">Your day: {describe(shape, S.clock24, fT, dL)}</span>
  </section>

  <section class="card g12">
    <span class="ct">Your data</span>
    <span class="muted"
      >{P.session ? 'Your plan is kept on this device and in your account.' : 'Everything stays in this browser.'} Back it
      up as a file whenever you like.</span
    >
    <div class="row g8">
      <button class="btn-plain" onclick={() => P.exportData()}>Export</button>
      <button class="btn-plain" onclick={() => fileEl?.click()}>Import</button>
      <button class="btn-plain" onclick={sample}>Load sample day</button>
      <input
        type="file"
        accept=".json,application/json"
        bind:this={fileEl}
        hidden
        onchange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void P.importFile(f);
          e.currentTarget.value = '';
        }}
      />
    </div>
    {#if P.armed('sample', 'day')}
      <span class="confirm">
        Replace the {count} task{count === 1 ? '' : 's'} on {shortDate(keyDate(P.viewKey))} with a sample day?
        <button class="btn-yes" onclick={() => P.loadSample()} {@attach (el) => el.focus()}>Replace</button>
        <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
        <DisarmBar />
      </span>
    {/if}
    {#if P.importMsg}
      <span class="msg" class:err={P.importMsg.err}>{P.importMsg.t}</span>
    {/if}
    {#if P.armed('erase', 'all')}
      <span class="confirm">
        {P.session ? 'Erase every day and setting, here and on your other devices?' : 'Erase every day and setting?'}
        <button class="btn-yes" onclick={() => P.eraseAll()} {@attach (el) => el.focus()}>Erase</button>
        <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
        <DisarmBar />
      </span>
    {:else}
      <button class="erase" onclick={() => P.arm('erase', 'all')}>Erase everything</button>
    {/if}
  </section>

  <div class="foot">Elastic Day · v2.4<br />The order is the plan.</div>
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
  }
  .h {
    flex: 1;
    font: 400 21px/1.2 var(--font);
    letter-spacing: -0.01em;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px calc(28px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .body > :global(*) {
    flex-shrink: 0;
  }
  .card {
    padding: 16px;
    border-radius: 16px;
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card.g12 {
    gap: 12px;
  }
  .ct {
    font: 400 15px/1 var(--font);
  }
  .setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ol {
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .row.g8 {
    gap: 8px;
  }
  .muted {
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
  }
  .alert {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .at {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .self {
    align-self: flex-start;
  }
  .msg {
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
  }
  .msg.err {
    color: var(--redT);
  }
  .erase {
    align-self: flex-start;
    height: 40px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--redT);
    font: 400 13px/1 var(--font);
    cursor: pointer;
  }
  .at {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .at input {
    height: 40px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
  }
  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font: 400 14px/1.3 var(--font);
    position: relative;
    overflow: hidden;
    padding-bottom: 8px;
  }
  .foot {
    text-align: center;
    padding: 8px 0 0;
    font: 400 12px/1.6 var(--font);
    color: var(--faint);
  }
</style>
