// Cloudflare Turnstile on the sign-in page, before a code is emailed: only where the worker asks
// for it (`/auth/config` gives its site key once it has both the key and the secret). The widget
// stays out of sight unless Cloudflare wants the person to tick a box.

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
  remove(id: string): void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const WAIT_MS = 90_000;
/** Tokens last five minutes: one prepared is used within four. */
const KEEP_MS = 4 * 60_000;
let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      const t = (window as { turnstile?: TurnstileApi }).turnstile;
      if (t) resolve(t);
      else reject(new Error('Turnstile'));
    };
    s.onerror = () => reject(new Error('Turnstile'));
    document.head.append(s);
  });
  loading.catch(() => (loading = null));
  return loading;
}

/** A widget in `el`, which hands out one token per code asked for. */
export class HumanCheck {
  private id: string | null = null;
  private waiting: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
  private ready: Promise<TurnstileApi>;
  /** A token asked for ahead of time (prepare()), and when. */
  private held: { at: number; token: Promise<string> } | null = null;
  /** A box is showing to tick, and whether a code is waiting on it. */
  private box = false;
  private wanted = false;

  /** `onBox`: there's a box to tick (true), or it's been answered. */
  constructor(
    private el: HTMLElement,
    siteKey: string,
    private onBox: (showing: boolean) => void = () => {},
  ) {
    this.ready = load().then((t) => {
      this.id = t.render(el, {
        sitekey: siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token: string) => this.settle(token),
        'error-callback': () => this.settle(null),
        'expired-callback': () => this.settle(null),
        'timeout-callback': () => this.settle(null),
        'unsupported-callback': () => this.settle(null),
        'before-interactive-callback': () => this.showBox(true),
        'after-interactive-callback': () => this.showBox(false),
      });
      return t;
    });
  }

  private showBox(on: boolean): void {
    this.box = on;
    this.onBox(on);
    // It's below the form: brought into view once a code waits on it, not while typing.
    if (on && this.wanted) this.el.scrollIntoView({ block: 'center' });
  }

  private settle(token: string | null): void {
    const w = this.waiting;
    this.waiting = null;
    if (!w) return;
    if (token) w.resolve(token);
    else w.reject(new Error("We couldn't check you're a person. Try again."));
  }

  /** Start the check now, so its answer is there by the time a code is asked for. */
  prepare(): void {
    if (this.held && Date.now() - this.held.at < KEEP_MS) return;
    const held = { at: Date.now(), token: this.fresh() };
    this.held = held;
    held.token.catch(() => this.held === held && (this.held = null));
  }

  /** A token for one code: the one prepared, or a new one. */
  async token(): Promise<string> {
    this.wanted = true;
    try {
      this.prepare();
      const { at, token } = this.held!;
      this.held = null;
      if (this.box) this.showBox(true);
      // One prepared a while ago may have given up waiting (a box nobody ticked): ask again, once.
      return await (Date.now() - at > 1000 ? token.catch(() => this.fresh()) : token);
    } finally {
      this.wanted = false;
    }
  }

  private async fresh(): Promise<string> {
    const t = await this.ready.catch(() => {
      throw new Error("The check that you're a person didn't load. Check your connection and try again.");
    });
    const id = this.id!;
    this.settle(null);
    return new Promise<string>((resolve, reject) => {
      const mine = { resolve, reject };
      this.waiting = mine;
      // Never waits for ever, with the sign-in page held up.
      setTimeout(() => this.waiting === mine && this.settle(null), WAIT_MS);
      t.reset(id);
      t.execute(id);
    });
  }

  destroy(): void {
    this.settle(null);
    void this.ready.then((t) => this.id && t.remove(this.id)).catch(() => {});
  }
}
