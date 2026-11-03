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

`@drawerdeck/core`'s own `indent` option takes an element (`null` while
nothing should indent). While active (from the moment this drawer leaves
`'closed'` through the moment it returns to it, never only while fully
`'open'`, the same reason a nested drawer's own contribution to
`--drawer-nested` stays live through its whole close), the target gets
`data-drawer-indent`, a `transform-origin` set once, at activation, to the
viewport's own center in document coordinates (fixing the page-shift bug
a scrolled-before-opening page would otherwise show: measured at 235px
with the origin left at the default versus about 1px with this), and a
registered `--drawer-indent-progress` (`0` closed, `1` fully open), driven
by a native `animation` bound to the second timeline wherever one
resolves, or written directly on a real scroll frame where it does not
(Firefox). `documentElement`'s own shared `timeline-scope` is managed as a
set, not a single name, since more than one drawer's own indent can be
live on the page at once, and the page's own original inline value, if
any, is captured once and restored exactly once the last one clears.

Only the outermost open drawer indents the page: `@drawerdeck/react`'s own
`Drawer.Root` ignores its own `indent` prop entirely while nested inside
another one, through the same context `nestedCount` already uses to find
its parent, rather than anything `@drawerdeck/core` enforces. Nested
drawers keep using `--drawer-nested`/`--drawer-nested-progress`; the two
recipes are not meant to stack.

## What this does not revisit

ADR-0001's other findings (`showModal()`'s own initial focus, the viewport
resize during an opening scroll, a mouse needing a pointer handler to drag
a scroll container) are unrelated to this one and still hold. ADR-0001's
own prototype also predates `timeline-scope` reaching a scroll timeline at
all outside the element that declares it (`--drawer`, `Drawer.Backdrop`'s
own dim, already crosses into the dialog's own descendants this way); what
this ADR adds is crossing the top layer itself, which the prototype never
tried with a second, un-scoped name.
