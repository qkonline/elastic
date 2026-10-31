<script lang="ts" module>
  type Tab = 'account' | 'display' | 'day' | 'alerts' | 'projects' | 'data';
  /** The tab last open, kept while the app is open. */
  let last: Tab | null = null;
</script>

<script lang="ts">
  import { accountsAvailable } from '../lib/account';
  import { boardoAvailable } from '../lib/boardo.svelte';
  import { install } from '../lib/install.svelte';
  import { planner as P } from '../lib/planner.svelte';
  import { hasNotifications, needsInstallForNotifications } from '../lib/platform';
  import { pushConfigured } from '../lib/push';
  import { dL, fT, hhmm, hm, keyDate, shortDate } from '../lib/time';
  import { FIXED_LEADS, type Settings, type ShowTimes, type ThemePref } from '../lib/types';
  import AccountYou from './AccountYou.svelte';
  import DayShape, { describe, type Shape } from './DayShape.svelte';
  import DisarmBar from './DisarmBar.svelte';
  import { PICKS } from './Fields.svelte';
  import ScreenHeader from './ScreenHeader.svelte';

  let fileEl: HTMLInputElement | null = $state(null);
  const S = $derived(P.settings);
  // Nothing here applies as it's tapped: every choice is a draft until Save changes, in one save
  // bar whichever tab it's in. Display and Alerts choices are `prefs` (shown in place of the saved
  // ones), notifications `notifyDraft` (turning them on asks the browser, from the Save tap).
  type Pref =
    'themePref' | 'clock24' | 'showTimes' | 'checklistLayout' | 'habitsPlace' | 'alertOn' | 'fixedLead' | 'defLength';
  const DISPLAY: Pref[] = ['themePref', 'clock24', 'showTimes', 'checklistLayout', 'habitsPlace'];
  const DAY: Pref[] = ['defLength'];
  let prefs = $state<Partial<Pick<Settings, Pref>>>({});
  const V = $derived({ ...S, ...prefs });
  const pick = <K extends Pref>(k: K, v: Settings[K]) => {
    const { [k]: _, ...rest } = prefs;
    prefs = v === S[k] ? rest : { ...rest, [k]: v };
  };
  const changed = $derived((Object.keys(prefs) as Pref[]).filter((k) => prefs[k] !== S[k]));
  const saved = $derived<Shape>({ start: S.defStart, length: S.dayLength, flex: S.flexStart });
  let shapeDraft = $state<Shape | null>(null);
  let shapeKey = $state(0);
  const shape = $derived(shapeDraft ?? saved);
  const shapeChanged = $derived(!!shapeDraft && JSON.stringify(shapeDraft) !== JSON.stringify(saved));
  function saveShape() {
    const x = shape;
    P.setSettings({ defStart: x.start, dayLength: x.length, defWrap: x.start + x.length, flexStart: x.flex });
    shapeDraft = null;
  }
  function cancelShape() {
    shapeDraft = null;
    shapeKey++; // forgets "Other time" / "Custom" left open
  }
  let reviewDraft = $state<{ day: number; at: number } | null>(null);
  const review = $derived(reviewDraft ?? { day: S.reviewDay, at: S.reviewAt });
  const reviewChanged = $derived(!!reviewDraft && (reviewDraft.day !== S.reviewDay || reviewDraft.at !== S.reviewAt));
  function saveReview() {
    P.setSettings({ reviewDay: review.day, reviewAt: review.at });
    reviewDraft = null;
  }
  // The browser's permission can change from its own UI, so re-read it on every clock tick.
  const permission = $derived.by(() => {
    void P.clock;
    return hasNotifications() ? Notification.permission : null;
  });
  const notifySaved = $derived(S.notify && permission === 'granted');
  let notifyDraft = $state<boolean | null>(null);
  const notifyOn = $derived(notifyDraft ?? notifySaved);
  const notifyChanged = $derived(notifyDraft != null && notifyDraft !== notifySaved);
  const notifyText = $derived.by(() => {
    if (needsInstallForNotifications())
      return 'On iPhone and iPad, notifications work once Elastic is on your Home Screen.';
    if (!permission) return "This browser can't show notifications; the chime and vibration still work.";
    if (permission === 'denied')
      return "Notifications are blocked for this site. Allow them in your browser's site settings to turn them on here.";
    const what = V.fixedLead ? "when time's up and before fixed times" : "when time's up";
    if (notifyOn)
      return pushConfigured()
        ? `You'll get one ${what}, even with Elastic closed or your phone locked.`
        : `You'll get one ${what} while Elastic is in the background.`;
    return `Get a notification ${what}, even when you're not looking at Elastic.`;
  });

  function toggleNotify() {
    notifyDraft = !notifyOn === notifySaved ? null : !notifyOn;
  }
  const count = $derived(P.day.items.length);
  const syncText = $derived(
    !P.session
      ? 'Use the same plan on your phone and your computer.'
      : P.syncStatus === 'paused'
        ? 'Finish setting up your account to keep syncing.'
        : P.syncStatus === 'offline'
          ? "On. You're offline, so changes will sync when you're back."
          : P.syncStatus === 'full'
            ? 'On, but your account is full, so some new changes stay on this device.'
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
    ['started', 'Once started'],
    ['always', 'Always'],
    ['never', 'Never'],
  ];

  // Settings in tabs, as Boardo's board settings (a side menu on a computer, pills on a phone):
  // Account (you, sync, install), Display, Your day (and the weekly review), Alerts, Projects
  // (Boardo), and Your data.
  const tabs = $derived([
    ...((P.session && !P.needsSetup) || accountsAvailable() || P.session || install.method
      ? [{ id: 'account', label: 'Account' }]
      : []),
    { id: 'display', label: 'Display' },
    { id: 'day', label: 'Your day' },
    { id: 'alerts', label: 'Alerts' },
    ...(boardoAvailable() && P.session ? [{ id: 'projects', label: 'Projects' }] : []),
    { id: 'data', label: 'Your data' },
  ] as { id: Tab; label: string }[]);
  // svelte-ignore state_referenced_locally
  let picked = $state<Tab | null>(last);
  const tab = $derived(tabs.find((t) => t.id === picked)?.id ?? tabs[0].id);

  const unsaved = $derived([
    ...(changed.some((k) => DISPLAY.includes(k)) ? ['Display'] : []),
    ...(shapeChanged || changed.some((k) => DAY.includes(k)) ? ['Your day'] : []),
    ...(reviewChanged ? ['Weekly review'] : []),
    ...(notifyChanged || changed.some((k) => !DISPLAY.includes(k) && !DAY.includes(k)) ? ['Alerts'] : []),
  ]);
  function saveAll() {
    if (changed.length) P.setSettings(Object.fromEntries(changed.map((k) => [k, prefs[k]])));
    prefs = {};
    if (shapeChanged) saveShape();
    if (reviewChanged) saveReview();
    if (notifyChanged) {
      if (notifyDraft) void P.enableNotifications();
      else P.disableNotifications();
    }
    notifyDraft = null;
  }
  function discardAll() {
    prefs = {};
    notifyDraft = null;
    cancelShape();
    reviewDraft = null;
  }

  function sample() {
    if (count) P.arm('sample', 'day');
    else P.loadSample();
  }
