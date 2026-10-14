---
title: Known limits
description: 'Known limits of carouseldeck: a small looping deck still renders copies, fade ignores slide geometry, and the first paint estimates progress from each index.'
---

- **A small deck falls back to copies.** A looping run shorter than the
  viewport plus its widest slide, within half a pixel, renders a slide's
  children again in copies before and after it, as every looping deck did
  before #144: their state is their own, and effects, refs and `id`s inside
  them run again. Avoid `id`s in such a deck's slides, or make them unique
  outside the slide. Two full-width slides, exactly at that boundary, still
  get shells. `Deck.useSlide()` reports `'before'`/`'after'` only in a
  small deck's copies; everywhere else `copy` is always `undefined`, since a
  real slide is never a copy of itself.
- **A looping slide's `translate` is the deck's.** The engine moves it onto
  whichever empty shell sits nearest the viewport. A consumer's own
  `translate` on a looping slide is overwritten.
- **A translated slide's `position: fixed` descendants are contained by
  it.** `translate` creates a containing block, so a fixed descendant of a
  looping slide positions against the slide, not the viewport, for as long
  as the slide is moved.
- **A looping slide's computed `scroll-snap-align` reads `none`.** Its shell
  carries the snap point instead.
- **A stacked looping slide wraps at the engine's own precision.** Fade and
  stack wrap a thrown slide's progress into `(b, b+n]`, `b = -0.9985`: a
  slide thrown to within the engine's precision returns at the back, rather
  than carrying on past -1 with nowhere to land.
- **Server HTML assumes one slide in view across the seam.** With start
  alignment and several slides in view, a slide outside the viewport can
  move to a different set once the engine measures at hydration. It isn't
  visible, and `translate` doesn't count as layout shift.
- **A shells deck turns off scroll anchoring.** Its viewport gets
  `overflow-anchor: none`, at zero specificity, because the browser's own
  scroll anchoring doubly corrected a spacer resize in WebKit. A consumer
  can override it, at their own risk.
- **No screen-reader claim about loop until the VoiceOver pass.** Whether a
  shell is ever announced, or a slide announced twice across the seam, is
  still to check.
- **Presses beyond the reachable copies are dropped.** A step goes at most a
  set of copies past either end. When presses come faster than the deck
  moves, the deck passes fewer slides than were pressed, rather than moving
  against a press or jumping mid-motion. At rest, a press always moves it one
  snap point.
- **Fade ignores slide geometry.** Slide width, alignment and pages do not
  apply to a fade deck.
- **Curve draws on the slides' children, not the slide box.** A slide's own
  background and border stay flat.
- **Server HTML can only start at a slide.** With several slides per snap
  point, or pages, the first paint at a `defaultIndex` may correct after
  hydration, and Dots and Counter recount.
- **The first paint estimates progress from the slide's index.** Server HTML
  gives each slide its distance in slides from the starting slide. With
  slides of different sizes, pages that start past the first, or a start the
  scroll range keeps from the focal position, as at the end of a centred deck
  with no padding, an effect or CSS on progress can move slightly at
  hydration, when the engine measures.
- **A controlled index counts pages.** A breakpoint that changes the page
  size points the same index at different slides.
- **A long task can let Chromium undo a wheel.** When a long task holds the
  main thread just after a wheel during a move, Chromium can carry the move
  on to its slide, against the wheel. The deck still rests on a snap point.
- **No automated test covers touch flicks across a loop's seam.** The
  maintainer checks them by hand on a phone and a trackpad.
