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

| Prop                             | Type                                          | Default    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`                           | `boolean`                                     |            | Whether the drawer is open, controlled.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `defaultOpen`                    | `boolean`                                     | `false`    | Whether the drawer starts open. Read once, on mount.                                                                                                                                                                                                                                                                                                                                                                                        |
| `onOpenChange`                   | `(open: boolean, detail: { reason }) => void` |            | Called when the drawer opens or closes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `snapPoints`                     | an array of numbers or pixel strings          |            | Fractions of the Viewport's extent along the side's axis (height for `bottom`/`top`, width for `left`/`right`) the panel shows, such as `[0.5, 1]`. A string such as `'320px'` is also allowed. With none, the drawer has one open point: the panel at its content extent.                                                                                                                                                                  |
| `snapPoint` / `defaultSnapPoint` | `number`                                      |            | The snap point to rest at, controlled or initial.                                                                                                                                                                                                                                                                                                                                                                                           |
| `onSnapPointChange`              | `(index: number) => void`                     |            | Called when the drawer settles on a new snap point.                                                                                                                                                                                                                                                                                                                                                                                         |
| `dismissible`                    | `boolean`                                     | `true`     | Whether dragging past the lowest snap point, Escape or an outside press can close the drawer. An outside press never closes a non-modal drawer, regardless of this option.                                                                                                                                                                                                                                                                  |
| `modal`                          | `boolean`                                     | `true`     | Whether `Drawer.Popup` opens with `showModal()` (the top layer, a focus trap, an inert page) or `show()`: the page behind stays interactive. See "Non-modal drawers". Nested inside another `Drawer.Root`, only `true` is supported: a non-modal drawer may be the outermost level, with modal drawers nested inside it, but not the other way around. `Drawer.Root` warns once in development when this is violated. See "Nested drawers". |
| `side`                           | `'bottom' \| 'top' \| 'left' \| 'right'`      | `'bottom'` | Which edge the drawer opens from. Read once, on mount: changing it later does not move an already-mounted drawer to the new edge. See "Open from a side".                                                                                                                                                                                                                                                                                   |
| `indent`                         | a ref                                         |            | An opt-in background indent: scales the consumer's own page wrapper back as the drawer opens. Only one drawer indents the page at a time; ignored outright on a `Drawer.Root` nested inside another one. See "A background indent".                                                                                                                                                                                                         |

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

`--drawer-keyboard-inset`, also on `Drawer.Popup`, is the part of the layout
viewport a keyboard covers at its own bottom edge, in pixels:
`visualViewport`'s own numbers, not the keyboard's own full height, which a
browser that pans the page can already have moved part of out of this
inset's way. It stays unset while nothing covers the Viewport, is set once
a keyboard covers part of it, drops back to `0px` if the keyboard closes
while the drawer stays open, and is removed again when the drawer itself
closes. On by default, no prop: the Viewport keeps its full size and
position for as long as a keyboard is open or closing, and the drawer
always expands to its largest snap point when the keyboard opens while a
field inside it has focus, scrolling it clear of the keyboard with an
explicit `Drawer.Content` scroll (`Drawer.Content`'s own `padding-bottom`,
set to `--drawer-keyboard-inset`, gives it room to scroll into). While
typing, the drawer's own top edge may move up with Safari's own page pan;
see "On-screen keyboard".

`data-nested-open`, on `Drawer.Popup` and `Drawer.Panel`, is set while a
drawer opened from inside this one (at any depth) is open, and is removed
the moment the last one closes. `--drawer-nested`, also on both
`Drawer.Popup` and `Drawer.Panel`, is an integer: how many drawers are
currently stacked above this one (`1`, `2`, …). It is always present,
written as `0` once nothing is stacked above, not removed, so a CSS rule
reading it on the frontmost drawer never inherits a stale count from a
dialog further down the stack. Both move the moment a drawer nested above
this one starts closing (a close button, Escape, a drag release, a flick,
or a parent's own cascade), not once it finishes, and neither is ever
removed and immediately re-added for the same update. See "Nested
drawers".

`--drawer-nested-progress`, on `Drawer.Panel` only, is the live open
progress of the one drawer directly above it that is currently open or
opening (`0` fully closed, `1` fully open), updated continuously as
that drawer is dragged, swiped or thrown, with no JS running per drag
frame where the browser supports a named scroll timeline (Chromium,
Safari). Written as `1` once that drawer has fully opened and `0` once
nothing is open directly above, the same direct-write discipline
`--drawer-nested` already follows. See "Nested drawers".

`data-drawer-indent`, on the element `Drawer.Root`'s own `indent` prop
names, is set to this drawer's own `side` while it is open, through the
end of its own close. `--drawer-indent-progress`, on the same element, is
this drawer's own live open progress (`0` fully closed, `1` fully open),
with no JS running per drag frame where the browser supports a named
scroll timeline, even where that element sits outside `Drawer.Popup`
entirely. `data-ending-style` is also mirrored onto it for the whole
close, the same attribute `Drawer.Panel`'s own entrance and exit already
use, so a CSS recipe can ease the indent back out through a button close,
Escape or an outside press, not only a drag. See "A background indent".

## Storybook

A few of the props above have their own story, in this repo's storybook
(`decks/drawerdeck`, `pnpm storybook`), past what a guide already demos:
`Drawer / Snap Points` (`snapPoints`, uncontrolled), `Drawer / Controlled`
(a controlled `open` and `snapPoint` together), `Drawer / Scrolling
Content` (`Drawer.Content`, locked below the top snap point) and `Drawer /
Non Dismissible` (`dismissible={false}`).
