<script lang="ts">
  import { WebAuthnAbortService } from '@simplewebauthn/browser';
  import { onMount } from 'svelte';
  import { type AccountInfo, accountsAvailable, passkeysAvailable } from '../lib/account';
  import { planner as P } from '../lib/planner.svelte';
  import AccountYou from './AccountYou.svelte';
  import DisarmBar from './DisarmBar.svelte';
  import SaveRow from './SaveRow.svelte';

  // Signing in on several devices to keep one plan on all of them. An account is an email
  // (confirmed with a six-digit code) and a name; a passkey is the quick way back in. Signed out:
  // one email field (which also offers this device's passkeys) and a code. Signed in: the
  // account's name, email and passkeys. An account from before emails (a passkey only) adds a
  // name and an email before it syncs again.
  let info = $state<AccountInfo | null>(null);
  /** Signed out: which step of signing in by code. */
  let step = $state<'email' | 'code'>('email');
  /** Setting up an account from before emails: waiting for the code. */
  let editing = $state<'code' | null>(null);
  let email = $state('');
  let code = $state('');
  let name = $state('');
  /** Signed out: came straight to the code, with one already sent (on another device, say). */
  let had = $state(false);
  let resent = $state(false);
  let emailField = $state<HTMLInputElement>();
  const S = $derived(P.session);
  const keys = passkeysAvailable();
  const site = location.origin + location.pathname.replace(/index\.html$/, '');
  const okEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

  const STATUS = {
    off: '',
    connecting: 'Connecting',
    live: 'Synced',
    offline: "Offline. Your changes will sync when you're back online.",
    paused: 'Not syncing yet',
  } as const;

  onMount(() => {
    if (P.session) void P.accountDetails().then((i) => (info = i));
    else void P.passkeyFromAutofill();
    // A passkey prompt still waiting in the email field's suggestions goes with the sheet.
    return () => {
      if (!P.session) WebAuthnAbortService.cancelCeremony();
    };
  });

  // Signing in or out: start the steps over and fetch the details again.
  let lastToken = P.session?.token;
  $effect(() => {
    const t = S?.token;
    if (t === lastToken) return;
    lastToken = t;
    step = 'email';
    editing = null;
    code = '';
    name = S?.user.name ?? '';
    info = null;
    if (t) void P.accountDetails().then((i) => (info = i));
  });

  const refresh = () => void P.accountDetails().then((i) => (info = i));

  async function sendSignIn() {
    if (await P.sendSignInCode(email.trim())) {
      had = false;
      step = 'code';
      code = '';
    }
  }

  /** Skip sending: the code was asked for earlier, perhaps on another device, and still works. */
  function haveCode() {
    if (!okEmail) return emailField?.reportValidity();
    P.accountMsg = null;
    resent = false;
    had = true;
    step = 'code';
    code = '';
  }

  async function sendAgain() {
    resent = false;
    if (await P.sendSignInCode(email.trim())) resent = true;
  }

  const signInWithCode = () => P.signInWithCode(email.trim(), code);

  // Six digits typed or pasted: check them straight away, once (a wrong code waits for a change).
  let tried = '';
  $effect(() => {
    const digits = code.replace(/\D/g, '');
    if (S || step !== 'code' || digits.length !== 6 || digits === tried || P.accountBusy) return;
    tried = digits;
    void signInWithCode();
  });

  async function sendChange() {
    if (await P.sendEmailCode(email.trim())) {
      editing = 'code';
      code = '';
    }
  }

  async function confirmChange() {
    const needName = !S?.user.name;
    if (await P.confirmEmail(email.trim(), code, needName ? name.trim() : undefined)) {
      editing = null;
      refresh();
    }
  }

  async function saveName() {
    if (await P.saveName(name.trim())) editing = null;
  }

  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

