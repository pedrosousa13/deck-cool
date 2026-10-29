---
title: Animate the drawer
description: 'The recipe for the Panel’s CSS entrance and exit, and the Backdrop’s fade: data-starting-style and data-ending-style, 300ms on the family curve, with no JavaScript running per frame.'
---

`Drawer.Panel` is headless: opening sets `Drawer.Viewport`’s scroll
position straight to the snap point, with no scroll animation at all. What
slides the panel in, and out again, is a CSS transition you write, driven
by two attributes the engine sets for you.

## The attributes

| Attribute             | On open or close | What it means                                                                                |
| --------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `data-starting-style` | Open             | Present for exactly one frame, so a transition has somewhere to start from.                  |
| `data-ending-style`   | Close            | Present for the whole exit, on the Panel and the Backdrop, until the dialog actually closes. |

These are Base UI’s own attribute names, carried over so migrating from it
(or to it) needs no new vocabulary.

On open, `data-starting-style` paints on the Panel’s first frame, before
the browser has shown anything else, then is removed on the next frame.
Removing it is what starts the transition: give the Panel’s resting state
a `transition`, and give `[data-starting-style]` the state you want the
entrance to begin from.

On a programmatic close (`close()`, Escape, an outside press or
`Drawer.Close`), `data-ending-style` goes on the Panel and the Backdrop
together, and stays until the Panel’s own `transitionend` fires, or, with
no transition defined, not at all: the dialog closes at once. A drag or a
flick dismissal never sets it. The native scroll itself is already the
exit, unchanged.

## The recipe

300ms on the family curve (GLOSSARY, Motion), sliding the panel up from
fully below the viewport:

```css
.panel {
  transform: translateY(0);
}

@media (prefers-reduced-motion: no-preference) {
  .panel {
    transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  .panel[data-starting-style],
  .panel[data-ending-style] {
    transform: translateY(100%);
  }
}

.backdrop {
  opacity: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .backdrop {
    transition: opacity 300ms cubic-bezier(0.32, 0.72, 0, 1);
  }

  .backdrop[data-ending-style] {
    opacity: 0;
  }
}
```

`prefers-reduced-motion: reduce` holds every animation still (GLOSSARY,
Motion) by leaving `transition` undeclared there. Its computed duration is
then `0s`, which the engine reads the same way it reads any other
undeclared transition: the exit closes the dialog at once, with no wait.

## Interrupted

A touch, a wheel or a pointer down while the entrance or the exit is still
running ends it immediately. The engine drops the attribute itself, so the
Panel (and, for an exit, the Backdrop) jump to their resting look and the
gesture that interrupted them continues natively from there. The drawer is
already at its snap point either way, since neither the entrance nor the
exit ever moves `scrollTop`.

## Why not the engine’s own ease

An earlier version of this animated `scrollTop` itself, in JavaScript, on
every frame (closed PR #292). It measured about 90ms faster than native
`scrollTo({ behavior: 'smooth' })` with nothing else running, and nothing
faster under real load. A CSS transition on `transform` runs on the
compositor instead, with no main-thread work per frame, whatever else the
page is doing. vaul and Base UI, the two fastest rivals the bench measures
(`compare.md`), both animate this way already.