</script>

<ScreenHeader title="Settings" back={() => P.leaveSettings()} />
<div class="body">
  <div class="layout">
    <div class="tabs" role="tablist" aria-label="Settings">
      {#each tabs as t (t.id)}
        <button
          role="tab"
          id="stab-{t.id}"
          aria-selected={tab === t.id}
          aria-controls="spane"
          class="tab"
          class:apart={t.id === 'data'}
          onclick={() => (picked = last = t.id)}
        >
          {@render glyph(t.id)}<span class="tl">{t.label}</span>
        </button>
      {/each}
    </div>

    <div class="pane" id="spane" role="tabpanel" aria-labelledby="stab-{tab}">
      <h2>{tabs.find((t) => t.id === tab)?.label}</h2>
      {#if tab === 'account'}
        {#if P.session && !P.needsSetup}
          <section class="group" aria-label="Your account">
            <span class="gl">Your account</span>
            <div class="card g12"><AccountYou notes /></div>
          </section>
        {/if}

        {#if accountsAvailable() || P.session}
          <section class="group" aria-label="Sync across devices">
            <span class="gl">Sync across devices</span>
            <button class="card link" onclick={() => P.openSheet({ type: 'account' })}>
              <span class="dot" class:on={!!P.session}></span>
              <span class="lt">
                <span class="ct">{P.session ? (P.syncStatus === 'paused' ? 'Paused' : 'On') : 'Set up'}</span>
                <span class="muted">{syncText}</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" /></svg>
            </button>
          </section>
        {/if}

        {#if install.method}
          <section class="card g12" aria-label="Install">
            <span class="ct">Install Elastic</span>
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
      {:else if tab === 'display'}
        <section class="group" aria-label="Display">
          <div class="card">
            <div class="setting">
              <span class="ol">Theme</span>
              <div class="segs">
                {#each THEMES as [k, l] (k)}
                  <button aria-pressed={V.themePref === k} onclick={() => pick('themePref', k)}>{l}</button>
                {/each}
              </div>
            </div>
            <div class="setting">
              <span class="ol">Clock</span>
              <div class="segs">
                {#each CLOCKS as [k, l] (l)}
                  <button aria-pressed={V.clock24 === k} onclick={() => pick('clock24', k)}>{l}</button>
                {/each}
              </div>
            </div>
            <div class="setting">
              <span class="ol">Show times on the timeline</span>
              <div class="segs">
                {#each TIMES as [k, l] (k)}
                  <button aria-pressed={V.showTimes === k} onclick={() => pick('showTimes', k)}>{l}</button>
                {/each}
              </div>
            </div>
            <div class="setting">
              <span class="ol">Checklist</span>
              <div class="segs">
                <button aria-pressed={V.checklistLayout === 'list'} onclick={() => pick('checklistLayout', 'list')}
                  >A list</button
                >
                <button aria-pressed={V.checklistLayout === 'row'} onclick={() => pick('checklistLayout', 'row')}
                  >A row that scrolls</button
                >
              </div>
            </div>
            <div class="setting">
              <span class="ol">Habits</span>
              <div class="segs">
                <button aria-pressed={V.habitsPlace === 'checklist'} onclick={() => pick('habitsPlace', 'checklist')}
                  >In the Checklist</button
                >
                <button aria-pressed={V.habitsPlace === 'separate'} onclick={() => pick('habitsPlace', 'separate')}
                  >Their own section</button
                >
              </div>
            </div>
          </div>
        </section>
      {:else if tab === 'day'}
        <section class="card g12" aria-label="Your day">
          <span class="muted">Used for days you haven't planned yet.</span>
          {#key shapeKey}
            <div class="setting">
              <span class="ol">Starts</span>
              <DayShape part="start" {shape} clock24={S.clock24} onchange={(x) => (shapeDraft = x)} />
            </div>
            <div class="setting">
              <span class="ol">A productive day is</span>
              <DayShape part="length" {shape} clock24={S.clock24} onchange={(x) => (shapeDraft = x)} />
            </div>
          {/key}
          <span class="muted">Your day: {describe(shape, S.clock24, fT, dL)}</span>
        </section>

        <span class="gl">New tasks</span>
        <section class="card g12" aria-label="New tasks">
          <span class="ol">Length to start with</span>
          <div class="row" role="group" aria-label="Length to start with">
            {#each [0, ...PICKS] as m (m)}
              <button class="chip" aria-pressed={V.defLength === m} onclick={() => pick('defLength', m)}
                >{m ? dL(m) : 'No time'}</button
              >
            {/each}
          </div>
          <span class="muted"
            >New task opens with this length picked. No time makes a check: a box to tick, with no timer.</span
          >
        </section>

        <span class="gl">Weekly review</span>
        <section class="card g12" aria-label="Weekly review">
          <span class="muted">When your week in review comes up, with a notification if they're on.</span>
          <div class="row">
            {#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as d, i (d)}
              <button class="chip" aria-pressed={review.day === i} onclick={() => (reviewDraft = { ...review, day: i })}
                >{d}</button
              >
            {/each}
          </div>
          <label class="at">
            <span class="ol">At</span>
            <input
              type="time"
              aria-label="Weekly review time"
              value={hhmm(review.at)}
              oninput={(e) => e.currentTarget.value && (reviewDraft = { ...review, at: hm(e.currentTarget.value) })}
            />
          </label>
        </section>
      {:else if tab === 'alerts'}
        <section class="card g12" aria-label="Alerts">
          <div class="alert">
            <div class="aw">
              <span class="ct">Sound</span>
              <span class="muted">Two soft notes when time's up, one before a fixed time. Phones also vibrate.</span>
            </div>
            <button
              class="switch hit"
              style:--hit-x="0px"
              class:on={V.alertOn}
              role="switch"
              aria-checked={V.alertOn}
              aria-label="Sound"
              onclick={() => pick('alertOn', !V.alertOn)}><span></span></button
            >
          </div>
          <div class="alert">
            <div class="aw">
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
                <button class="chip" aria-pressed={V.fixedLead === m} onclick={() => pick('fixedLead', m)}
                  >{m ? `${m} min` : 'None'}</button
                >
              {/each}
            </div>
          </div>
        </section>
      {:else if tab === 'projects'}
        {#if boardoAvailable() && P.session}
          <section class="card g12" aria-label="Projects">
            {#if P.boardo.connected}
              <span class="muted">
                Connected to Boardo{P.boardo.account ? ` as ${P.boardo.account.email}` : ''}. Cards assigned to you
                there show in Projects on every device you use, and the time you work on them goes back to the card.
              </span>
              <div class="row-btns">
                <button class="btn-plain" onclick={() => P.boardo.refresh()}>Check for new cards</button>
                <button class="btn-plain" onclick={() => P.boardo.disconnect()}>Disconnect</button>
              </div>
            {:else if P.boardo.match}
              <span class="muted">
                You're in {P.boardo.match.boards === 1 ? 'a board' : `${P.boardo.match.boards} boards`} in Boardo as
                {P.boardo.match.email}. Show the cards assigned to you in your day, on every device you use, and time
                your work on them.
              </span>
              <div class="row-btns">
                <button class="btn-plain" disabled={P.boardo.busy} onclick={() => P.boardo.link()}
                  >Show my Boardo cards</button
                >
                <button class="btn-plain" disabled={P.boardo.busy} onclick={() => P.boardo.connect()}
                  >Use another Boardo account</button
                >
              </div>
            {:else}
              <span class="muted">
                Connect Boardo, the shared project boards app, to see the cards assigned to you in your day and time
                your work on them. It's linked to your account, so every device you use gets it.
              </span>
              <button class="btn-plain self" disabled={P.boardo.busy} onclick={() => P.boardo.connect()}
                >Connect Boardo</button
              >
            {/if}
          </section>
        {/if}
      {:else}
        <section class="card g12" aria-label="Your data">
          <span class="muted"
            >{P.session ? 'Your plan is kept on this device and in your account.' : 'Everything stays in this browser.'} Back
            it up as a file whenever you like.</span
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
              {P.session
                ? 'Erase every day and setting, here and on your other devices?'
                : 'Erase every day and setting?'}
              <button class="btn-yes" onclick={() => P.eraseAll()} {@attach (el) => el.focus()}>Erase</button>
              <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
              <DisarmBar />
            </span>
          {:else}
            <button class="erase" onclick={() => P.arm('erase', 'all')}>Erase everything</button>
          {/if}
        </section>

        <div class="foot">Elastic · v2.4<br />The order is the plan.</div>
      {/if}
    </div>
  </div>

  {#if unsaved.length}
    <!-- One bar for every draft, whichever tab it's in. -->
    <div class="savebar" role="region" aria-label="Changes not saved">
      <span class="unsaved">Not saved yet: {unsaved.join(', ')}</span>
      <button type="button" class="no" onclick={discardAll}>Discard</button>
      <button type="button" class="yes" onclick={saveAll}>Save changes</button>
    </div>
  {/if}
</div>

{#snippet glyph(id: Tab)}
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" class="glyph">
    {#if id === 'account'}<circle cx="10" cy="7" r="3" class="b" /><path
        d="M4 17c1-3.5 3.5-5 6-5s5 1.5 6 5"
        class="a"
      />
    {:else if id === 'display'}<rect x="3" y="4" width="14" height="10" rx="2" class="a" /><path
        d="M7 17h6"
        class="b"
      />
    {:else if id === 'day'}<rect x="3" y="4.5" width="14" height="12" rx="2" class="a" /><path
        d="M3 8.5h14M7 3v3M13 3v3"
        class="b"
      />
    {:else if id === 'alerts'}<path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13Z" class="a" /><path
        d="M8.5 17.5a1.6 1.6 0 0 0 3 0"
        class="b"
      />
    {:else if id === 'projects'}<rect x="3" y="3.5" width="4" height="13" rx="1" class="a" /><rect
        x="8.5"
        y="3.5"
        width="4"
        height="9"
        rx="1"
        class="a"
      /><rect x="14" y="3.5" width="3" height="5" rx="1" class="b" />
    {:else}<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" class="a" /><path d="M4 15.5h12" class="b" />{/if}
  </svg>
{/snippet}

<style>
  .body {
    padding: 14px var(--px) 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .body > :global(*) {
    flex-shrink: 0;
  }

  /* Tabs, as Boardo's board settings: a side menu on a computer, a row of pills on a phone. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    margin: 0 calc(-1 * var(--px));
    padding: 0 var(--px) 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--raised);
    color: var(--muted);
    font: 400 14px/1 var(--font);
    cursor: pointer;
  }
  .tab[aria-selected='true'] {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
    font-weight: 500;
  }
  .glyph {
    display: none;
    flex: none;
    fill: none;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .glyph .a {
    stroke: var(--accent);
  }
  .glyph .b {
    stroke: var(--now);
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .pane > :global(*) {
    flex-shrink: 0;
  }
  h2 {
    margin: 6px 4px 4px;
    font: 500 20px/1.2 var(--font);
  }
  @media (min-width: 768px) {
    .layout {
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 28px;
      align-items: start;
    }
    .tabs {
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      overflow: visible;
      position: sticky;
      top: 12px;
    }
    .tab {
      min-height: 42px;
      padding: 0 12px;
      border-color: transparent;
      border-radius: var(--r-ctl);
      background: none;
      font-size: 15px;
      text-align: left;
    }
    .tab:hover {
      color: var(--text);
    }
    .tab[aria-selected='true'] {
      background: var(--raised);
      border-color: var(--border);
      color: var(--text);
    }
    .tab.apart {
      margin-top: 18px;
    }
    .savebar {
      margin-left: 208px;
    }
    .glyph {
      display: block;
    }
  }

  /* The save bar for drafts, kept in view above the bottom bar. */
  .savebar {
    position: sticky;
    bottom: calc(var(--bar-h) + 28px + env(safe-area-inset-bottom));
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 10px 10px 10px 14px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }
  .unsaved {
    flex: 1;
    min-width: 0;
    font: 400 13px/1.4 var(--font);
    color: var(--muted);
  }
  .savebar button {
    height: 40px;
    padding: 0 16px;
    border-radius: var(--r-ctl);
    border: none;
    font: 400 14px/1 var(--font);
    white-space: nowrap;
    cursor: pointer;
  }
  .savebar .no {
    padding: 0 10px;
    background: transparent;
    color: var(--muted);
  }
  .savebar .yes {
    background: var(--text);
    color: var(--bg);
    font-weight: 500;
  }
  @media (pointer: coarse) {
    .savebar button {
      height: 44px;
    }
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gl {
    margin: 8px 4px 0;
    font: 400 13px/1 var(--font);
    color: var(--muted);
  }
  .segs {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-ctl);
    background: var(--sunk);
  }
  .segs button {
    flex: 1 1 0;
    min-width: 0;
    height: 36px;
    padding: 0 6px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font: 400 14px/1.1 var(--font);
    cursor: pointer;
  }
  .segs button[aria-pressed='true'] {
    background: var(--raised);
    color: var(--text);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .link {
    flex-direction: row !important;
    align-items: center;
    gap: 12px !important;
    text-align: left;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .link svg {
    flex: none;
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .lt {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--faint);
  }
  .dot.on {
    background: #22c55e;
  }
  .card {
    padding: 14px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card.g12 {
    gap: 12px;
  }
  .ct {
    font: 500 15px/1.2 var(--font);
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
  .aw {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .at {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row-btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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
    border-radius: var(--r-ctl);
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
