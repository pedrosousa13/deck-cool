# Native scrolling is the engine

vaul is unmaintained: its last release was 1.1.2, in December 2024. Base
UI's Drawer is the maintained rival, and it drives the drag from pointer
and touch events on the main thread: `DrawerViewport.tsx` writes
`--drawer-swipe-movement-y` from `onPointerMove`, and a document-wide
`touchmove` listener calls `preventDefault()`. vaul does the same: its
`onDrag` writes `translate3d` on every move (`src/index.tsx:357`).

Drawerdeck's drag, momentum and snap points are native scrolling instead.
The sheet sits in a scroll-snap container, and closed, half and full are
snap points: the browser drags, flings and settles it, the way it already
does for a page. `<dialog>` gives the top layer, focus trapping, an inert
page and Escape. An input stays native unless a bench shows it cannot
reach a target, and then only that input falls back, never the whole
engine.

A throwaway prototype (branch `prototype/sheetdeck`) found:

- `showModal()` focuses the first focusable descendant. An input under
  16px then zooms the page on iOS. The dialog takes the initial focus
  instead (`autofocus` on the dialog).
- A viewport resize during the opening scroll must not snap the sheet back
  to closed. Opening is its own phase, and dismissal is impossible during
  it.
- A scroll-driven animation on the page behind the dialog does not
  resolve: a named scroll timeline does not reach across the top layer,
  even with `timeline-scope` on `:root`. The dim inside the dialog does
  resolve. So a background indent needs JS, or a different structure.
- A mouse cannot drag a scroll container. Mouse drag needs a pointer
  handler.

pedrosousa13/deck-cool#230 maps what is still open: the composable API,
sides other than the bottom, non-modal drawers, the on-screen keyboard, and
Firefox and older Safari's fallbacks.
