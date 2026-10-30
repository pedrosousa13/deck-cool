---
title: Non-modal drawers
description: 'modal={false} opens Drawer.Popup with show() instead of showModal(): the page behind stays interactive, nothing is trapped, and the choice over the Popover API, recorded (#271).'
---

`Drawer.Root` is modal by default: `Drawer.Popup` opens with `showModal()`,
so the browser gives it the top layer, a focus trap, an inert page behind
it and Escape, for free. `modal={false}` opens it with `show()` instead.
None of that happens: the page behind stays interactive, and the drawer
traps nothing.

```tsx
<Drawer.Root modal={false}>
  <Drawer.Trigger>Open</Drawer.Trigger>
  <Drawer.Popup>
    <Drawer.Viewport>
      <Drawer.Panel>
        <Drawer.Handle />
        <Drawer.Content>...</Drawer.Content>
      </Drawer.Panel>
    </Drawer.Viewport>
  </Drawer.Popup>
</Drawer.Root>
```

## What stays the same

Dragging, snapping, a flick dismissal, the Panel's CSS entrance and exit
(`data-starting-style`/`data-ending-style`), and the Backdrop's dim all
behave exactly as they do in a modal drawer: none of it reads `modal`.
`Drawer.Backdrop` is optional either way: a non-modal drawer that omits
it has no dim at all, which is a reasonable choice once the page behind is
visible and interactive.

Escape still closes a non-modal drawer when it is dismissible, and focus
still returns to `Drawer.Trigger` once it closes. The mechanism differs
under the hood (below), but the behaviour does not.

## What does not

**An outside press never closes a non-modal drawer by default.** Base UI's
own non-modal example (`modal={false}` with `disablePointerDismissal`) reads
"this drawer does not trap focus and ignores outside clicks": dismissal by
the handle or a close button only. drawerdeck follows that reading: once
the page behind is genuinely interactive, a press that lands there is a
press on the page, not on the drawer, so it is never read as a request to
close the drawer. `dismissible` still governs Escape and a drag to closed;
it has nothing left to say about an outside press once there no longer is
one.

## `show()`, not the Popover API

Non-modal needed a different way to show `Drawer.Popup`. Two native
candidates were on the table: a non-modal `<dialog>` (`show()`) and the
Popover API (`showPopover()`), which does give the top layer without a
portal. Checked against Chromium and WebKit:

- **The top layer.** Only a _modal_ dialog is promoted to the top layer;
  `show()` leaves it in normal flow, stacked by `z-index` like any other
  `position: fixed` element. A popover always gets the top layer, modal or
  not.
- **Escape.** A modal dialog's `cancel` event fires on Escape in both
  engines. A non-modal dialog does not fire it at all, confirmed on
  MDN's own `<dialog>` reference: "A non-modal dialog does not dismiss via
  the Esc key by default." A popover does close on Escape, but only in its
  `auto` state; `manual` (the state a drawer needs, since outside presses
  must not light-dismiss it) does not.
- **The scroll-snap Viewport.** Works the same either way: it is a plain
  scrollable `<div>`, indifferent to what it is inside.

So neither candidate gives Escape away for free once outside-press
light-dismiss is off the table, and only the popover keeps the top layer.
Against that, switching `Drawer.Popup` to a popover would mean giving up
every piece of `<dialog>`-specific plumbing this engine already has and
carefully tuned (#268): `dialog.close()`, its `close`/`cancel` events, the
double-Escape race mid-entrance, and the whole interruption-handling path
that `beginExit`/`finishExit` drive. A popover's own `toggle` event is a
different shape, and would need all of that re-derived against it, for a
second element type the engine would now have to support, modal and
non-modal both built on different primitives under one `Drawer.Popup`.

drawerdeck keeps `<dialog>` for both, and reads `modal` to pick `show()` or
`showModal()`. The engine adds its own `document`-level `keydown` listener
for Escape when non-modal (closed over the same `beginExit('escape')` path
`cancel` already uses for modal, so the behaviour, not just the event, is
identical), and sets `pointer-events: none` on the Popup so a real click,
hover, text selection or scroll outside it falls through to the page.

The Viewport itself still needs `pointer-events: auto`: WebKit refuses to
wheel- or trackpad-scroll an overflow element with `pointer-events: none`
at all, even where the point under the cursor resolves to a descendant
that overrides it back to `auto`. Left covering the whole screen, though,
an `auto` Viewport would just put itself back in the page's way: every
point outside the Panel would hit it instead of falling through. A
`clip-path` on the Viewport closes that gap, clipped to exactly the
Panel's own visible region, so hit-testing (which respects `clip-path` the
same way it respects `pointer-events`) only ever reaches the Viewport over
the Panel, and falls through the (opted-out) Popup to the page everywhere
else. The Panel's visible height is simply the Viewport's own `scrollTop`
(the gap above it is always one Viewport height), so the clip tracks it
directly off the existing `--drawer` scroll timeline, the same one the dim
already reads (#249), with a JS fallback that writes on scroll only where
that timeline is unsupported. The trade-off: a non-modal drawer
gives up the top layer, the one piece `show()` cannot recover. In practice
this costs drawerdeck nothing it did not already accept for its rivals:
neither vaul nor Base UI's Drawer uses the top layer at all, modal or not,
so losing it only for `modal={false}` is a narrower gap than either of
them has everywhere. Without the top layer, a non-modal `Drawer.Popup` is
an ordinary `position: fixed` element in normal flow: an ancestor with its
own `transform`, `filter`, `contain` or stacking context can clip or
reposition it, and the page's own content can cover it with a higher
`z-index`. A page whose layout does either may need to render
`Drawer.Popup` through a portal, or give it a `z-index` of its own; most
pages will not.
