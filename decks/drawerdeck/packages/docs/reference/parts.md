---
title: Parts
description: "Reference for drawerdeck's parts, from the beta API proposed in #234: Root, Trigger, Popup, Backdrop, Viewport, Panel, Handle, Title, Description, Content and Close, and their props."
---

This is the beta API proposed in #234, which #240 is building: no part
renders yet. Each part will take `className`, `style` and a `render` prop,
as carouseldeck's primitives do, besides the props below.

| Part                 | Renders    | What it does                                                                                                                                                                                         |
| -------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Drawer.Root`        | nothing    | Holds the drawer's state: whether it is open, its snap point and whether it dismisses. Holds the props below.                                                                                        |
| `Drawer.Trigger`     | `<button>` | Opens the drawer.                                                                                                                                                                                    |
| `Drawer.Popup`       | `<dialog>` | The top layer when modal; no portal needed then. Non-modal, it is an ordinary `position: fixed` element in normal flow, so it can need a portal or a `z-index` of its own (see "Non-modal drawers"). |
| `Drawer.Backdrop`    | `<div>`    | Dims the page, driven by the scroll position. Optional, especially non-modal.                                                                                                                        |
| `Drawer.Viewport`    | `<div>`    | The native scroll-snap container.                                                                                                                                                                    |
| `Drawer.Panel`       | `<div>`    | The visible sheet. You style this.                                                                                                                                                                   |
| `Drawer.Handle`      | `<div>`    | The drag handle.                                                                                                                                                                                     |
| `Drawer.Title`       | an element | Names the drawer for assistive technology.                                                                                                                                                           |
| `Drawer.Description` | an element | Describes the drawer for assistive technology.                                                                                                                                                       |
| `Drawer.Content`     | `<div>`    | Scrollable; locked until the top snap point.                                                                                                                                                         |
| `Drawer.Close`       | `<button>` | Closes the drawer.                                                                                                                                                                                   |

## `Drawer.Root` props

| Prop                             | Type                                          | Default    | What it does                                                                                                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`                           | `boolean`                                     |            | Whether the drawer is open, controlled.                                                                                                                                                                                                                                    |
| `defaultOpen`                    | `boolean`                                     | `false`    | Whether the drawer starts open. Read once, on mount.                                                                                                                                                                                                                       |
| `onOpenChange`                   | `(open: boolean, detail: { reason }) => void` |            | Called when the drawer opens or closes.                                                                                                                                                                                                                                    |
| `snapPoints`                     | an array of numbers or pixel strings          |            | Fractions of the Viewport's extent along the side's axis (height for `bottom`/`top`, width for `left`/`right`) the panel shows, such as `[0.5, 1]`. A string such as `'320px'` is also allowed. With none, the drawer has one open point: the panel at its content extent. |
| `snapPoint` / `defaultSnapPoint` | `number`                                      |            | The snap point to rest at, controlled or initial.                                                                                                                                                                                                                          |
| `onSnapPointChange`              | `(index: number) => void`                     |            | Called when the drawer settles on a new snap point.                                                                                                                                                                                                                        |
| `dismissible`                    | `boolean`                                     | `true`     | Whether dragging past the lowest snap point, Escape or an outside press can close the drawer. An outside press never closes a non-modal drawer, regardless of this option.                                                                                                 |
| `modal`                          | `boolean`                                     | `true`     | Whether `Drawer.Popup` opens with `showModal()` (the top layer, a focus trap, an inert page) or `show()`: the page behind stays interactive. See "Non-modal drawers".                                                                                                      |
| `side`                           | `'bottom' \| 'top' \| 'left' \| 'right'`      | `'bottom'` | Which edge the drawer opens from. Read once, on mount: changing it later does not move an already-mounted drawer to the new edge. See "Open from a side".                                                                                                                  |

`reason` is one of `'trigger' | 'drag' | 'escape' | 'outside-press' | 'close-button' | 'programmatic'`.

## Data attributes and CSS

`data-open`, `data-phase` (`opening | open | closing | closed`), `data-snap-index`
and `data-dragging` are set on the parts the beta's state applies to.
`data-side` (`Drawer.Root`'s own `side`) is set on `Drawer.Popup` and
`Drawer.Panel`, for styling a drawer differently per side.

`Drawer.Panel` and `Drawer.Backdrop` both carry `data-starting-style` on
open, and `data-ending-style` for the whole of a programmatic close (never
a drag or a flick): the attributes a consumer's own CSS transition drives
the entrance and the exit from. See "Animate the drawer".

`Drawer.Backdrop`'s dim is yours to style; see "Style the backdrop". Where
`animation-timeline: scroll()` resolves (Chromium, Safari), `Drawer.Viewport`
exposes a named scroll timeline, `--drawer`, that `Drawer.Backdrop` (or any
other descendant of `Drawer.Popup`) can drive a `@keyframes` animation from
with no JS per scroll frame, over a range read from `--drawer-first-snap`
(the pixel offset of the first snap point, set on `Drawer.Popup` once per
layout). Where it does not (Firefox), `--drawer-progress` (`0` closed to `1`
at the first snap point) is written on `Drawer.Popup` instead, as the
viewport scrolls.

`--drawer-keyboard-inset`, also on `Drawer.Popup`, is the part of the full
page, in pixels, the Viewport's own bottom edge still leaves covered once
it has fitted itself to the browser's own visible area -- not the
keyboard's own full height, which a browser that pans the page instead of
shrinking it (iOS Safari) can already have moved most of out of this
inset's way. It stays unset while the fit already reaches the visible
window's own bottom edge on its own (a pan can do that right when the
keyboard opens), is set once there is still a part left covered, drops back
to `0px` if the keyboard closes while the drawer stays open, and is removed
again when the drawer itself closes. On by default, no prop: the fit keeps
tracking the visible area through a resize or a pan while the drawer is on
its way out too, and the drawer expands to its largest snap point when the
keyboard would otherwise hide the focused field -- see "On-screen
keyboard". `Drawer.Popup` itself also sizes to `window.innerHeight` while
the fit is active, instead of its own usual `100dvh`, so `Drawer.Backdrop`
(a `position: fixed; inset: 0` child `Drawer.Popup`'s own `overflow: hidden`
still clips to its box) keeps covering the full layout viewport. Extend
`Drawer.Backdrop` by `--drawer-keyboard-inset`, flush against its own
bottom edge, to continue the drawer's own surface behind the keyboard the
way a native iOS sheet does -- see "On-screen keyboard"'s own "The gap
behind the keyboard".

## Not in the beta

Nested drawers (#237) and a background indent.
