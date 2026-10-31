---
title: On-screen keyboard
description: 'Focusing an input inside the drawer lifts it above the on-screen keyboard by default (#273): the CSS variable it sets, both keyboard models, and the one engine it supports neither of.'
---

Focusing a text field inside the drawer, on a touch device, opens the
on-screen keyboard. By default, the drawer lifts itself above it: the
Viewport's own bottom edge moves up to sit right at the keyboard's top
edge, the drawer keeps whatever snap point it was already resting on, and
the focused field stays visible. Nothing animates, and nothing closes.
Closing the keyboard puts the drawer back to its full height, on the same
snap point.

<!-- demo:example-keyboard -->

Open it on a phone and focus either field: a short summary, or a longer
message.

This is on by default, with no prop to turn it on. It costs two passive
`visualViewport` listeners, both only while the drawer is open.

## The CSS variable

`Drawer.Popup` carries `--drawer-keyboard-inset`, in pixels, the height of
the keyboard as far as `visualViewport` reports it. It is `0px` with no
keyboard open. Read it for your own layout, for example to reserve space
for a footer input below the scrollable content:

```css
.footer {
  padding-bottom: var(--drawer-keyboard-inset, 0px);
}
```

Always keep the `0px` fallback: the variable is only present while the
drawer is open, so a bare `var(--drawer-keyboard-inset)` is invalid before
the first keyboard open and after the drawer closes.

The lift itself needs none of this. The engine applies it directly to the
Viewport's own height, so it works headless, with no CSS of your own.

## Two keyboard models

A touch browser handles the keyboard one of two ways, and drawerdeck
covers both:

- **The overlay model.** iOS Safari always, and Android Chrome by
  default (`interactive-widget=resizes-visual`, the default when no
  `viewport` meta tag sets `interactive-widget` at all). The keyboard
  covers part of the page: `visualViewport.height` shrinks, but
  `window.innerHeight` does not. The engine reads the gap between them
  and lifts the drawer by it.
- **`interactive-widget=resizes-content`.** `window.innerHeight` itself
  shrinks, `visualViewport` tracks it exactly, and the gap between them
  stays 0. The drawer already handles this: its layout is built on
  `100dvh`, so a layout-viewport resize mid-open already keeps the same
  snap point through the same path a window resize or an orientation
  change use.

Either way, the drawer keeps its snap index and never closes.

## Every side

The keyboard always comes up from the bottom of the screen, so the lift
always shrinks the Viewport's own height, whichever edge the drawer opens
from: a `bottom` drawer lifts, `left` and `right` get shorter (their panel
typically fills the Viewport's own height), and `top` keeps its own top
edge exactly where it was.

## What this does not cover

iOS Safari supports neither the `interactive-widget` viewport meta tag nor
the VirtualKeyboard API: `visualViewport` is the only signal it gives a
page about the keyboard, which is what this feature reads. Android's two
models above are the only ones this guide documents; a phone running an
older WebView, or a browser this was never checked against, falls back to
whatever that browser already does with an overflowing page, the same as
before this feature existed.

This has been checked in Chromium and WebKit through a stand-in for
`visualViewport`, not yet on a real device: see the "Compare" page for how
drawerdeck's keyboard handling reads next to vaul, Base UI's Drawer and
React Aria's Sheet.
