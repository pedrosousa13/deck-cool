// React Aria's Sheet, `react-aria-components@1.22.1`, pinned (#283; see
// versions.json for the npm release date).
//
// Doc followed: https://react-aria.adobe.com/Sheet. `SheetTrigger` >
// `SheetOverlay` > `Sheet` > `SheetContent`, driven only through its own
// public API, imported from the package's own `Sheet` subpath export
// (confirmed against the package's shipped `dist/exports/Sheet.*`, not
// just the docs' prose).
//
// Options set, non-default:
// - `snapPoints` on `SheetOverlay`: to match the shared half/full snap
//   points every deck gets (content.ts) -- without it, the doc says the
//   sheet opens straight to full height. `preventDismissal` and every
//   other `SheetOverlay`/`Sheet` prop are left at their defaults.
//
// `snapPoints` is a `SheetOverlay` prop here, not a `Sheet` one (its own
// `.d.ts`: `SheetOverlayProps` has `snapPoints`, `SheetProps` doesn't).
// It takes percentage *strings* ('50%', '92%'), not the bare 0-1 numbers
// vaul's and Base UI's `snapPoints` read: React Aria's own types document
// a bare number as pixels of the sheet visible, and a
// percentage as "relative to the size of the sheet," not the viewport --
// a different convention on paper, but equivalent in practice once `Sheet`'s
// own box is bounded to the viewport height (see reactaria.css: without
// that, "the size of the sheet" is its *content's* height, not the
// viewport's). `HALF_FRACTION_PCT`/`FULL_FRACTION_PCT` (./content.ts) are
// `'50%'`/`'92%'`, matching the other two decks' 0.5/0.92 once rendered.
//
// React Aria's Sheet manages its own fixed/absolute positioning and
// scroll-snap internally (the design the blog post -- "Scrolling is All
// You Need" -- describes), so no `position: fixed` is needed from the
// consumer the way vaul's and Base UI's headless drawers need. It does not,
// on its own, bound `Sheet`'s own box to the viewport height, though:
// found empirically (same method the original prototype used for vaul),
// without a height set, `Sheet`'s box sizes to its content (2172px for 50
// rows), not 100dvh -- `reactaria.css`'s `height: 100dvh` on `.panel` fixes
// this, the same category of fix vaul's own CSS needs. It also gives
// `SheetContent` a flex column so the handle and the scrollable row list
// stack top to bottom inside that bounded box.
//
// `id="panel"` on `Sheet` is this bench's own marker, the same convention
// as the other three decks' `#panel`.
//
// Mouse drag (#283's own brief: "the post says nothing about mouse drag"):
// the compiled source attaches no pointer/touch listener of its own --
// swiping is native `overflow-y: auto` scroll with CSS scroll snap on a
// `data-sheet-scroll` container, the mechanism the blog post describes.
// A generic scrollable `div` does not turn a left-button
// press-move-release into a scroll in Chromium the way touch or a
// trackpad's two-finger pan does, so this bench's `mouse-drag-throw`
// scenario is not expected to move it; RESULTS.md records what the smoke
// run actually showed.
//
// `SheetBackdrop`'s `swipeAnimation`/`swipeAnimationRange` (#304, fairness
// rule 3): `SheetBackdrop` on its own paints nothing -- no background, no
// entrance/exit -- so it was invisible here. The package's own starter
// example (the "Example" on react-aria.adobe.com/Sheet, and
// `starters/docs/src/Sheet.tsx` in the react-spectrum repo it ships from)
// gives it exactly this:
//
//   <SheetBackdrop
//     swipeAnimation="sheet-backdrop"
//     swipeAnimationRange={snapPoints ? {start: snapPoints.length - 1} : undefined}
//   />
//
// with the dim color and the keyframes as the starter's own `Sheet.css`:
// `.react-aria-SheetBackdrop { background: rgb(0 0 0 / 0.4); }` and
// `@keyframes sheet-backdrop { from { opacity: 0 } to { opacity: 1 } }`
// (src/reactaria.css). `start: snapPoints.length - 1` is the same
// "fade in only past the last snap point" default vaul's `fadeFromIndex`
// uses, so the two libraries dim the same way here.

