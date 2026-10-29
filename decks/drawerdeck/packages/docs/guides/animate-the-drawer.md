---
title: Animate the drawer
description: 'The recipe for the Panel’s CSS entrance and exit, and the Backdrop’s fade: data-starting-style and data-ending-style, 300ms on the family curve, with no JavaScript running per frame.'
---

`Drawer.Panel` is headless: opening sets `Drawer.Viewport`’s scroll
position straight to the snap point, with no scroll animation at all. What
slides the panel in, and out again, is a CSS transition you write, driven
by two attributes the engine sets for you.

## The attributes

| Attribute             | On open or close | What it means                                                                                                   |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `data-starting-style` | Open             | Present on the Panel and the Backdrop for the first painted frame, so a transition has somewhere to start from. |
| `data-ending-style`   | Close            | Present for the whole exit, on the Panel and the Backdrop, until the dialog actually closes.                    |

These are Base UI’s own attribute names, carried over so migrating from it
(or to it) needs no new vocabulary.

On open, `data-starting-style` goes on the Panel and the Backdrop before
the dialog opens, so the browser paints their starting state on its very
first frame, then is removed once that frame has actually shown. Removing
it is what starts the transition: give the Panel’s and the Backdrop’s
resting state a `transition`, and give `[data-starting-style]` the state
you want each entrance to begin from.

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

  .backdrop[data-starting-style],
  .backdrop[data-ending-style] {
    opacity: 0;
  }
}
```

The Backdrop's own dim (`animation-timeline: --drawer`, "Style the
backdrop") drives `background-color`, not `opacity`, so the two compose by
multiplying rather than one replacing the other.

`prefers-reduced-motion: reduce` holds every animation still (GLOSSARY,
Motion) by leaving `transition` undeclared there. Its computed duration is
then `0s`, which the engine reads the same way it reads any other
undeclared transition: the exit closes the dialog at once, with no wait.

## Interrupted

A touch, a wheel or a pointer down while the entrance or the exit is still
running ends that transition immediately, but does not close the drawer.
During the entrance, it finishes the open: the Panel and the Backdrop jump
to their resting look and the drawer stays open. During the exit, it
cancels the close: an explicit `close()`, Escape, an outside press or
`Drawer.Close` is undone, the Panel and the Backdrop jump back to their
resting, open look, the dialog stays open at its snap point, and
`onOpenChange` never fires. A tap with no scroll cancels the close the same
way a touch or a wheel does, even for Escape. The gesture that interrupted
the transition then continues natively from there. The drawer is already at
its snap point either way, since neither the entrance nor the exit ever
moves `scrollTop`.

## Why not the engine’s own ease

An earlier version of this animated `scrollTop` itself, in JavaScript, on
every frame (closed PR #292). A CSS transition on `transform` runs on the
compositor instead. See #268 for the reasoning.
