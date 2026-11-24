<script lang="ts">
  // A morning, to show what it does: what, how long (minutes), its colour, when it works out to.
  const SHOW: [string, number, string, string][] = [
    ['Plan the day', 40, '#f43f5e', '9:00'],
    ['Write the proposal', 110, '#818cf8', '9:15'],
    ['Call with Sam', 60, '#22d3ee', '10:30'],
    ['Lunch', 70, '#84cc16', '11:00'],
  ];
  import { WebAuthnAbortService } from '@simplewebauthn/browser';
  import { onMount, tick } from 'svelte';
  import { accountsAvailable, authConfig, passkeysAvailable } from '../lib/account';
  import { planner as P } from '../lib/planner.svelte';
  import Stretch from './Stretch.svelte';
  import { HumanCheck } from '../lib/turnstile';

  // Elastic starts here until there's an account on this device: an email confirmed with a
  // six-digit code (the same code makes a new account), or a passkey added earlier. Then the steps
  // that finish signing in: a name for a new account, which plan to keep when this device has its
  // own, a passkey for next time. An account from before emails adds a name and an email here.
  // Arriving from the app's old address signed in, it asks first whose sign-in it is.
  let step = $state<'email' | 'code'>('email');
  let email = $state('');
  let code = $state('');
  let name = $state('');
  /** Came straight to the code, with one already sent (on another device, say). */
  let had = $state(false);
  let resent = $state(false);
  /** Setting up an account from before emails: waiting for the code. */
  let confirming = $state(false);
  let emailField = $state<HTMLInputElement>();
  const S = $derived(P.session);
  const keys = passkeysAvailable();
  const icon = import.meta.env.BASE_URL + 'icon.svg?v=4';
  const okEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

  // Something typed here holds back a reload for a new build until signing in is done.
  $effect(() => {
    P.holdUpdates = !!email.trim() || step === 'code';
  });

  /** Turnstile, where the worker asks for it before sending a code (off unless it's set up there). */
  let siteKey = $state<string | null>(null);
  let humanBox = $state<HTMLElement>();
  let check = $state.raw<HumanCheck | null>(null);
  // What's under way, said on the button that started it; `slow` once it has taken a while.
  let doing = $state<'check' | 'send' | 'code' | 'passkey' | null>(null);
  let box = $state(false);
  let slow = $state(false);
  $effect(() => {
    slow = false;
    if (!doing) return;
    const t = setTimeout(() => (slow = true), 6000);
    return () => clearTimeout(t);
  });
  // The check that you're a person starts while the email is being typed, not when it's sent.
  $effect(() => {
    const c = check;
    if (!c || S || step !== 'email' || !okEmail) return;
    const t = setTimeout(() => c.prepare(), 300);
    return () => clearTimeout(t);
  });
  async function under(what: NonNullable<typeof doing>, run: () => Promise<boolean>): Promise<boolean> {
    doing = what;
    try {
      return await run();
    } finally {
      doing = null;
    }
  }
  $effect(() => {
    if (!siteKey || !humanBox) return;
    const c = new HumanCheck(humanBox, siteKey, (on) => (box = on));
    check = c;
    return () => {
      c.destroy();
      if (check === c) check = null;
    };
  });
  // Whether it's asked for is known once the server has said (asked again if it couldn't be reached).
  let config: Promise<void> | null = null;
  const askConfig = () =>
    (config ??= authConfig()
      .then((c) => void (siteKey = c.turnstile ?? null))
      .catch(() => void (config = null)));
  const human = () => async () => {
    await askConfig();
    await tick(); // its box is drawn once there's a key
    const token = await check?.token();
    doing = 'send';
    return token;
  };

  onMount(() => {
    // Passkeys made for Elastic are offered in the email field's suggestions too, where the browser can.
    if (!P.session) void P.passkeyFromAutofill();
    if (accountsAvailable()) void askConfig();
    return () => {
      P.holdUpdates = false;
      WebAuthnAbortService.cancelCeremony();
    };
  });

  // Signed out (from another tab, or a refused sign-in): start over.
  let lastToken = P.session?.token;
  $effect(() => {
    const t = S?.token;
    if (t === lastToken) return;
    lastToken = t;
    step = 'email';
    confirming = false;
    code = '';
    name = S?.user.name ?? '';
  });

  const sendCode = () => under('check', () => P.sendSignInCode(email.trim(), human()));

  async function send() {
    if (await sendCode()) {
      had = false;
      resent = false;
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
    if (await sendCode()) resent = true;
  }

  const signIn = () => under('code', () => P.signInWithCode(email.trim(), code));

  // Six digits typed or pasted: check them straight away, once (a wrong code waits for a change).
  let tried = '';
  $effect(() => {
    const digits = code.replace(/\D/g, '');
    if (S || step !== 'code' || digits.length !== 6 || digits === tried || P.accountBusy) return;
    tried = digits;
    void signIn();
  });

  async function sendSetup() {
    if (await P.sendEmailCode(email.trim())) {
      confirming = true;
      code = '';
    }
  }

  async function confirmSetup() {
    // The name goes too: the one this device remembers may be out of date with the account.
    if (await P.confirmEmail(email.trim(), code, name.trim())) confirming = false;
  }

  const sends = $derived(doing === 'check' || doing === 'send');
  const digits = $derived(code.replace(/\D/g, '').length);
</script>

{#snippet mail()}
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"
    ><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="M3 5.5l7 5.5 7-5.5" /></svg
  >
{/snippet}

{#snippet busy(text: string)}
  <Stretch />{text}
{/snippet}

<!-- What's happening with a code being sent. -->
{#snippet sending()}
  {@render busy(doing === 'send' ? 'Sending your code…' : box ? 'Tick the box below' : "Checking you're a person…")}
{/snippet}

{#snippet slowly()}
  {#if slow && !box}<p class="note" role="status">Still working. This can take a few seconds.</p>{/if}
{/snippet}

{#snippet codeStep(onsubmit: () => void, label: string)}
  <form onsubmit={(e) => (e.preventDefault(), onsubmit())}>
    <p class="note">
      {#if had}
        Type the 6-digit code we sent to <b>{email.trim()}</b>. Each code works for 10 minutes.
      {:else}
        We sent a 6-digit code to <b>{email.trim()}</b>. It works for 10 minutes.
      {/if}
    </p>
    <label class="lbl" for="si-code">Code</label>
    <input
      id="si-code"
      class="field code"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="7"
      placeholder="123456"
      bind:value={code}
      {@attach (el) => el.focus()}
    />
    <button class="key ink" class:busy={doing === 'code'} disabled={P.accountBusy || digits !== 6}
      >{#if doing === 'code'}{@render busy('Signing in…')}{:else}{label}{/if}</button
    >
    {#if doing === 'code'}{@render slowly()}{/if}
  </form>
{/snippet}

<div class="gate" role="dialog" aria-modal="true" aria-label="Sign in">
  <main class="inner">
    <img class="mark" src={icon} alt="" width="56" height="56" />
    <h1>Elastic</h1>

    {#if !S && P.handoffAsk}
      {@const who = P.handoffAsk.user.email ?? P.handoffAsk.user.name ?? 'your account'}
      <p class="lede">Elastic has moved here. Continue as <b>{who}</b>?</p>
      <div class="stack">
        <button class="key ink" disabled={P.accountBusy} onclick={() => P.answerHandoff(true)}>Continue</button>
        <p class="note">You were signed in to this account at the app's old address.</p>
        <button class="quiet" disabled={P.accountBusy} onclick={() => P.answerHandoff(false)}
          >That's not me. Sign in another way</button
        >
      </div>
    {:else if S && P.joinAsk}
      <p class="lede">This device has its own plan, and your account has one too. Which should this device use?</p>
      <div class="stack">
        <button class="key ink" disabled={P.accountBusy} onclick={() => P.joinAccount('account')}
          >Use my account's plan</button
        >
        <p class="note">This device's days and repeating tasks are replaced with your account's.</p>
        <button class="key" disabled={P.accountBusy} onclick={() => P.joinAccount('both')}
          >Add this device's plan to my account</button
        >
        <p class="note">Both are kept. Where both have the same day, its tasks are put together.</p>
        <button class="quiet" disabled={P.accountBusy} onclick={() => P.cancelJoin()}>Use another account</button>
      </div>
    {:else if S && P.needsSetup && S.user.email && !S.user.name}
      <p class="lede">You're in. What's your name? It goes on your account.</p>
      <form onsubmit={(e) => (e.preventDefault(), P.saveName(name.trim()))}>
        <label class="lbl" for="si-name">Name</label>
        <input id="si-name" class="field" autocomplete="name" bind:value={name} {@attach (el) => el.focus()} />
        <button class="key ink" disabled={P.accountBusy || !name.trim()}>Continue</button>
      </form>
    {:else if S && P.needsSetup}
      <p class="lede">
        Accounts now have an email, so you can always get back in with a code. Add your name and email to keep going.
        Your passkey keeps working.
      </p>
      {#if confirming}
        {@render codeStep(confirmSetup, 'Continue')}
        <div class="pair">
          <button class="quiet" onclick={() => ((confirming = false), (P.accountMsg = null))}>Use another email</button>
        </div>
      {:else}
        <form onsubmit={(e) => (e.preventDefault(), sendSetup())}>
          <label class="lbl" for="si-name">Name</label>
          <input id="si-name" class="field" autocomplete="name" bind:value={name} />
          <label class="lbl" for="si-email">Email</label>
          <input
            id="si-email"
            class="field"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="you@example.com"
            bind:value={email}
          />
          <button class="key ink" disabled={P.accountBusy || !okEmail || !name.trim()}
            >{@render mail()} Send me a code</button
          >
        </form>
      {/if}
      <button class="quiet" disabled={P.accountBusy} onclick={() => P.signOut()}>Sign out</button>
    {:else if S && P.offerPasskey}
      <p class="lede">
        Sign in faster next time with a passkey: Face ID, Touch ID or your device's screen lock. A code to {S.user
          .email} always works too.
      </p>
      <div class="stack">
        <button class="key ink" disabled={P.accountBusy} onclick={() => P.addPasskey()}>Add a passkey</button>
        <button class="quiet" disabled={P.accountBusy} onclick={() => (P.offerPasskey = false)}>Not now</button>
      </div>
    {:else if step === 'code'}
      {@render codeStep(signIn, 'Sign in')}
      <div class="pair">
        <button class="quiet" onclick={() => ((step = 'email'), (resent = false), (P.accountMsg = null))}
          >Use another email</button
        >
        <button class="quiet" disabled={P.accountBusy} onclick={sendAgain}
          >{#if sends}{@render sending()}{:else}Send a new code{/if}</button
        >
      </div>
      {#if resent}<p class="ok" role="status">A new code is on its way.</p>{/if}
    {:else}
      <p class="lede">
        List what you want to do and how long each thing takes. Elastic works out when, and when something runs long,
        the rest of your day moves with it.
      </p>
      <form onsubmit={(e) => (e.preventDefault(), send())}>
        <label class="lbl" for="si-email">Email</label>
        <input
          id="si-email"
          class="field"
          type="email"
          inputmode="email"
          autocomplete="username webauthn"
          placeholder="you@example.com"
          required
          bind:this={emailField}
          bind:value={email}
        />
        <button class="key ink" class:busy={sends} disabled={P.accountBusy || !okEmail}
          >{#if sends}{@render sending()}{:else}{@render mail()} Send me a code{/if}</button
        >
        {#if sends}{@render slowly()}{/if}
        <p class="note">New or returning, it's the same: we email you a six-digit code. No password.</p>
        <button type="button" class="quiet mid" disabled={P.accountBusy} onclick={haveCode}
          >I already have a code</button
        >
      </form>
      {#if keys}
        <div class="or"><span>or</span></div>
        <button
          class="key"
          class:busy={doing === 'passkey'}
          disabled={P.accountBusy}
          onclick={() => under('passkey', () => P.signIn())}
          >{#if doing === 'passkey'}{@render busy('Signing in…')}{:else}<svg
              viewBox="0 0 20 20"
              width="18"
              height="18"
              aria-hidden="true"
              ><rect x="4" y="9" width="12" height="8.5" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg
            > Sign in with a passkey{/if}</button
        >
        <p class="note">Face ID, Touch ID or your device's screen lock, once you've added a passkey to your account.</p>
      {/if}
      <div class="day" role="img" aria-label="A day in Elastic: tasks one after another, each as long as it takes">
        {#each SHOW as [t, l, c, at] (t)}
          <span class="dr"><span class="da">{at}</span><i style:height="{l * 0.5}px" style:background={c}></i>{t}</span>
        {/each}
      </div>
      <p class="note">
        By signing in you agree to the <a href="/terms" target="_blank">terms</a>. How your data is kept:
        <a href="/privacy" target="_blank">privacy</a>. Stuck?
        <a href="mailto:kaiser@kaiserkhan.com">Write to us</a>.
      </p>
    {/if}
    {#if siteKey && !S && !P.handoffAsk}
      <div class="human" bind:this={humanBox}></div>
    {/if}

    {#if P.accountMsg}
      <p class="msg" class:err={P.accountMsg.err} role={P.accountMsg.err ? 'alert' : 'status'}>{P.accountMsg.t}</p>
    {/if}
  </main>
</div>

<style>
  .note a {
    color: inherit;
  }
  .day {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 16px;
    margin-top: 6px;
    border-radius: var(--r-card);
    background: var(--raised);
    border: 1px solid var(--border);
    font: 400 14px/1.2 var(--font);
  }
  .dr {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dr i {
    width: 8px;
    border-radius: var(--r-bar);
  }
  .da {
    width: 44px;
    text-align: right;
    color: var(--muted);
    font-size: 13px;
  }
  .human:empty {
    display: none;
  }
  .gate {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: var(--bg);
    overflow-y: auto;
    display: flex;
  }
  .inner {
    margin: auto;
    width: 100%;
    max-width: 440px;
    padding: calc(40px + env(safe-area-inset-top)) 24px calc(32px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .mark {
    width: 56px;
    height: 56px;
    border-radius: var(--r-card);
  }
  h1 {
    margin: 0;
    font: 600 32px/1.12 var(--font);
    letter-spacing: -0.025em;
  }
  .lede {
    margin: 0;
    font: 400 16px/1.55 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  form,
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
  .lbl {
    font: 400 14px/1.2 var(--font);
    color: var(--muted);
  }
  .field {
    height: 52px;
    padding: 0 14px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    font: 400 16px/1 var(--font);
    box-sizing: border-box;
  }
  .code {
    font: 600 26px/1 var(--font);
    letter-spacing: 0.3em;
  }
  /* Raised keys, like Start my day: a solid edge underneath that the key presses down onto. */
  .key {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 52px;
    margin: 6px 0 4px;
    border-radius: var(--r-card);
    border: 1px solid var(--border);
    background: var(--raised);
    color: var(--text);
    box-shadow: 0 4px 0 var(--border);
    font: 500 16px/1 var(--font);
    cursor: pointer;
  }
  .key:active:not(:disabled) {
    translate: 0 3px;
    box-shadow: 0 1px 0 var(--border);
  }
  .key.ink {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
    box-shadow: 0 4px 0 color-mix(in oklab, var(--text) 55%, var(--bg));
  }
  .key svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .key:not(.ink) svg rect {
    stroke: var(--accent);
  }
  .key:not(.ink) svg path {
    stroke: var(--now);
  }
  /* Under way: it says so, so it isn't dimmed. */
  .key.busy:disabled,
  .quiet:disabled:has(:global(.st)) {
    opacity: 1;
    cursor: progress;
  }
  .quiet:has(:global(.st)) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .quiet {
    min-height: 44px;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--muted);
    font: 400 15px/1 var(--font);
    cursor: pointer;
  }
  .quiet.mid {
    align-self: center;
  }
  .pair {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .or {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--faint);
    font: 400 14px/1 var(--font);
    margin: 4px 0;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .note {
    margin: 0;
    font: 400 14px/1.5 var(--font);
    color: var(--muted);
    text-wrap: pretty;
  }
  .note b {
    color: var(--text);
    font-weight: 500;
  }
  .ok {
    margin: 0;
    color: var(--grT);
  }
  .msg {
    margin: 0;
    font: 400 14px/1.5 var(--font);
    color: var(--muted);
  }
  .msg.err {
    color: var(--redT);
  }
</style>
