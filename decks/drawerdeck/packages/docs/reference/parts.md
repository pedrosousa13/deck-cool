---
title: Parts
description: "Reference for drawerdeck's parts, from the beta API proposed in #234: Root, Trigger, Popup, Backdrop, Viewport, Panel, Handle, Title, Description, Content and Close, and their props."
---

This is the beta API proposed in #234, which #240 is building: no part
renders yet. Each part will take `className`, `style` and a `render` prop,
as carouseldeck's primitives do, besides the props below.

| Part                 | Renders    | What it does                                                                                                  |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| `Drawer.Root`        | nothing    | Holds the drawer's state: whether it is open, its snap point and whether it dismisses. Holds the props below. |
| `Drawer.Trigger`     | `<button>` | Opens the drawer.                                                                                             |
| `Drawer.Popup`       | `<dialog>` | The top layer when modal; no portal needed either way.                                                        |
| `Drawer.Backdrop`    | `<div>`    | Dims the page, driven by the scroll position. Optional, especially non-modal.                                 |
| `Drawer.Viewport`    | `<div>`    | The native scroll-snap container.                                                                             |
| `Drawer.Panel`       | `<div>`    | The visible sheet. You style this.                                                                            |
| `Drawer.Handle`      | `<div>`    | The drag handle.                                                                                              |
| `Drawer.Title`       | an element | Names the drawer for assistive technology.                                                                    |
| `Drawer.Description` | an element | Describes the drawer for assistive technology.                                                                |
| `Drawer.Content`     | `<div>`    | Scrollable; locked until the top snap point.                                                                  |
| `Drawer.Close`       | `<button>` | Closes the drawer.                                                                                            |

## `Drawer.Root` props

| Prop                             | Type                                          | Default | What it does                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`                           | `boolean`                                     |         | Whether the drawer is open, controlled.                                                                                                                                                      |
| `defaultOpen`                    | `boolean`                                     | `false` | Whether the drawer starts open. Read once, on mount.                                                                                                                                         |
| `onOpenChange`                   | `(open: boolean, detail: { reason }) => void` |         | Called when the drawer opens or closes.                                                                                                                                                      |
| `snapPoints`                     | an array of numbers or pixel strings          |         | Fractions of the viewport height the panel shows, such as `[0.5, 1]`. A string such as `'320px'` is also allowed. With none, the drawer has one open point: the panel at its content height. |
| `snapPoint` / `defaultSnapPoint` | `number`                                      |         | The snap point to rest at, controlled or initial.                                                                                                                                            |
| `onSnapPointChange`              | `(index: number) => void`                     |         | Called when the drawer settles on a new snap point.                                                                                                                                          |
| `dismissible`                    | `boolean`                                     | `true`  | Whether dragging past the lowest snap point, Escape or an outside press can close the drawer. An outside press never closes a non-modal drawer, regardless of this option.                   |
| `modal`                          | `boolean`                                     | `true`  | Whether `Drawer.Popup` opens with `showModal()` (the top layer, a focus trap, an inert page) or `show()`: the page behind stays interactive. See "Non-modal drawers".                        |

`reason` is one of `'trigger' | 'drag' | 'escape' | 'outside-press' | 'close-button' | 'programmatic'`.

## Data attributes and CSS

`data-open`, `data-phase` (`opening | open | closing | closed`), `data-snap-index`
and `data-dragging` are set on the parts the beta's state applies to.

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

## Not in the beta

Sides other than the bottom and nested drawers (#237), and a background
indent.
