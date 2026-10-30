---
title: Open from a side
description: 'The side prop (#270): bottom, top, left or right, each a native scroll-snap container along its own axis, with the same drag, snap points and dismissal as the default bottom sheet.'
---

`Drawer.Root`'s `side` prop picks which edge the drawer opens from:
`'bottom' | 'top' | 'left' | 'right'`, defaulting to `'bottom'`. Every
other prop, including `snapPoints`, `dismissible`, `modal`, a controlled
`open` or `snapPoint`, works the same on every side.

<!-- demo:example-sides -->

Pick a side above, then press Open: drag or scroll it between half and
full, the same as the default bottom sheet.

```tsx
<Drawer.Root side="left" snapPoints={[0.5, 1]}>
  <Drawer.Trigger>Open</Drawer.Trigger>
  <Drawer.Popup>
    <Drawer.Backdrop />
    <Drawer.Viewport>
      <Drawer.Panel>
        <Drawer.Handle />
        <Drawer.Title>Filters</Drawer.Title>
        <Drawer.Content>…</Drawer.Content>
        <Drawer.Close>Done</Drawer.Close>
      </Drawer.Panel>
    </Drawer.Viewport>
  </Drawer.Popup>
</Drawer.Root>
```

Your own markup needs no change: `side` only changes which axis
`Drawer.Viewport`'s native scroll-snap container scrolls along (vertical
for `bottom`/`top`, horizontal for `left`/`right`), and, for `top`/`left`,
the order the engine expects its children in, both handled for you.
`snapPoints` are still fractions of the Viewport's own extent along that
axis: height for `bottom`/`top`, width for `left`/`right`. Give the Panel
an explicit width for `left`/`right` (the recipes give it a `height`
instead, for `bottom`/`top`): an unstyled `<div>` takes its height from its
own content for free, but not its width.

## `data-side`

`Drawer.Popup` and `Drawer.Panel` both carry `data-side` (`"bottom"`,
`"top"`, `"left"` or `"right"`), for styling a drawer differently per
side: its CSS entrance and exit ("Animate the drawer"), its dim's own
scroll range and direction ("Style the backdrop"), or the Panel's own
`border-radius` (rounded toward the page, not the edge it's docked
against).

## Why not `flex-direction: row-reverse` or `direction: rtl`

`top` and `left` reverse the Viewport's own DOM order (`[Panel][gap]`,
instead of `bottom`/`right`'s `[gap][Panel]`) so that open always sits at
scroll offset 0 and closed at the scroll end, with every
`scrollTop`/`scrollLeft` this engine reads or writes staying a plain,
positive number. `flex-direction: row-reverse` or `direction: rtl` would
have kept the DOM order the same and flipped the _visual_ order instead,
reading `scrollLeft` as negative for the same visual scroll position in
some browsers, an extra case this engine's own math, and every consumer
reading `scrollLeft` directly, would have had to carry. Reversing the DOM
order instead keeps every side's `scrollTop`/`scrollLeft` a plain,
positive number, with the same math on every side.

## Mouse drag and the non-modal hit area

A mouse drag (#235) works the same way on every side: a dedicated pointer
handler, since a mouse cannot drag a scroll container, along whichever
axis `side` scrolls, with the same projected throw onto the nearest snap
point. `modal={false}`'s own clip-path hit area ("Non-modal drawers")
clips the Viewport to the Panel's own currently visible region, flush
against `side`'s own edge, on every side, driven by the same `--drawer`
scroll timeline (a horizontal one for `left`/`right`) with the same JS
fallback where it is unsupported.
