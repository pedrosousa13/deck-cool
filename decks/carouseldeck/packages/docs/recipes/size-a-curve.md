---
title: Size a curve
description: 'Turn a curve radius in pixels into slides for --deck-curve-radius, and work out how much room the arc needs inside the viewport so it is not clipped.'
---

`--deck-curve-radius` is in slides, not pixels, where a slide is the step from
one slide to the next, its width plus the gap: `--deck-viewport-step`, the
same step [progress and data attributes](../guides/progress.md) reads,
measured for you. Write the radius in pixels and let `calc()` divide it by
the step: `--deck-curve-radius: calc(528 / var(--deck-viewport-step, 176))`
turns 528px into `528 / 176`, 3 slides, under slides 160px wide and 16px
apart. Before the deck has measured, `--deck-viewport-step` is unset, so the
fallback stands in, 176: the same 160px and 16px gap the CSS below gives the
slides, so the first paint and the first measured one agree, with no jump.
The arc is a true circle of that radius only along the axis, where each slide
turns as it would on one. Across the axis, its sag scales by the content's
width, not the step, so with a gap the arc sags less than the circle, by
`width / (width + gap)`, here `160 / 176`.

The arc extends past the slides, and the viewport clips it across the axis, so
leave it room inside the viewport, as padding. With a radius of `r` slides,
the content of a slide `k` slides from the focal one, `w` wide and `h` tall,
drops `w × (r − √(r² − k²))` and, turned by `asin(k / r)`, reaches
`(w × k / r + h × √(r² − k²) / r − h) / 2` further. Both grow with `k` until
the slide fades out, `r` slides away, so the room at the block end is what a
slide about to fade out needs while the deck moves: `r × w + (w − h) / 2`.
The CSS below already holds `r` in `--deck-curve-radius` and the slide's own
`w` and `h` in `--w` and `--h`, so `calc()` takes the room straight from
them, 460px here, rather than a number worked out by hand and left to drift
from the slide's own size. Near the focal slide, moving content also lifts
above its place, by at most `w / (8 × r)` at the block start, `calc()`'s own
160 / 24 rather than a number rounded to 7px by hand. A vertical deck's arc
bends toward the inline end, so leave the room there, with `w` and `h`
swapped. What stays hand-written: the radius in pixels, 528, the fallback
step, 176, and the slide's own size, `--w`, `--h` and the gap -- the design's
own numbers, not derived from anything else.

That room is large. At rest, the slides not faded out are those fewer than `r`
slides away, so if the faint ends of the arc may clip while the deck moves,
the room for the furthest of them is enough: for `k = 2` here, 122px of drop
and 28px of turn, 150px.

<!-- demo:example-curve-size -->

[example: curve-size.css]: https://github.com/pedrosousa13/deck-cool/blob/main/decks/carouseldeck/apps/storybook/stories/recipes/curve-size.css

```css
/* An arc of radius 528px, --deck-viewport-step the slide-to-slide step the
   deck measures: 160px slides 16px apart, a step of 176, the fallback's own
   number too, for the same arc before the deck has measured. */
.showcase [data-carouseldeck-viewport] {
  --w: 160px;
  --h: 200px;
  --deck-curve-radius: calc(528 / var(--deck-viewport-step, 176));
  gap: 16px;
  /* The first and last slides centred too. */
  padding-inline: calc(50% - var(--w) / 2);
  /* Room for the arc while the deck moves. Above, the lift: w / (8 × r).
     Below, a slide about to fade out: r × w + (w − h) / 2. */
  padding-block: calc(var(--w) / (8 * var(--deck-curve-radius)))
    calc(var(--deck-curve-radius) * var(--w) + (var(--w) - var(--h)) / 2);
}
.showcase [data-carouseldeck-slide] {
  width: var(--w);
  scroll-snap-align: center;
}
.showcase .card {
  height: var(--h);
}
```

Each slide holds one `.card` that fills it, as the curve draws on a slide's
content. The story is `Recipes / Curve Size`. An end-to-end test checks that
no slide that is not faded out reaches past the viewport, at rest and in every
frame of a move. A browser test checks the same CSS at a second slide width,
that the radius still resolves to 528px, the step it then divides being a
different number.
