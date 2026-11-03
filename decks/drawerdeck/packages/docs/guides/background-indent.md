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

`@drawerdeck/core` sets `data-drawer-indent` on `pageRef`'s own element
while this drawer is open, through the end of its own close, and drives a
registered `--drawer-indent-progress` (`0` closed, `1` fully open) on it.
One line of CSS reads it:

```css
[data-drawer-indent] {
  scale: calc(1 - 0.05 * var(--drawer-indent-progress));
}
```

A body background and a little `border-radius` on the page wrapper sell
the effect, the same recipe iOS's own nested-sheet indent uses:

```css
body {
  background: #000;
}

[data-drawer-indent] {
  scale: calc(1 - 0.05 * var(--drawer-indent-progress));
  border-radius: calc(var(--drawer-indent-progress) * 16px);
  overflow: hidden;
  transition: border-radius 300ms ease;
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
-- `documentElement`, always one, whether the target sits in normal flow
or `Drawer.Popup` renders through a portal. Wherever that resolves
(Chromium, Safari), the whole thing runs as a native `animation`, with no
JS on a drag or a swipe at all: the same "no JS while scrolling" guarantee
every other recipe here keeps. Where it does not (Firefox),
`@drawerdeck/core` writes `--drawer-indent-progress` directly as the
Viewport scrolls, the same split every other progress value in this
engine makes.

## Only the outermost drawer indents the page

Nest a `Drawer.Root` inside another one's `Drawer.Content` ("Nested
drawers"), and the inner one's own `indent` prop, if it has one, is
ignored outright: it never reaches `@drawerdeck/core` at all. Only the
outermost drawer in a stack ever indents the page; a nested drawer keeps
using `--drawer-nested`/`--drawer-nested-progress` to scale the drawer
_behind_ it instead. The two recipes are not meant to compose, and nothing
here tries to make them.

## A portal changes nothing

`Drawer.Popup` rendered through a `createPortal`, as the "Nested drawers"
guide's own demo does for one level, still indents correctly: unlike
`--drawer-nested-progress`, which only reaches a nested child that is a
genuine DOM descendant of the dialog behind it, the indent's own
`timeline-scope` is rooted on `documentElement`, a shared ancestor of the
Viewport and the target either way. The binding resolves the same,
portaled or not.

## Restored exactly on close

`data-drawer-indent`, `--drawer-indent-progress`, the `animation`
properties the native path sets, and the entry this drawer's own indent
added to `documentElement`'s `timeline-scope`, all clear the moment this
drawer's own phase reaches `'closed'` (a close button, Escape, a drag or
a flick past the closed point, or an unmount while still open, all the
same). Any inline style the target already had before this drawer's indent
first touched it (an inline `transform-origin` or `animation` a consumer
set directly, unlikely but not assumed absent) is restored to exactly
that value, never simply removed.

## The page does not shift when it was already scrolled

`transform-origin` is set once, at the moment the indent activates, to
the viewport's own center in document coordinates (`scrollX +
innerWidth / 2`, `scrollY + innerHeight / 2`), not the default (the
target's own top-left) and not the viewport's own top-left either.
Scaling an element whose `transform-origin` sits anywhere else visibly
shifts the page the moment the page was scrolled before the drawer opened:
#274's own research measured a 235px shift with the origin left at the
default, against about 1px with this. The saved origin is restored once
the indent ends, so the scale eases back out around the same point it
eased in from.
