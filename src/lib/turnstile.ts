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

  constructor(el: HTMLElement, siteKey: string) {
    this.ready = load().then((t) => {
      this.id = t.render(el, {
        sitekey: siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token: string) => this.settle(token),
        'error-callback': () => this.settle(null),
        'expired-callback': () => this.settle(null),
      });
      return t;
    });
  }

  private settle(token: string | null): void {
    const w = this.waiting;
    this.waiting = null;
    if (!w) return;
    if (token) w.resolve(token);
    else w.reject(new Error("We couldn't check you're a person. Try again."));
  }

  /** A fresh token (each one works once). */
  async token(): Promise<string> {
    const t = await this.ready.catch(() => {
      throw new Error("The check that you're a person didn't load. Check your connection and try again.");
    });
    const id = this.id!;
    this.settle(null);
    return new Promise<string>((resolve, reject) => {
      this.waiting = { resolve, reject };
      t.reset(id);
      t.execute(id);
    });
  }

  destroy(): void {
    this.settle(null);
    void this.ready.then((t) => this.id && t.remove(this.id)).catch(() => {});
  }
}
