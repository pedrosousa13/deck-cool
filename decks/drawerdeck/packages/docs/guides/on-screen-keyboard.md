---
title: On-screen keyboard
description: 'The drawer stays put when the on-screen keyboard opens (#273, redesigned in #327): the CSS variable the keyboard still exposes, when the drawer expands to its largest snap point, and how it keeps the focused field clear of the keyboard.'
---

Focusing a text field inside the drawer, on a touch device, opens the
on-screen keyboard. The drawer stays exactly where it is: the Viewport keeps
its full size and position, and the keyboard simply covers its own lower
part, the same way Base UI's `DrawerVirtualKeyboardProvider` and React
Aria's `Sheet` both leave their own sheet alone and let the keyboard cover
it.

Whenever the keyboard opens while a field inside the drawer has focus, the
drawer always moves to its largest snap point if it is not there already
(the same thing a native iOS sheet does, so the content unlocks), and the
engine then scrolls `Drawer.Content` itself, measured against the real
visible window, to bring the field clear of the keyboard. It stays there
once the keyboard closes.

<!-- demo:example-keyboard -->

Open it on a phone and focus either field: a short summary, or a longer
message.

This is on by default, with no prop to turn it on. It costs two passive
`visualViewport` listeners and one `window` listener, both only while the
drawer is open.

## The CSS variable

`Drawer.Popup` carries `--drawer-keyboard-inset`, in pixels: the part of the
layout viewport a keyboard covers at its own bottom edge --
`max(0, innerHeight - offsetTop - height)`, `visualViewport`'s own numbers.
It stays unset while nothing covers the Viewport (before the first keyboard
open, and whenever `visualViewport` reports no gap at all), is set once a
keyboard covers part of it, drops back to `0px` if the keyboard closes while
the drawer stays open, and is removed again when the drawer itself closes.
Read it for your own layout, for example to reserve space for a footer
input below the scrollable content:

```css
.footer {
  padding-bottom: var(--drawer-keyboard-inset, 0px);
}
```

The engine also applies it to `Drawer.Content` itself, as both a real
`padding-bottom` and a `scroll-padding-bottom`: see "Keeping the field clear
of the keyboard", below, for why it needs both. This needs no CSS of your
own; it is there so the engine's own explicit scroll keeps a field clear of
the keyboard without your own layout doing anything.

Always keep the `0px` fallback: the variable is only present while the
drawer is open, so a bare `var(--drawer-keyboard-inset)` is invalid before
the first keyboard open and after the drawer closes.

## Keeping the field clear of the keyboard

`Drawer.Content`'s own `clientHeight` never shrinks for a keyboard -- the
Viewport above it never does either -- so a field sitting at Content's own
natural end has nothing below it to scroll into without the engine's own
`padding-bottom`, equal to `--drawer-keyboard-inset`: genuine scrollable
room past the last field. The engine then checks the focused field's own
`getBoundingClientRect()` against the real visible window directly, and
writes `Drawer.Content`'s own `scrollTop` to bring the field back inside
it, never `Drawer.Viewport`'s own scroll position, which stays untouched by
this. `scroll-padding-bottom`, kept alongside the
padding, is for a browser's own native scrolling inside Content, such as
`Tab` moving focus, so that still stops right at the padding's own edge for
a field that already has real content below it, rather than scrolling past
the natural stopping point into the empty padding for no reason.

## Expanding to the largest snap point

Whenever a field inside `Drawer.Panel` has focus and the keyboard opens,
the drawer always moves to its largest snap point first, if it is not
there already (the same thing a native iOS sheet does: the content unlocks
there, see "Why native scrolling" for why the top snap point is what
unlocks it), giving the engine room to scroll the field itself (see
"Keeping the field clear of the keyboard"). No prediction, no decline, no
revert: the engine does not check where the field already sits before
expanding, and never reverts the move once the keyboard closes; the drawer
stays at whatever snap point it expanded to. A drawer already at its
largest snap point, with nothing left to expand to, skips straight to
scrolling the field in.

This only happens for `bottom` and `top` drawers. The keyboard covers the
bottom of the layout viewport, a vertical concern whichever edge the drawer
opens from, so a field it hides is hidden vertically, never horizontally: a
`left` or `right` drawer never expands for it, since moving further along
its own horizontal axis would only scroll the Viewport sideways and reveal
nothing. Scrolling the field itself, below, still works the same for every
side.

## Safari's own pan

iOS Safari's own response to a focus inside a scrollable area is to scroll
the _whole page_ so the focused field sits centered in the visible window --
which, since `Drawer.Popup` is `position: fixed`, can push its own top edge
above that window for as long as the pan lasts. The engine does not try to
stop or undo this: while typing, the drawer's own top edge may move up with
Safari's own pan, the same way React Aria's own `Sheet` already lets happen
on iOS.

