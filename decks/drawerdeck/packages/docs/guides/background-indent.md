---
title: A background indent
description: 'An opt-in indent prop on Drawer.Root scales the page behind it back as the drawer opens: data-drawer-indent and --drawer-indent-progress for CSS, no JS per drag frame where the browser supports it (#274).'
---

A `Drawer.Root` can scale the whole page back a little as it opens, the
way iOS and vaul's own `shouldScaleBackground` do: an `indent` prop, a ref
to the consumer's own page wrapper, is all it takes.

```tsx
function App() {
  const pageRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={pageRef}>
      <Drawer.Root indent={pageRef}>
        <Drawer.Trigger>Open</Drawer.Trigger>
        <Drawer.Popup>
          <Drawer.Viewport>
            <Drawer.Panel>
              <Drawer.Content>…</Drawer.Content>
              <Drawer.Close>Close</Drawer.Close>
            </Drawer.Panel>
          </Drawer.Viewport>
        </Drawer.Popup>
      </Drawer.Root>
    </div>
  );
}
```

`@drawerdeck/core` sets `data-drawer-indent` (this drawer's own `side`) on
`pageRef`'s own element while this drawer is open, through the end of its
own close, and drives a registered `--drawer-indent-progress` (`0` closed,
`1` fully open) on it. Reading `--drawer-indent-progress` alone eases the
page back on a drag or a flick, since that variable is itself native and
scroll-driven, but not on a trigger, a button close, Escape or an outside
press, none of which ever move the real scroll position at all: an
`open()`/`close()` driven by one of those jumps the real scroll position
straight to its resting value and eases the Panel's own visual entrance or
exit with a separate `transform` transition instead (the "Animate the
drawer" guide), so `--drawer-indent-progress` itself jumps too, the moment
one of them starts, not over the Panel's own declared duration. The recipe
below adds a second, transitioned factor so the page eases together with
the Panel either way.

```css
@property --drawer-indent-on {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

[data-drawer-indent] {
  --drawer-indent-on: 1;
  scale: calc(
    1 - 0.05 * var(--drawer-indent-progress) * var(--drawer-indent-on)
  );
  transition: --drawer-indent-on 300ms ease;
}

[data-drawer-indent][data-ending-style] {
  --drawer-indent-on: 0;
}
```

`--drawer-indent-on` is the only thing this recipe ever transitions, and
it is what eases both ways, on a trigger, a button close, Escape or an
outside press alike:

- **Opening**: `data-drawer-indent` itself only appears the moment this
  drawer starts opening. Before that, nothing matches `[data-drawer-indent]`
  at all, so this registered property reads its own `initial-value`, `0`.
  The instant the attribute appears, the base rule's `--drawer-indent-on: 1`
  newly matches on the very same element -- a real, transitionable change,
  `0` to `1`, declared `transition` and all -- so `--drawer-indent-on` eases
  up over 300ms with no separate `data-starting-style` rule needed at all.
- **Closing**: `data-ending-style`, the same attribute `Drawer.Panel`'s own
  exit recipe reads, is mirrored onto the indent target too, for its whole
  close. The compound selector's own higher specificity drops
  `--drawer-indent-on` back to `0`, easing `scale` back to `1` over the
  same transition, even though `--drawer-indent-progress` itself never
  moves during a CSS-driven close.

`@property`, registered with `syntax: '<number>'`, is what makes a plain
custom property transition at all, rather than flipping discretely partway
through.

A body background sells the effect, the same recipe iOS's own nested-sheet
indent uses:

```css
body {
  background: #000;
}

[data-drawer-indent] {
  border-radius: calc(var(--drawer-indent-progress) * 16px);
  overflow: clip;
}
```

<!-- demo:example-indent -->

## What it costs: a second scroll timeline, never JS per frame

ADR-0001's own prototype found a scroll-driven animation does not resolve
across the top layer, from inside the dialog to an element outside it, and
concluded a background indent needs JS, or a different structure. #274's
own research found the opposite once two things are true, and ADR-0002
records them: `Drawer.Viewport` declares a _second_ named scroll timeline
that `Drawer.Popup`'s own `<dialog>` does not itself list in its own
`timeline-scope` (re-declaring the same name there, the way the dim's own
`--drawer` already is, isolates it instead), and that second name is in
`timeline-scope` on a shared ancestor of both the Viewport and the target
-- `:root`, always one, whether the target sits in normal flow or
`Drawer.Popup` renders through a portal. Wherever that resolves (Chromium,
Safari), the whole thing runs as a native `animation`, set up by an adopted
stylesheet rule keyed on `[data-drawer-indent]`'s own value, with no JS on
a drag or a swipe at all: the same "no JS while scrolling" guarantee every
other recipe here keeps. Where it does not (Firefox), `@drawerdeck/core`
writes `--drawer-indent-progress` directly as the Viewport scrolls, the
same split every other progress value in this engine makes.

## Only one drawer indents the page at a time

The page-wide `indent` recipe has exactly one owner at once: whichever
drawer starts wanting it first keeps it until it releases (closes, or has
`indent` set back to `null`). A second drawer with `indent` set, while one
already owns it, does nothing at all -- no attribute, no scale -- until the
owner releases, at which point it picks it up on its own, with no extra
prop or call needed.

Nest a `Drawer.Root` inside another one's `Drawer.Content` ("Nested
drawers"), and the inner one's own `indent` prop, if it has one, is
ignored outright the same way: it never reaches `@drawerdeck/core` at all.
A nested drawer keeps using `--drawer-nested`/`--drawer-nested-progress` to
scale the drawer _behind_ it instead. The two recipes are not meant to
compose, and nothing here tries to make them.

## Two things this recipe does not override

An `animation` a consumer already sets inline on the indent target of
their own wins over the adopted stylesheet's rule -- inline styles always
beat a stylesheet at the same specificity -- so the indent then does
nothing on that element at all while that inline `animation` is present.
Nothing here detects or warns about this: an indent target with an inline
`animation` of its own is simply not one the indent can also drive.

A page's own inline `timeline-scope` on `<html>` is not merged with the
indent's own entry while a drawer is open: `:root:has([data-drawer-indent])`
(`ensureBackdropReset`'s own rule, in `@drawerdeck/core`) only ever adds the
indent's own name, through the stylesheet, never touching `<html>`'s own
inline property at all -- so a page that sets its own inline
`timeline-scope` on `<html>` keeps exactly that value throughout, with the
indent's own timeline still resolving from the stylesheet rule
independently of it.

## A portal changes nothing

`Drawer.Popup` rendered through a `createPortal`, as the "Nested drawers"
guide's own demo does for one level, still indents correctly: unlike
`--drawer-nested-progress`, which only reaches a nested child that is a
genuine DOM descendant of the dialog behind it, the indent's own
`timeline-scope` is rooted on `:root`, a shared ancestor of the Viewport
and the target either way. The binding resolves the same, portaled or not.

## Restored exactly on close

`data-drawer-indent`, `--drawer-indent-progress`, `--drawer-indent-origin`
and `--drawer-indent-range` all clear the moment this drawer's own phase
reaches `'closed'` (a close button, Escape, a drag or a flick past the
closed point, or an unmount while still open, all the same). The consumer's
own inline styles on the target are never touched in the first place --
the transform-origin and the native animation both come from the adopted
stylesheet's own rule, keyed on `data-drawer-indent`'s own presence, never
written inline on the target -- so there is nothing to save and nothing to
restore.

## The page does not shift when it was already scrolled

`transform-origin` comes from the stylesheet's own rule
(`transform-origin: var(--drawer-indent-origin)`), set once, at the moment
the indent activates, to the viewport's own center, expressed relative to
the target's own box (`innerWidth / 2 - rect.left`, `innerHeight / 2 -
rect.top`, from `target.getBoundingClientRect()` at that moment) -- not
the default, `50% 50%` (the target's own center), which shifts the page
visibly the moment the page was scrolled before the drawer opened: #274's
own research measured a 235px shift with the origin left at the default,
against about 1px with this. `--drawer-indent-origin` is cleared, with
everything else, the moment the indent ends (above); nothing is restored,
since nothing inline was ever changed.
