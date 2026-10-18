---
title: 'Effects: fade and curve'
label: Effects
description: "carouseldeck's effects: fade crossfades slides in one place, curve fans them along an arc, and stack orders them as a stack of cards. Each is its own import, so a deck without one ships none of it."
---

An effect is a value you pass to `Deck.Viewport`'s `effect`, imported from
its own entry point. A deck that imports none ships none of their code. The
viewport keeps scrolling, snapping and dragging natively under each.

<!-- demo:example-fade -->

<!-- demo:example-curve -->

```tsx
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';

export function Effects() {
  return (
    <>
      <Deck.Root aria-label="Crossfade">
        <Deck.Viewport effect={fade}>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
      <Deck.Root aria-label="Showcase">
        <Deck.Viewport effect={curve}>
          <Deck.Slide>
            <div className="card">One</div>
          </Deck.Slide>
          <Deck.Slide>
            <div className="card">Two</div>
          </Deck.Slide>
        </Deck.Viewport>
      </Deck.Root>
    </>
  );
}
```

## Fade

Fade stacks the slides in one place and crossfades them by progress. Each
slide fills the viewport and snaps at its start, so slide width, alignment and
pages do not apply. A fade shows one slide at a time. Every slide but the
focal one is `inert`. Under reduced motion it cuts from one slide to the next
halfway instead of fading.

## Curve

Curve fans the slides along an arc around the focal slide and fades them
with their distance from it. The slides keep their size, gap, alignment and
pages. Curve draws the arc on each slide's children, so give each slide one
child that fills it, styled as the slide should look. The radius, in slides, is
`--deck-curve-radius` (default 4), set in CSS on the viewport. Each curve slide
has `contain: layout`, so a `position: fixed` element inside it is placed
against the slide. Under reduced motion the content stays flat and only fades.
To turn a radius in pixels into slides and leave the arc room in the
viewport, see [size a curve](../recipes/size-a-curve.md).

Curve also paints the slides by distance from the focal slide: the focal
slide is highest, lower as the distance from it grows, and the same on both
sides. This is a zero-specificity `z-index` rule, like the rest of curve's
CSS, so your own `z-index` overrides it.

Set `--deck-curve-fade-view: 1` on the viewport to fade a slide by how much
of it is in the viewport instead of its distance from the focal slide: fully
opaque while at least half of it is in view, fading to 0 as the rest of it
leaves. It reads `--deck-viewport-span` (its own half-width, in slides) and
`--deck-slide-progress`. A slide is approximated as one step wide
(`--deck-viewport-step`), the gap left out, so the fade is exact only where
the gap is small next to the slide; with a wide gap, a slide reads as still
half in view a little later than it truly is, by up to half the gap's share
of the step. The switch assumes `scroll-snap-align: center`, the curve
recipes' own alignment, where the viewport's two edges sit at
`--deck-viewport-span / 2` slides either side of the focal position; with
`scroll-snap-align: start` or `end` the edges sit elsewhere, and the switch
does not correct for it. Before `--deck-viewport-span` is measured, the
switch has no effect and the radius-based fade stands. A keyword switch
would need style queries, which Firefox lacks, so the switch is a plain
number: 0, unset, keeps today's radius-based fade.

## Stack

Stack stacks the slides in one place, as fade does, and orders them by
progress: the focal slide on top, the slides after it behind it in order, and
a slide leaving drops behind every slide halfway, to come back in at the back.
Every slide but the focal one is `inert`. Stack ships no appearance: no
transform, colour or opacity. The look of the cards and the throw that takes
the top one off are your CSS on `--deck-slide-progress`, as
[a card stack](../recipes/card-stack.md) shows.

The effects' styles are zero-specificity rules on `--deck-slide-progress`, so
your CSS overrides any of them. Server HTML already carries each slide's
starting progress, so an effect draws from the first paint, before any script
runs (see [server rendering](./server-rendering.md)). To use an
effect on some screens only, see
[change `effect`, `loop` or `autoplay` per breakpoint](../recipes/per-breakpoint.md).
