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

If the focused field would not be visible above the keyboard at the current
snap point, the drawer expands to its largest one -- the same thing a
native iOS sheet does, so the content unlocks -- and the engine then
scrolls the field clear of the keyboard itself, with
`field.scrollIntoView({ block: 'nearest' })`. It stays there once the
keyboard closes; a field already visible never moves the drawer at all.

<!-- demo:example-keyboard -->

Open it on a phone and focus either field: a short summary, or a longer
message.

This is on by default, with no prop to turn it on. It costs two passive
`visualViewport` listeners, one `window` listener and one `focusin`
listener, all only while the drawer is open.

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
own; it is there so `scrollIntoView` keeps a field clear of the keyboard
without your own layout doing anything.

Always keep the `0px` fallback: the variable is only present while the
drawer is open, so a bare `var(--drawer-keyboard-inset)` is invalid before
the first keyboard open and after the drawer closes.

## Keeping the field clear of the keyboard

`Drawer.Content`'s own `clientHeight` never shrinks for a keyboard -- the
Viewport above it never does either -- so a field sitting at Content's own
natural end has nothing below it for a plain `scroll-padding-bottom` alone
to scroll into: the browser clamps at Content's own maximum scroll position,
short of the padded target, landing the field flush with Content's own
unpadded bottom, exactly where the keyboard still covers it. The engine
gives `Drawer.Content` a real `padding-bottom` too, equal to
`--drawer-keyboard-inset`: genuine scrollable room past the last field,
which `scrollIntoView` can actually reach. `scroll-padding-bottom`, kept
alongside it, is what then stops `scrollIntoView`'s own `'nearest'` right at
that padding's edge for a field that already has real content below it,
rather than scrolling past the natural stopping point into the empty
padding for no reason.

## Expanding to the largest snap point

A field the current snap point does not reveal above the keyboard moves the
drawer to its largest snap point first, the same thing a native iOS sheet
does: the content unlocks there (see "Why native scrolling" for why the top
snap point is what unlocks it), giving the engine room to scroll the field
itself. A drawer already at its largest snap point, with nothing left to
expand to, skips straight to scrolling the field in. Neither one moves a
field that is already visible, and neither one reverts once the keyboard
closes -- the drawer stays at whatever snap point it expanded to.

## Stopping Safari's own pan

iOS Safari's own response to a focus inside a scrollable area is to scroll
the _whole page_ so the focused field sits centered in the visible window --
which, since `Drawer.Popup` is `position: fixed`, can push its own top edge
above that window for as long as the pan lasts. React Aria's
`usePreventScroll` (whose own source credits the file vaul vendors a copy
of, `vaul/dist/index.js`'s `onFocus` handler) stops this at the source: a
momentary `transform: translateY(-2000px)` on the focused field itself,
convincing Safari the field is already off the top of the page, so it has
nothing left to pan the page to reveal. The engine does the same, on
`focusin`, for the smallest piece of that trick this needs -- one
transform, one frame, on the field alone, never the touch-event
interception or the body-margin trick the rest of `usePreventScroll` also
carries, both there to stop a user's own touch scroll from moving the page,
a problem this engine does not have.

The trick's own race (React Aria's own issue #10485, on its
`react-spectrum` repository): the field
sits transformed for a whole animation frame, and a real `visualViewport`
event can land inside that same frame. The engine closes this itself,
restoring the field to its real position synchronously the moment anything
here needs to read it, rather than waiting for the trick's own scheduled
frame.

Where a pan still happens anyway -- Safari starting one from somewhere this
trick does not reach, such as the keyboard's own next/previous field
buttons -- the Viewport never having moved in the first place (above) is
what keeps its own top edge from _staying_ off screen, not a second,
reactive undo on top of this. A pan Safari starts anyway still settles back
to `offsetTop: 0` on its own, the same way a real iPhone's own log of this
showed it doing.

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

Nothing here depends on which edge the drawer opens from: the Viewport
never moves for a keyboard whichever one it is, and `--drawer-keyboard-inset`
reads the same `visualViewport` numbers regardless of `side`.

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
