---
title: Let slides extend past the viewport
label: Viewport bleed
description: "Bleed a deck's viewport past a narrower column to the page edge, in CSS alone, while slides keep snapping to the column."
---

The viewport is the scroll container, so it clips its slides at its own
edges. A common layout keeps the slides lined up with a narrower column
while their neighbours stay visible out to the page edge. Compute the
inset once, from a container query unit and the column's own width, and
read it from the viewport's `margin-inline`, `padding-inline` and
`scroll-padding-inline` alike.

<!-- demo:example-viewport-bleed -->

[example: viewport-bleed.css]: https://github.com/pedrosousa13/deck-cool/blob/main/decks/carouseldeck/apps/storybook/stories/recipes/viewport-bleed.css

```css
/* The page's own cqi and the column's literal width, in one custom
   property: the viewport reads it for the negated margin, the padding and
   the scroll padding alike. */
.page {
  width: 100%;
  container-type: inline-size;
}
.column {
  width: 400px;
  margin-inline: auto;
}
.column [data-carouseldeck-viewport] {
  --inset: calc((100cqi - 400px) / 2);
  margin-inline: calc(-1 * var(--inset));
  padding-inline: var(--inset);
  scroll-padding-inline: var(--inset);
}
```

`.page` and `.column` sit outside `Deck.Root`, not on it: the bleed needs a
container query ancestor wider than the column itself.

## One property, not three

Write the inset into `--inset` once, from `cqi` and the column's own
literal width, and read that one property the same way in all three
declarations. Writing `calc((100cqi - 100%) / 2)` directly on each of the
three properties instead breaks it: `padding-inline`'s `%` resolves against
the viewport's containing block, the column, but `scroll-padding-inline`'s
resolves against the viewport's own scrollport, the bled width. The two
percentages stop agreeing, and the browser rests the deck scrolled into the
padding on mount, so the first slide shows flush with the page, not the
column.

## The column's width, twice

CSS has no way to ask an ancestor its own width, so a fluid column needs
its whole width expression repeated inside `--inset`:

```css
.column {
  width: min(90cqi, 960px);
  margin-inline: auto;
}
.column [data-carouseldeck-viewport] {
  --inset: calc((100cqi - min(90cqi, 960px)) / 2);
  margin-inline: calc(-1 * var(--inset));
  padding-inline: var(--inset);
  scroll-padding-inline: var(--inset);
}
```

Nothing keeps the two declarations in sync. A breakpoint or a redesign that
changes the column's width has to change `--inset` in the same edit.

## What works under it

Checked in Chromium, Firefox and WebKit:

- A plain deck. Snapping (Next, Dots, an arrow key, a drag) and the index
  stay at the column, because `scroll-padding-inline` excludes the padding
  the bleed adds back.
- `fade` and `stack`. Their sticky slides already stick at the viewport's
  own padding box, which the bleed recipe has already put at the column.
  They need no change.
- `curve`. It sets no geometry of its own but `contain: layout`, so the
  padding reaches it exactly as it reaches a plain deck, with no extra
  scrollable overflow.
- `loop`, where the run is long enough to stay in shells (ADR-0013). A real
  slide's shell is measured from the real slides' own boxes, which already
  sit in the column.

A loop short enough to fall back to copies does not settle under the
bleed: its own shells-or-copies check disagrees with itself once the bled
viewport is about as wide as the slides' whole run, and keeps disagreeing,
so React throws "Maximum update depth exceeded". This is unsupported until
#196 is fixed: do not combine a short, looping deck with this recipe until
then.

The bleed is CSS alone, so server HTML already has it: nothing measures
anything, so there is no layout shift once the deck hydrates.

The story is `Recipes / Viewport Bleed`. An end-to-end test checks that a
slide past the column is visible beyond it, and that Next still snaps to
the column's edge.
