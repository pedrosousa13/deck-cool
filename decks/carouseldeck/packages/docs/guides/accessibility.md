---
title: Accessibility
description: 'What a carouseldeck carousel does for accessibility with no extra work: a labelled region, slides labelled n of m, native buttons, a live region, reduced motion.'
---

What a deck does with no extra work:

- `Deck.Root` is a region with `aria-roledescription="carousel"`, named by
  your `aria-label`.
- Each slide is a group with `aria-roledescription="slide"`, labelled "n of
  m".
- Prev, Next, the dots and the toggle are native buttons with names. Dots are
  a labelled group of buttons with `aria-current`, not tabs, since a dot can
  stand for a page of several slides.
- A polite live region announces "Slide n of m" after a move the user makes.
  It is off while autoplay rotates the deck.
- No slide is hidden or `inert` for being off-screen. Tabbing into an
  off-screen slide scrolls it into view natively, and snap settles it. During
  a move, the deck goes to the snap point of that slide's page instead.
- The viewport is focusable, so the arrow keys, Page Up, Page Down, Home and
  End scroll it.
- Loop's shells, and a small deck's copies, are `inert` and `aria-hidden`, so
  they are never focused or announced.
- Under reduced motion, a move carouseldeck starts (Prev, Next, a dot,
  `scrollTo`, a new `index`, a drag's release) jumps to its snap point instead
  of scrolling smoothly. Autoplay starts stopped, fade cuts, and curve stays
  flat.

There is one exception. In a fade deck, every slide but the focal one is
`inert`, as it sits under the focal one. Keyboard and screen reader users reach the slides
through Prev, Next, Dots and the arrow keys.
