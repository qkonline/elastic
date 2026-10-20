// Pasting several lines into a step field makes one step per line. Blank lines are dropped, and
// list marks at the start of a line (-, *, •, 1., 2), [ ], [x]) come off, since steps are
// numbered and ticked already.
export function stepLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^(?:[-*•◦▪–]\s+|\d{1,3}[.)]\s+)?(?:\[[ xX]?\]\s*)?/, '')
        .trim(),
    )
    .filter(Boolean);
}

// For a step field's paste event: when the pasted text has more than one line, takes over the
// paste and returns the field's would-be text split into steps (the text either side of the
// selection joins the first and last pasted lines). One line pastes normally (null).
export function pastedSteps(e: ClipboardEvent): string[] | null {
  const text = e.clipboardData?.getData('text/plain') ?? '';
  if (!/[\r\n]/.test(text.trim())) return null;
  e.preventDefault();
  const el = e.currentTarget as HTMLInputElement;
  const v = el.value;
  const a = el.selectionStart ?? v.length;
  const b = el.selectionEnd ?? v.length;
  return stepLines(v.slice(0, a) + text + v.slice(b));
}
