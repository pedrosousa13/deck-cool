---
title: Style the backdrop
description: 'Dim the page behind the drawer from a native CSS scroll timeline, with no JavaScript running per scroll frame, and the --drawer-progress fallback for browsers without one.'
---

`Drawer.Backdrop` is headless: it renders a plain `<div>`, and the engine
sets no look of its own. What it does set is a way to read the drag,
without writing anything on every scroll frame to do it.

## The native path

`Drawer.Viewport` carries a named scroll timeline, `--drawer`, and
`Drawer.Popup` (the `<dialog>`) carries `timeline-scope: --drawer`, so a
sibling such as `Drawer.Backdrop` can use it too, even though it sits
outside the viewport it tracks. Write your own `@keyframes` and drive them
from it:

```css
@supports (animation-timeline: scroll()) {
  @keyframes dim {
    from {
      background-color: rgb(0 0 0 / 0);
    }
    to {
      background-color: rgb(0 0 0 / 0.5);
    }
  }

  .backdrop {
    background-color: rgb(0 0 0 / 0);
    animation: dim 1s linear;
    animation-timeline: --drawer;
    animation-range: 0 var(--drawer-first-snap);
    animation-fill-mode: both;
  }
}
```

The keyframes animate `background-color`'s alpha, not `opacity`: "Animate
the drawer" gives the Backdrop its own `opacity` transition, for the
entrance and the exit, and the two compose by multiplying instead of one
replacing the other. The dim fades in with the entrance, fades out with
the exit, and follows the drag in between.

`--drawer-first-snap` is the pixel offset of the first (nearest closed)
snap point, set on `Drawer.Popup` once per layout -- never per frame.
`animation-range: 0 var(--drawer-first-snap)` plays the keyframes over
exactly that stretch of the drag: fully dim by the time the drawer reaches
its first open point, however many snap points it has after that.

Once the browser resolves this, nothing in `@drawerdeck/core` runs per
scroll frame: no `style.setProperty` call, no `requestAnimationFrame`
callback. The compositor reads the scroll position and drives the
animation the same way it already scrolls the page.

Chromium and Safari ship `animation-timeline`, `scroll-timeline` and
`timeline-scope` together; Firefox stable does not yet (#236).

## The fallback

Where `animation-timeline: scroll()` is unsupported, the engine instead
writes `--drawer-progress` (`0` closed, `1` at the first snap point) on
`Drawer.Popup` as the viewport scrolls, skipping the write when the value
has not changed:

```css
@supports not (animation-timeline: scroll()) {
  .backdrop {
    background: rgb(0 0 0 / calc(var(--drawer-progress, 0) * 0.5));
  }
}
```

Give both rules the same selector and let `@supports` pick one: a browser
that gains native scroll timelines later starts using the first block
without a change on your side.
