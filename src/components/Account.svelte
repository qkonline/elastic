<script lang="ts">
  import { onMount } from 'svelte';
  import { type AccountInfo, accountsAvailable, emailAvailable } from '../lib/account';
  import { planner as P } from '../lib/planner.svelte';
  import DisarmBar from './DisarmBar.svelte';

  // Signing in on several devices to keep one plan on all of them. A passkey is the way in; a
  // backup email (once email codes are available) is for when no passkey is to hand.
  let emailOn = $state(false);
  let info = $state<AccountInfo | null>(null);
  /** Signing in with an emailed code, or adding a backup email: which step. */
  let codeStep = $state<'email' | 'code' | null>(null);
  let email = $state('');
  let code = $state('');
  const S = $derived(P.session);
  const site = location.origin + location.pathname.replace(/index\.html$/, '');

  const STATUS = {
    off: '',
    connecting: 'Connecting',
    live: 'Synced',
    offline: "Offline. Your changes will sync when you're back online.",
  } as const;

  onMount(() => {
    void emailAvailable().then((v) => (emailOn = v));
    if (P.session) void P.accountDetails().then((i) => (info = i));
  });

  // Signing in or out: start the email steps over and fetch the details again.
  let lastToken = P.session?.token;
  $effect(() => {
    const t = S?.token;
    if (t === lastToken) return;
    lastToken = t;
    codeStep = null;
    code = '';
    info = null;
    if (t) void P.accountDetails().then((i) => (info = i));
  });

  async function sendCode() {
    const ok = S ? await P.sendEmailCode(email) : await P.sendSignInCode(email);
    if (ok) {
      codeStep = 'code';
      code = '';
    }
  }

  async function checkCode() {
    if (S) {
      if (await P.confirmEmail(email, code)) {
        codeStep = null;
        info = info && { ...info, email: P.session?.user.email ?? null };
      }
    } else await P.signInWithCode(email, code);
  }

  async function addKey() {
    if ((await P.addPasskey()) && info) info = { ...info, passkeys: info.passkeys + 1 };
  }
</script>

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
      <span class="muted">This browser can't sign in with a passkey, so syncing isn't available here.</span>
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
      <span class="ct">Passkeys</span>
      <span class="muted">
        {info ? `${info.passkeys} on this account. ` : ''}A passkey made on an iPhone or Mac works on your other Apple
        devices too. Add one for a Windows or Android device, or a different browser.
      </span>
      <button class="btn-plain self" disabled={P.accountBusy} onclick={addKey}>Add a passkey</button>
    </section>

    {#if emailOn || S.user.email}
      <section class="card">
        <span class="ct">Backup email</span>
        {#if S.user.email}
          <span class="muted">
            {S.user.email}. If you ever can't use a passkey, you can sign in with a code sent here.
          </span>
          <button class="btn-plain self" disabled={P.accountBusy} onclick={() => P.removeEmail()}>Remove</button>
        {:else if codeStep === 'code'}
          <span class="muted">We sent a code to {email}. Enter it here.</span>
          <form class="row" onsubmit={(e) => (e.preventDefault(), checkCode())}>
            <input
              class="field"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              aria-label="Code"
              bind:value={code}
            />
            <button class="btn-plain" disabled={P.accountBusy || code.length < 6}>Save</button>
          </form>
          <button class="link" onclick={() => (codeStep = 'email')}>Use a different email</button>
        {:else}
          <span class="muted">Add an email, so you can sign in with a code if you ever can't use a passkey.</span>
          <form class="row" onsubmit={(e) => (e.preventDefault(), sendCode())}>
            <input class="field" type="email" autocomplete="email" aria-label="Email" bind:value={email} />
            <button class="btn-plain" disabled={P.accountBusy || !email.includes('@')}>Send code</button>
          </form>
        {/if}
      </section>
    {/if}

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
  {:else if codeStep}
    <section class="card">
      <span class="ct">Sign in with an email code</span>
      {#if codeStep === 'email'}
        <span class="muted">Enter your account's backup email. We'll send a code to it.</span>
        <form class="row" onsubmit={(e) => (e.preventDefault(), sendCode())}>
          <input class="field" type="email" autocomplete="email" aria-label="Email" bind:value={email} />
          <button class="btn-plain" disabled={P.accountBusy || !email.includes('@')}>Send code</button>
        </form>
      {:else}
        <span class="muted">If {email} is the backup email for an account, a code is on its way. Enter it here.</span>
        <form class="row" onsubmit={(e) => (e.preventDefault(), checkCode())}>
          <input
            class="field"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            aria-label="Code"
            bind:value={code}
          />
          <button class="btn-plain" disabled={P.accountBusy || code.length < 6}>Sign in</button>
        </form>
      {/if}
      <button class="link" onclick={() => (codeStep = null)}>Back</button>
    </section>
  {:else}
    <section class="card">
      <span class="ct">One plan on all your devices</span>
      <span class="muted">
        Sign in on your phone and your computer to keep the same plan on both. A change on one shows up on the other
        straight away.
      </span>
      <button class="opt pri" disabled={P.accountBusy} onclick={() => P.createAccount()}>Create an account</button>
      <button class="opt" disabled={P.accountBusy} onclick={() => P.signIn()}>Sign in</button>
      <span class="muted">
        You sign in with a passkey: Face ID, Touch ID or your device's screen lock. There's no password to remember.
      </span>
      {#if emailOn}
        <button class="link" onclick={() => (codeStep = 'email')}>Sign in with an email code instead</button>
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
  .field {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
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
