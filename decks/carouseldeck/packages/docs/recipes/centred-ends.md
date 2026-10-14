---
title: Centre the first and last slide
description: 'Let the first and last slides of a centred carouseldeck deck reach the middle of the viewport by padding each end by half its width less half a slide.'
---

With `scroll-snap-align: center`, the first slide cannot reach the centre of
the viewport, because the viewport cannot scroll before the slide's start. The
deck rests with the first slide at the start edge, and the slide nearest the
centre is focal. The last slide is the same at the end. Without `loop`, pad the viewport
at each end by half its width less half a slide, so the scroll range runs far
enough:

<!-- demo:example-centred-ends -->

[example: centred-ends.css]: https://github.com/pedrosousa13/deck-cool/blob/main/decks/carouseldeck/apps/storybook/stories/recipes/centred-ends.css

```css
/* Slides 280px wide, 16px apart, each centred, the first and last too. */
.products {
  --slide-width: 280px;
}
.products [data-carouseldeck-viewport] {
  gap: 16px;
  /* Half the viewport less half a slide, at each end. */
  padding-inline: calc(50% - var(--slide-width) / 2);
}
.products [data-carouseldeck-slide] {
  width: var(--slide-width);
  scroll-snap-align: center;
}
```

Give the slides a width that is not a percentage, such as `px`, `rem` or `vw`.
The padding's percentage is of the deck's width, and a slide's is of the
viewport's content box, which the padding narrows. With `loop`, the shells
either side already let the first and last slides reach the centre.

The story is `Recipes / Centred Ends`. An end-to-end test checks that the deck
rests with the first slide centred, and the last after a move to it.
