---
title: Loop
description: 'The loop prop runs a carouseldeck deck past its last slide to the first with no visible jump, using inert copies of the slides on either side.'
---

`loop` makes the deck run on past the last snap point to the first, and back,
with no visible jump. Prev and Next are then never disabled, and a drag, flick
or wheel crosses the seam. Each slide mounts once (ADR-0013): `Deck.Viewport`
renders empty, `inert`, `aria-hidden` shells on each side of the slides, and
moves the one real slide onto whichever shell sits nearest the viewport, by
`translate`. Once the deck rests on a shell, it jumps to the identical slide.
Indexes, Dots, Counter, `data-current` and `data-focal` count the slides
only, never the shells. `scrollTo`, Dots and a new controlled `index` go the
direct way, within the slides. A deck whose slides all fit does not loop; one
too short for a shell to have room beside its own slide falls back to
rendering copies instead, and content that must not run twice, such as a
video player, can render differently in one with `Deck.useSlide()`. See
[Known limits](./known-limits.md).

<!-- demo:example-loop -->