{#snippet codeField(label: string, onsubmit: () => void, onback: () => void)}
  <span class="muted">We sent a code to {email.trim()}. It works for 10 minutes.</span>
  <form class="row" onsubmit={(e) => (e.preventDefault(), onsubmit())}>
    <input
      class="field"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="6"
      aria-label="Code"
      bind:value={code}
      {@attach (el) => el.focus()}
    />
    <button class="btn-plain" disabled={P.accountBusy || code.replace(/\D/g, '').length < 6}>{label}</button>
  </form>
  <button class="link" onclick={onback}>Use a different email</button>
{/snippet}

<div class="head">
  <span class="h">Sync across devices</span>
  <button class="close-x" aria-label="Close" onclick={() => P.closeSheet()}>×</button>
</div>
<div class="body">
  {#if P.accountMsg}
    <span class="msg" class:err={P.accountMsg.err} role="status">{P.accountMsg.t}</span>
  {/if}
  {#if !accountsAvailable()}
    <section class="card">
      <span class="muted">This browser can't sync, so your plan stays on this device.</span>
    </section>
  {:else if S && P.joinAsk}
    <section class="card">
      <span class="ct">This device has its own plan</span>
      <span class="muted">Your account already has a plan too. Which one should this device use?</span>
      <button class="opt pri" disabled={P.accountBusy} onclick={() => P.joinAccount('account')}
        >Use my account's plan</button
      >
      <span class="muted">This device's days and repeating tasks are replaced with your account's.</span>
      <button class="opt" disabled={P.accountBusy} onclick={() => P.joinAccount('both')}
        >Add this device's plan to my account</button
      >
      <span class="muted">Both are kept. Where both have the same day, its tasks are put together.</span>
      <button class="link" disabled={P.accountBusy} onclick={() => P.cancelJoin()}>Don't sign in</button>
    </section>
  {:else if S && P.needsSetup && S.user.email && !S.user.name}
    <!-- Just made: the name is the last step. -->
    <section class="card">
      <span class="ct">What's your name?</span>
      <span class="muted">It goes on your account. Your plan starts syncing once it's saved.</span>
      <form class="row" onsubmit={(e) => (e.preventDefault(), saveName())}>
        <input class="field" autocomplete="name" aria-label="Name" bind:value={name} {@attach (el) => el.focus()} />
        <button class="btn-plain" disabled={P.accountBusy || !name.trim()}>Save</button>
      </form>
    </section>
  {:else if S && P.needsSetup}
    <!-- An account from before emails: a name and an email, then it syncs again. -->
    <section class="card">
      <span class="ct">Add your name and email to keep syncing</span>
      <span class="muted">
        Accounts now have an email, so you can always get back in with a code. Your plan stays on this device meanwhile,
        and goes up as soon as you're done. Your passkey keeps working.
      </span>
      {#if editing === 'code'}
        {@render codeField('Save', confirmChange, () => (editing = null))}
      {:else}
        <form class="col" onsubmit={(e) => (e.preventDefault(), sendChange())}>
          <input class="field" autocomplete="name" placeholder="Your name" aria-label="Name" bind:value={name} />
          <input
            class="field"
            type="email"
            autocomplete="email"
            placeholder="Email"
            aria-label="Email"
            bind:value={email}
          />
          <button class="btn-plain self" disabled={P.accountBusy || !okEmail || !name.trim()}>Send code</button>
        </form>
      {/if}
    </section>
  {:else if S && P.offerPasskey}
    <section class="card">
      <span class="ct">Sign in faster next time</span>
      <span class="muted">
        Add a passkey: Face ID, Touch ID or your device's screen lock. You can always sign in with a code to {S.user
          .email} too.
      </span>
      <button class="opt pri" disabled={P.accountBusy} onclick={() => P.addPasskey().then(refresh)}
        >Add a passkey</button
      >
      <button class="link" onclick={() => (P.offerPasskey = false)}>Not now</button>
    </section>
  {:else if S}
    <section class="card">
      <div class="status">
        <span class="dot" class:live={P.syncStatus === 'live'} class:off={P.syncStatus === 'offline'}></span>
        <span>{STATUS[P.syncStatus] || 'Signed in'}</span>
      </div>
      <span class="muted">
        Your days, repeating tasks and day settings are the same on every device you sign in on. Theme, sound and
        notifications are set on each device.
      </span>
      <span class="muted">To add a device, open <span class="url">{site}</span> on it and sign in there.</span>
    </section>

    <section class="card">
      <span class="ct">You</span>
      <AccountYou />
    </section>

    <section class="card">
      <span class="ct">Passkeys</span>
      {#if info?.keys.length}
        <ul class="keys">
          {#each info.keys as k (k.id)}
            <li>
              <span class="lv">
                <span>{k.label ?? 'Passkey'}</span>
                <span class="ll">Added {day(k.created)}{k.used ? `, last used ${day(k.used)}` : ''}</span>
              </span>
              {#if P.armed('passkey', k.id)}
                <span class="confirm">
                  <button
                    class="btn-yes"
                    onclick={() => P.removePasskey(k.id).then(refresh)}
                    {@attach (el) => el.focus()}>Remove</button
                  >
                  <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
                  <DisarmBar />
                </span>
              {:else}
                <button class="btn-plain" onclick={() => P.arm('passkey', k.id)}>Remove</button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else if info}
        <span class="muted">None yet. You sign in with a code sent to {S.user.email}.</span>
      {/if}
      {#if keys}
        <span class="muted">
          A passkey made on an iPhone or Mac works on your other Apple devices too. Add one for a Windows or Android
          device, or a different browser.
        </span>
        <button class="btn-plain self" disabled={P.accountBusy} onclick={() => P.addPasskey().then(refresh)}
          >Add a passkey on this device</button
        >
      {/if}
    </section>

    <section class="card">
      {#if P.armed('signout', 'me')}
        <span class="confirm">
          Sign out on this device? It keeps its copy of your plan but stops syncing.
          <button class="btn-yes" onclick={() => P.signOut()} {@attach (el) => el.focus()}>Sign out</button>
          <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
          <DisarmBar />
        </span>
      {:else}
        <button class="btn-plain self" onclick={() => P.arm('signout', 'me')}>Sign out</button>
      {/if}
      {#if P.armed('unaccount', 'me')}
        <span class="confirm">
          Delete your account and the plan it holds? Each device keeps the copy it has now.
          <button class="btn-yes" onclick={() => P.deleteAccount()} {@attach (el) => el.focus()}>Delete</button>
          <button class="btn-no" onclick={() => P.disarm()}>Cancel</button>
          <DisarmBar />
        </span>
      {:else}
        <button class="erase" onclick={() => P.arm('unaccount', 'me')}>Delete account</button>
      {/if}
    </section>
  {:else}
    <section class="card">
      <span class="ct">One plan on all your devices</span>
      {#if step === 'code'}
        <form class="col" onsubmit={(e) => (e.preventDefault(), signInWithCode())}>
          <span class="muted">
            {#if had}
              Type the 6-digit code we sent to <b>{email.trim()}</b>. Each code works for 10 minutes.
            {:else}
              We sent a 6-digit code to <b>{email.trim()}</b>. It works for 10 minutes.
            {/if}
          </span>
          <label class="label" for="acct-code">Code</label>
          <input
            id="acct-code"
            class="field code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="7"
            placeholder="123456"
            bind:value={code}
            {@attach (el) => el.focus()}
          />
          <button class="opt pri" disabled={P.accountBusy || code.replace(/\D/g, '').length !== 6}>Sign in</button>
        </form>
        <div class="pair">
          <button class="link" onclick={() => ((step = 'email'), (resent = false), (P.accountMsg = null))}
            >Use another email</button
          >
          <button class="link" disabled={P.accountBusy} onclick={sendAgain}>Send a new code</button>
        </div>
        {#if resent}<span class="muted ok" role="status">A new code is on its way.</span>{/if}
      {:else}
        <span class="muted">
          Sign in on your phone and your computer to keep the same plan on both. New here? The same code makes your
          account.
        </span>
        <form class="col" onsubmit={(e) => (e.preventDefault(), sendSignIn())}>
          <label class="label" for="acct-email">Email</label>
          <input
            id="acct-email"
            class="field"
            type="email"
            autocomplete="username webauthn"
            inputmode="email"
            placeholder="you@example.com"
            required
            bind:this={emailField}
            bind:value={email}
          />
          <button class="opt pri ico" disabled={P.accountBusy || !okEmail}
            ><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"
              ><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="M3 5.5l7 5.5 7-5.5" /></svg
            >Send me a code</button
          >
          <button type="button" class="link mid" disabled={P.accountBusy} onclick={haveCode}
            >I already have a code</button
          >
        </form>
        {#if keys}
          <div class="or"><span>or</span></div>
          <button class="opt ico" disabled={P.accountBusy} onclick={() => P.signIn()}
            ><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"
              ><rect x="4" y="9" width="12" height="8.5" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg
            >Sign in with a passkey</button
          >
          <span class="muted">Face ID, Touch ID or your device's screen lock, once you've added a passkey here.</span>
        {/if}
      {/if}
    </section>
  {/if}
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
    font: 600 21px/1.2 var(--font);
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
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ct {
    font: 400 15px/1.2 var(--font);
  }
  .muted {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .url {
    color: var(--text);
    word-break: break-all;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 15px/1.3 var(--font);
  }
  .dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--faint);
  }
  .dot.live {
    background: #22c55e;
  }
  .dot.off {
    background: #f59e0b;
  }
  .self {
    align-self: flex-start;
  }
  .card button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .col .field {
    flex: none;
  }
  .keys li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .lv {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    font: 400 15px/1.3 var(--font);
    overflow-wrap: anywhere;
  }
  .ll {
    font: 400 12px/1.3 var(--font);
    color: var(--muted);
  }
  .keys {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font: 400 15px/1 var(--font);
    box-sizing: border-box;
  }
  .link {
    align-self: flex-start;
    height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 13px/1 var(--font);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .code {
    height: 52px;
    font: 600 26px/1 var(--font);
    letter-spacing: 0.3em;
  }
  .ico {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .ico svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .link.mid {
    align-self: center;
    text-decoration: none;
    font-size: 14px;
  }
  .pair {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: -8px;
  }
  .or {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--faint);
    font: 400 13px/1 var(--font);
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .ok {
    color: var(--grT);
  }
  .erase {
    align-self: flex-start;
    height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--redT);
    font: 400 13px/1 var(--font);
    cursor: pointer;
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
  .msg {
    font: 400 13px/1.45 var(--font);
    color: var(--muted);
    padding: 0 4px;
  }
  .msg.err {
    color: var(--redT);
  }
</style>
