# An indent crosses the top layer with a second timeline

This decision is accepted, on 2026-11-03. **Status: built, in #274.**

ADR-0001's own prototype found that a scroll-driven animation on the page
behind the dialog does not resolve, even with `timeline-scope` on `:root`,
and concluded a background indent needs JS or a different structure.
#274's own research, against real Chromium 153 and WebKit 26.6, found the
opposite once two details are right, neither of which the prototype had:

- The Viewport needs a **second** named scroll timeline, one the dialog
  does not itself list in its own `timeline-scope`. Re-declaring the same
  name there, the way the prototype's own dim timeline already is,
  isolates it instead (that re-declaration, not the top layer itself,
  was the prototype's real cause). `--drawer`, the dim's own name, stays
  scoped to the dialog exactly as before; the indent's own name
  (`@drawerdeck/core`'s own `indentTimelineName`, generated once per
  instance) is deliberately left off it.
- That second name needs to be in `timeline-scope` on a shared ancestor of
  both the Viewport and the target element outside the dialog.
  `documentElement` always is one, modal or not, portaled or not, so this
  engine uses it directly rather than asking a consumer to declare
  anything of their own.

Checked directly: an element outside the `<dialog>`, portaled or not,
binds to the Viewport's own second scroll timeline and animates
accordingly, in both engines, with `CSSAnimation.timeline` resolving
non-null the moment the animation is set up.

## The mechanism

`@drawerdeck/core`'s own `indent` option takes a ref-like object or an
element (`null` while nothing should indent). Only one drawer ever indents
the page at a time, a single, page-wide owner, not one timeline per
instance: the first drawer to want it keeps it (`indentOwner`, a plain
object unique to that instance) until it releases, and every other
instance's own `updateIndent` gets a chance to claim it the moment that
happens. With only ever one real owner, every instance shares the same
timeline name (`--drawer-indent`) instead of each generating its own.

While active (from the moment this drawer leaves `'closed'` through the
moment it returns to it, never only while fully `'open'`, the same reason
a nested drawer's own contribution to `--drawer-nested` stays live through
its whole close), the target gets `data-drawer-indent` (this drawer's own
`side`, so an adopted stylesheet rule keyed on it can bind the `animation`
and the `transform-origin`), `data-ending-style` for its whole close (the
same attribute `Drawer.Panel`'s own entrance and exit recipe reads, so a
CSS recipe can ease the indent back out through a button close, Escape or
an outside press, not only a drag, where the real scroll position never
moves at all), and a registered `--drawer-indent-progress` (`0` closed,
`1` fully open), driven by a native `animation` bound to the shared
timeline wherever one resolves, or written directly on a real scroll frame
where it does not (Firefox). The adopted stylesheet carries two more rules
for this: `[data-drawer-indent]{transform-origin:var(--drawer-indent-origin)}`,
where `--drawer-indent-origin` is set once, at activation, to the
viewport's own center relative to the target's own box (fixing the
page-shift bug a scrolled-before-opening page would otherwise show:
measured at 235px with the origin left at the default versus about 1px
with this), and `:root:has([data-drawer-indent]){timeline-scope:--drawer-indent}`,
so the shared timeline reaches outside the dialog with no inline write on
`<html>` at all. Nothing is ever written to the target's own inline
`style` beyond the three custom properties this owns, so nothing is ever
saved or restored either: an inline `animation` a consumer already set on
the target of their own still wins over the adopted stylesheet's rule, the
same as any inline style beats a stylesheet rule at equal specificity, and
the indent then does nothing on that element.

The first drawer that wants it holds the indent until it releases, the
same single, page-wide owner "The mechanism", above, already describes:
`@drawerdeck/react`'s own `Drawer.Root` ignores its own `indent` prop
entirely while nested inside another one, through the same context
`nestedCount` already uses to find its parent, rather than anything
`@drawerdeck/core` enforces. Nested
drawers keep using `--drawer-nested`/`--drawer-nested-progress`; the two
recipes are not meant to stack.

## What this does not revisit

ADR-0001's other findings (`showModal()`'s own initial focus, the viewport
resize during an opening scroll, a mouse needing a pointer handler to drag
a scroll container) are unrelated to this one and still hold. ADR-0001's
own prototype already had `timeline-scope` on `:root`, reaching past the
element that declares a scroll timeline (`--drawer`, `Drawer.Backdrop`'s
own dim, a descendant of the dialog, already resolved under exactly that).
What failed, for the element *outside* the dialog, was not the top layer
itself: "The mechanism", above, and this ADR's own first bullet point,
identify the real cause as the dialog's own `timeline-scope` re-declaring
that very same name for the dim's own benefit, which isolates it from
anything outside instead of merely exposing it there. What this ADR adds
is giving the outside target's own named timeline a *second*, distinct
name the dialog's own `timeline-scope` never lists at all, so nothing
re-isolates it.
