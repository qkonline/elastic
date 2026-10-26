// Keeps bottom sheets above the on-screen keyboard. iOS doesn't shrink the page when the
// keyboard opens, so anything fixed to the bottom of the screen ends up behind it. The visual
// viewport says how much of the screen is still visible; expose that to CSS as
//   --kb   how far the keyboard reaches up from the bottom of the page (0 when closed)
//   --vvh  the height of what's still visible
//   --stuck how far the page has come up short of the screen in a Home Screen app on iPhone
// Android Chrome resizes the page itself (see interactive-widget in index.html), so --kb stays 0.

import { isIOS, isStandalone } from './platform';

export function trackKeyboard(): void {
  trackStuck();
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const touch = window.matchMedia('(pointer: coarse)');
  const update = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--kb', `${Math.round(covered)}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    // Android resizes the page instead, so on touch screens also treat a big drop in visible
    // height as the keyboard.
    const shrunk = touch.matches && vv.height < window.screen.height * 0.6;
    root.classList.toggle('keyboard-open', covered > 80 || shrunk);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

// iOS 26 bug in Home Screen apps: once the keyboard has been open, the page can stay shorter
// than the screen after it closes, so anything fixed to `bottom: 0` (the bottom bar) floats up
// the screen. Remember the tallest the page has been at each width and expose the shortfall,
// so those things can sit that much lower. Only there: in Safari the page gets shorter and
// taller as its toolbars come and go, which must not move the bar. While something is being
// typed the keyboard may really be taking that room, so nothing moves then.
function trackStuck(): void {
  if (!isIOS() || !isStandalone()) return;
  const root = document.documentElement;
  const tallest = new Map<number, number>();
  const update = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const full = Math.max(tallest.get(w) ?? 0, h);
    tallest.set(w, full);
    const typing = document.activeElement?.matches('input, textarea, select, [contenteditable]');
    root.style.setProperty('--stuck', `${typing ? 0 : Math.round(full - h)}px`);
  };
  window.addEventListener('resize', update);
  // After the field lets go, once the keyboard has had time to close.
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => setTimeout(update, 400));
  window.visualViewport?.addEventListener('resize', update);
  window.addEventListener('scroll', update, { passive: true });
  update();
}
