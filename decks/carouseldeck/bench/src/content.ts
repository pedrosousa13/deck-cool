// Content every bench carousel shares (#340, ported from
// decks/drawerdeck/bench/src/content.ts, #266): the same 10 slides, one per
// view, horizontal, no loop by default -- so a difference in the numbers is
// the mechanics, not the markup. `loopFromQuery()` reads the `?loop=1` query
// string every gesture bench page accepts, so one built page serves both the
// no-loop and loop-on variants the issue asks for, rather than doubling the
// Vite entries and HTML pages per deck.

export const SLIDE_COUNT = 10;

export function slideLabel(i: number): string {
  return `Slide ${i + 1} of ${SLIDE_COUNT}`;
}

export function loopFromQuery(): boolean {
  // `undefined` under SSR (src/mount/ssr-entry-*.tsx: every adapter calls
  // this directly in its render body, which also runs server-side there):
  // the mount scenario never needs loop on, so false is the right default,
  // not a guess.
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('loop') === '1';
}
