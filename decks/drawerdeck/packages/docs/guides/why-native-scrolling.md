---
title: Why native scrolling
description: 'Why drawerdeck builds its drag, momentum and snap points on native CSS scroll snap and <dialog>, instead of pointer-driven JavaScript.'
---

Two existing drawers drive the drag from JavaScript. vaul writes a
`translate3d` on every pointer move. Base UI's drawer writes a CSS variable
from `onPointerMove`, and listens for `touchmove` on the whole document to
call `preventDefault()`.

drawerdeck's drag, momentum and snap points are native scrolling instead.
The sheet sits in a scroll-snap container, with closed, half and full (or
whichever points `snapPoints` sets) as snap points: the browser drags,
flings and settles it, the way it already scrolls a page. `Drawer.Popup`
renders a `<dialog>`, which gives the top layer, focus trapping, an inert
page behind it and Escape, with no portal to manage.

A programmatic move is the exception: opening, closing (Escape, an outside
press, `Drawer.Close` or `close()`) and `snapTo` animate `scrollTop`
themselves, on the same curve and duration as a mouse throw's release
(`cubic-bezier(.32,.72,0,1)`, 240ms), with scroll snap off for the move and
back on once it settles. Native smooth scrolling and mandatory snap both
wanted to drive the same scroll at once; the engine owns it alone instead.
Touch, wheel and trackpad input stay purely native throughout.

## What a throwaway prototype found

A prototype found four things that shape the beta:

- `showModal()` focuses the first focusable descendant by default, and an
  input under 16px then zooms the page on iOS. The dialog takes the initial
  focus instead.
- A viewport resize part-way through the opening scroll must not snap the
  sheet back to closed. Opening is its own phase, and the drawer cannot be
  dismissed during it.
- A scroll-driven animation on the page behind the dialog does not resolve,
  even with `timeline-scope` on `:root`: a named scroll timeline does not
  reach across the top layer. The dim inside the dialog does resolve.
- A mouse cannot drag a scroll container, so a mouse drag still needs its
  own pointer handler.

## What this page does not claim

This is an architectural choice, not a measured one. The bench that would
compare drawerdeck's native scrolling against a JavaScript-driven drag has
not run yet, so this page makes no claim about which approach is smoother,
lighter or faster.

## What's still open

What's still open includes the composable API, sides other than the bottom,
non-modal drawers, the on-screen keyboard, and Firefox's and older Safari's
fallbacks.
