---
title: On-screen keyboard
description: 'Focusing an input inside the drawer lifts it above the on-screen keyboard by default (#273, fixed for a real device in #327): the visible-area fit, the CSS variable it sets, both keyboard models, and when the drawer expands to its largest snap point.'
---

Focusing a text field inside the drawer, on a touch device, opens the
on-screen keyboard. By default, the drawer lifts itself above it: the
Viewport fits itself to exactly the part of the screen the browser still
shows, and the drawer keeps whatever snap point it was already resting on.
Nothing animates, and nothing closes. Closing the keyboard puts the drawer
back to its full height, on the same snap point.

If the focused field would not fit inside that smaller, fitted Viewport at
the current snap point, the drawer expands to its largest one -- the same
thing a native iOS sheet does, so the content unlocks and the browser's own
scroll-into-view can reveal the field. It stays there once the keyboard
closes; a field already visible never moves the drawer at all.

<!-- demo:example-keyboard -->

Open it on a phone and focus either field: a short summary, or a longer
message.

This is on by default, with no prop to turn it on. It costs two passive
`visualViewport` listeners and one `window` listener, all only while the
drawer is open.

## The visible-area fit

A touch browser does not shrink the page to make room for the keyboard: it
keeps reporting the same `window.innerHeight`, and tells a page which part
of it is actually visible through `visualViewport`'s own `offsetTop` and
`height`. The drawer fits its Viewport to exactly that: `top` tracks
`visualViewport.offsetTop` and `height` tracks `visualViewport.height`,
both in the same pixels the browser reports them in. A Viewport that only
ever shrank its own height, never moving its own top, is wrong by however
far the browser panned the page to bring the focused field into view --
the Viewport's own bottom edge comes up short of the real, visible window
by that amount, cutting off the drawer's own bottom. Fitting both tracks
the pan directly, whatever caused it.

## The CSS variable

`Drawer.Popup` carries `--drawer-keyboard-inset`, in pixels: the part of
the full page the fitted Viewport's own bottom edge still leaves covered
(`innerHeight - offsetTop - height`), not the keyboard's own full height --
when the browser pans instead of shrinking, that covered part can be
smaller than the keyboard, or zero, since the fit itself is what pulls the
Viewport's own bottom edge up to meet the visible window. It stays unset
while the fitted Viewport's own bottom edge already reaches the visible
window's own bottom (a pan can already do that on its own, right when the
keyboard opens), is set once there is still a part left covered, drops back
to `0px` if the keyboard closes while the drawer stays open, and is removed
again when the drawer itself closes. Read it for your own layout, for
example to reserve space for a footer input below the scrollable content:

```css
.footer {
  padding-bottom: var(--drawer-keyboard-inset, 0px);
}
```

Always keep the `0px` fallback: the variable is only present while the
drawer is open, so a bare `var(--drawer-keyboard-inset)` is invalid before
the first keyboard open and after the drawer closes.

The fit itself needs none of this. The engine applies it directly to the
Viewport's own position and height, so it works headless, with no CSS of
your own.

## Two keyboard models

A touch browser handles the keyboard one of two ways, and drawerdeck
covers both:

- **The overlay model.** iOS Safari always, and Android Chrome by
  default (`interactive-widget=resizes-visual`, the default when no
  `viewport` meta tag sets `interactive-widget` at all). The keyboard
  covers part of the page: `visualViewport.height` shrinks, and the
  browser pans the page to keep the focused field above the keyboard, so
  `visualViewport.offsetTop` moves too, while `window.innerHeight` does
  not. The fit tracks both.
- **`interactive-widget=resizes-content`.** `window.innerHeight` itself
  shrinks, `visualViewport` tracks it exactly, and the gap between them
  stays 0. The drawer already handles this: its layout is built on
  `100dvh`, so a layout-viewport resize mid-open already keeps the same
  snap point through the same path a window resize or an orientation
  change use.

A WKWebView wrapper around a site (a non-Safari iOS browser, in practice)
can also shrink the layout viewport itself, the way
`interactive-widget=resizes-content` does, but animated over many `window`
'resize' events rather than settling at once -- the fit also runs on every
`window` 'resize' while open, not only `visualViewport`'s own, so it
re-reads and converges at each step of that animation instead of freezing
at whatever it read when the animation started.

Either way, the drawer keeps its snap index (unless it expands to the
largest one, above) and never closes.

A resize or a pan while the drawer is already on its way out (Escape, an
outside press, `Drawer.Close` or `close()`) still keeps the fit tracking
the visible area, exactly as it would with the keyboard closed: a CSS
transition runs for its own declared duration regardless of how the box it
animates changes size, so keeping the Panel inside the visible area for the
whole exit never cuts that transition short.

## Every side

The keyboard always comes up from the bottom of the screen, so the fit
always moves the Viewport's own bottom edge, whichever edge the drawer
opens from: a `bottom` drawer lifts, `left` and `right` get shorter (their
panel typically fills the Viewport's own height), and `top` keeps its own
top edge exactly where it was.

## What this does not cover

iOS Safari supports neither the `interactive-widget` viewport meta tag nor
the VirtualKeyboard API: `visualViewport` is the only signal it gives a
page about the keyboard, which is what this feature reads. Android's two
models above, and the WKWebView variant of the second, are the only ones
this guide documents; a phone running an older WebView, or a browser this
was never checked against, falls back to whatever that browser already
does with an overflowing page, the same as before this feature existed.

This has been checked in Chromium and WebKit through a stand-in for
`visualViewport`, replaying sequences logged from a real iPhone in both
Safari and a WKWebView browser: see the "Compare" page for how
drawerdeck's keyboard handling reads next to vaul, Base UI's Drawer and
React Aria's Sheet.
