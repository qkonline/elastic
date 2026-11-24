// Keyboard focus when the thing focused goes away (Start, Done, Start my day, a confirm that
// closes). The browser drops it to the top of the page; here it goes to what comes next instead:
// the nearest marked control (`data-focus`: the running task's Done, a task's Start), or the first
// button beside where it was. Never out of an open sheet, and never to a field (which would bring
// up a phone's keyboard).

const USABLE = 'button:not([disabled]):not([inert] *), a[href], [role="button"][tabindex="0"]';
/** How many levels up still counts as beside it. */
const NEAR = 4;
const shown = (el: Element) =>
  !el.closest('[inert]') && ((el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed');

/** Where to put focus, from the elements around the one that went, nearest first. */
export function nextFocus(around: Element[]): HTMLElement | null {
  let near: HTMLElement | null = null;
  for (const [i, el] of around.entries()) {
    if (!el.isConnected) continue;
    const marked = [...el.querySelectorAll<HTMLElement>('[data-focus]')].find(shown);
    if (marked) return marked;
    // Beside where it was, not just anywhere on the page.
    if (i < NEAR) near ??= [...el.querySelectorAll<HTMLElement>(USABLE)].find(shown) ?? null;
    if (el.matches('[role="dialog"], main')) break;
  }
  return near;
}

export function keepFocus(): void {
  let last: HTMLElement | null = null;
  let around: Element[] = [];
  addEventListener('focusin', (e) => {
    last = e.target as HTMLElement;
    around = [];
    for (let p = last.parentElement; p && p !== document.body; p = p.parentElement) around.push(p);
  });
  // Moved off it on purpose (it's still there): nothing to bring back.
  addEventListener('focusout', (e) => {
    const el = e.target as HTMLElement;
    setTimeout(() => {
      if (el === last && el.isConnected && !el.closest('[inert]') && document.activeElement === document.body)
        last = null;
    });
  });
  let due = false;
  new MutationObserver(() => {
    if (due || !last || document.activeElement !== document.body) return;
    // Still there: it was only out of use for a while (behind the celebration, say).
    if (last.isConnected && last.closest('[inert]')) return;
    due = true;
    // Once what takes its place is there.
    setTimeout(() => {
      due = false;
      if (!last || document.activeElement !== document.body) return;
      if (last.isConnected && last.closest('[inert]')) return;
      const to = last.isConnected ? last : nextFocus(around);
      // Nothing to use yet (something covers the page): when it goes.
      if (to) last = null;
      to?.focus({ preventScroll: true });
    }, 60);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
}