`--drawer-keyboard-inset` and the scroll-to-clear step above (see "Keeping
the field clear of the keyboard") still bring the focused field itself back
above the keyboard regardless, no matter where the pan leaves the Panel:
the scroll step reads the real visible window from `Drawer.Popup`'s own
rect plus `visualViewport`'s current `offsetTop`, not `visualViewport`'s
numbers alone: a real iPhone reports a field's own
`getBoundingClientRect()` in visual-viewport coordinates during a held pan,
and the Popup's own rect shifts by the exact same amount, so adding its
`offsetTop` back cancels that shift. Only the Panel's own top edge is left
to the browser. An earlier round of this file tried to
undo the pan by hand instead -- a standalone CSS `translate` on
`Drawer.Panel`, plus a momentary `transform` on the focused field copied
from vaul's own vendored, older React Aria -- but neither was ever checked
against a real Safari pan, only against values a real device's own debug
log recorded, and the maintainer's own ruling after review is to drop both.

Current React Aria (`react-aria` 3.53.1) no longer stops the pan with a
field transform either: its own `usePreventScroll` sets `overflow: hidden`
on the root element, overrides `HTMLElement.prototype.focus` to add
`preventScroll: true`, and does its own `scrollIntoView` once the keyboard
is up. The momentary `transform: translateY(-2000px)`-on-focus trick
survives in two places only: vaul 1.1.2's own vendored copy of an older
React Aria (`vaul/dist/index.js`'s `onFocus` and `onTouchEnd` handlers --
the former for focus that moves without a tap, such as the keyboard's own
next/previous buttons, the latter so a tap on a field applies it before the
browser's own focus event, focusing the field itself first), and Base UI's
`DrawerVirtualKeyboardProvider`
(`drawer/virtual-keyboard-provider/DrawerVirtualKeyboardProvider`,
`@base-ui/react` 1.9.0), whose own `touchend` handler calls
`focusKeyboardInputWithoutPageScroll` to apply the same transform and focus
the field itself, with `preventScroll: true`, before the browser's own
focus ever fires; a separate routine then pads and scroll-pads the field's
own scroll container so it clears the keyboard once focused.

## Two keyboard models

A touch browser handles the keyboard one of two ways, and drawerdeck covers
both:

- **The overlay model.** iOS Safari always, and Android Chrome by default
  (`interactive-widget=resizes-visual`, the default when no `viewport` meta
  tag sets `interactive-widget` at all). The keyboard covers part of the
  page: `visualViewport.height` shrinks, and the browser may also pan the
  page to keep the focused field above the keyboard, moving
  `visualViewport.offsetTop` too, while `window.innerHeight` does not.
  `--drawer-keyboard-inset` tracks both.
- **`interactive-widget=resizes-content`.** `window.innerHeight` itself
  shrinks, `visualViewport` tracks it exactly, and the gap between them
  stays 0 -- `--drawer-keyboard-inset` never leaves neutral. The drawer's
  layout is built on `100dvh`, so this is a plain layout-viewport resize,
  handled the same way an orientation change already is.

A WKWebView wrapper around a site (a non-Safari iOS browser, in practice)
can also shrink the layout viewport itself, the way
`interactive-widget=resizes-content` does, but animated over many `window`
'resize' events rather than settling at once -- `--drawer-keyboard-inset`
also re-reads on every `window` 'resize' while open, not only
`visualViewport`'s own, so it converges at each step of that animation
instead of freezing at whatever it read when the animation started.

Either way, the drawer keeps its snap index (unless it expands to the
largest one, above) and never closes.

A resize or a pan while the drawer is already on its way out (Escape, an
outside press, `Drawer.Close` or `close()`) changes nothing about the exit:
the Viewport does not move for a keyboard at any point, open or closing, so
there is nothing left for a keyboard change mid-exit to desync from a CSS
transition that is still running on elapsed time regardless.

## Every side

The Viewport never moves for a keyboard whichever edge the drawer opens
from, and `--drawer-keyboard-inset` reads the same `visualViewport` numbers
regardless of `side`. Expanding to the largest snap point (above) does not:
the keyboard is a vertical concern, so only `bottom` and `top` drawers ever
expand for it. A `left` or `right` drawer skips that step and scrolls the
field in directly -- Content's own scroll is vertical regardless of `side`,
so this still brings the field back the same way.

## What this does not cover

iOS Safari supports neither the `interactive-widget` viewport meta tag nor
the VirtualKeyboard API: `visualViewport` is the only signal it gives a page
about the keyboard, which is what this feature reads. Android's two models
above, and the WKWebView variant of the second, are the only ones this guide
documents; a phone running an older WebView, or a browser this was never
checked against, falls back to whatever that browser already does with an
overflowing page, the same as before this feature existed.

This has been checked in Chromium and WebKit through a stand-in for
`visualViewport`, replaying sequences logged from a real iPhone in both
Safari and a WKWebView browser: see the "Compare" page for how drawerdeck's
keyboard handling reads next to vaul, Base UI's Drawer and React Aria's
Sheet.
