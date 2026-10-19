// Alerts: a two-note chime at time's up (880 Hz + 1175 Hz sine), one note before a fixed time,
// a vibration, and a system notification when the tab is hidden.

let ac: AudioContext | null = null;

/** Browsers only allow audio after a user gesture, so call this from click handlers. */
export function unlockAudio(): void {
  try {
    if (!ac) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
    }
    if (ac.state === 'suspended') void ac.resume();
  } catch {
    /* no audio */
  }
}

/** Unlock on the first tap or key press anywhere (e.g. after a reload with a timer running). */
export function unlockOnFirstGesture(): void {
  const once = () => {
    unlockAudio();
    removeEventListener('pointerdown', once, true);
    removeEventListener('keydown', once, true);
  };
  addEventListener('pointerdown', once, true);
  addEventListener('keydown', once, true);
}

export function chime(notes = [880, 1175]): void {
  if (!ac) return;
  try {
    notes.forEach((f, k) => {
      const o = ac!.createOscillator(),
        g = ac!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ac!.currentTime + k * 0.17;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g);
      g.connect(ac!.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/**
 * Show a system notification when the tab is hidden. Goes through the service worker when
 * there is one: Android Chrome only allows notifications from a service worker.
 */
export function notifyHidden(title: string, body: string, tag: string): void {
  try {
    if (!document.hidden || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  } catch {
    return;
  }
  const opts: NotificationOptions = { body, icon: import.meta.env.BASE_URL + 'icon-192.png?v=3', tag };
  const direct = () => {
    try {
      new Notification(title, opts);
    } catch {
      /* not allowed outside a service worker */
    }
  };
  if (!('serviceWorker' in navigator)) return direct();
  navigator.serviceWorker
    .getRegistration()
    .then((reg) => (reg ? reg.showNotification(title, opts) : direct()))
    .catch(direct);
}

/** Ask for notification permission. Browsers only allow this from a tap or click. */
export async function requestNotifications(): Promise<NotificationPermission> {
  try {
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission !== 'default') return Notification.permission;
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