import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import {
  Sheet as UnsafeSheet,
  SheetBackdrop,
  SheetContent,
  SheetOverlay,
  SheetTrigger,
  type SheetProps
} from 'react-aria-components/Sheet';
import { FULL_FRACTION_PCT, HALF_FRACTION_PCT, RowsReact } from './content';
import type {} from './harness';

const rows = RowsReact(50);

// Supplements `SheetOverlay`'s own swipe-to-dismiss detection (#311,
// fairness rule 3). That detection is an `IntersectionObserver` on
// `[data-sheet-content]` (`dist/private/Sheet.mjs`'s own `ref` callback):
// it sets a `hasEntered` flag once the content's intersection ratio is
// >0, then calls `state.close()` once the ratio drops back to <=0. In this
// bench, that observer's callback fires exactly once -- the initial,
// synchronous notification every `IntersectionObserver.observe()` call
// delivers, reporting the sheet's still-exited rest position from before
// any scroll -- and never again, confirmed with a local probe
// (`IntersectionObserver.prototype.observe`/`takeRecords`, monkey-patched
// in a throwaway script): even a slow, ~1.8s hand-drag that visibly moves
// the sheet from fully open to fully closed (`window.__bench.openness()`
// 760 -> 0, matching `#panel`'s real position every frame) produces no
// further notification once the touch sequence's native scroll takes
// over, with or without `snapPoints`. So `hasEntered` never sets and
// `state.close()`/`onOpenChange(false)` never run for a swipe dismiss here.
//
// This polls the same public `[data-sheet-content]` marker directly
// (`getBoundingClientRect()`, the same forced-layout read `harness.ts`'s
// own per-frame probe already uses, and which *does* stay correct every
// frame in the same probe) and drives the controlled `isOpen`/
// `onOpenChange` pair `SheetTrigger` already documents for a controlled
// sheet -- the same public path Escape or an outside click already
// close it through, so closing this way exercises the same
// onOpenChange/unmount sequence, not a side channel around it.
function useCloseSheetWhenOffscreen(
  isOpen: boolean,
  onClose: () => void
): void {
  const hasEntered = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasEntered.current = false;
      return;
    }
    let raf = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>('[data-sheet-content]');
      if (el) {
        const r = el.getBoundingClientRect();
        const visible = r.bottom > 0 && r.top < window.innerHeight;
        if (visible) hasEntered.current = true;
        if (hasEntered.current && !visible) {
          onClose();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, onClose]);
}

// `SheetProps` doesn't type `id` (unlike `SheetBackdropProps`, it has no
// `GlobalDOMAttributes`), though the component forwards unknown DOM props
// through at runtime the same as every other react-aria-components
// primitive -- confirmed empirically, the bench's own `#panel` selector
// resolves correctly against it. Widened here rather than dropped, so
// `#panel` stays the same marker convention as the other three decks.
const Sheet = UnsafeSheet as ForwardRefExoticComponent<
  SheetProps & { id?: string } & RefAttributes<HTMLDivElement>
>;

export function ReactAriaApp() {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  useCloseSheetWhenOffscreen(isOpen, close);

  // Fairness rule 12 (#311): reports this controlled `isOpen` to
  // `window.__bench.isOpen()` on every change, from whichever path set it
  // (SheetTrigger's own `onOpenChange` -- Escape, an outside press -- or
  // `useCloseSheetWhenOffscreen`'s own swipe-dismiss detection above).
  useEffect(() => {
    window.__bench.reportOpen(isOpen);
  }, [isOpen]);

  return (
    <SheetTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button id="trigger">Open</Button>
      <SheetOverlay snapPoints={[HALF_FRACTION_PCT, FULL_FRACTION_PCT]}>
        <SheetBackdrop
          className="backdrop"
          swipeAnimation="sheet-backdrop"
          swipeAnimationRange={{ start: 1 }}
        />
        <Sheet id="panel" className="panel">
          <SheetContent className="content">
            <div className="handle" />
            <div className="inner-list">
              {rows.map((i) => (
                <div className="bench-row" key={i}>
                  Row {i}
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </SheetOverlay>
    </SheetTrigger>
  );
}
