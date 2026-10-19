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
  --bleed-inset: max(0px, calc((100cqi - 400px) / 2));
  margin-inline: calc(-1 * var(--bleed-inset));
  padding-inline: var(--bleed-inset);
  scroll-padding-inline: var(--bleed-inset);
}
```

`.page` and `.column` sit outside `Deck.Root`, not on it: the bleed needs a
container query ancestor wider than the column itself. `container-type:
inline-size` costs `.page` its own size-from-content, so put it on an
ancestor already sized some other way, such as the page itself, not one you
still want sized by its content.

`max(0px, …)` clamps the inset so that a page narrower than the column
cannot turn the margin positive and shrink the viewport, where the padding
alone would already clamp to 0.

## One property, not three

Writing `calc((100cqi - 100%) / 2)` directly on each of the three
properties breaks it: `padding-inline`'s `%` resolves against the
viewport's containing block, the column, but `scroll-padding-inline`'s
resolves against the viewport's own scrollport, the bled width. The two
percentages stop agreeing, and the browser rests the deck scrolled into the
padding on mount, so the first slide shows flush with the page, not the
column.

## The column's width, twice

CSS has no way to ask an ancestor its own width, so a fluid column needs
its whole width expression repeated inside `--bleed-inset`:

```css
.column {
  width: min(90cqi, 960px);
  margin-inline: auto;
}
.column [data-carouseldeck-viewport] {
  --bleed-inset: max(0px, calc((100cqi - min(90cqi, 960px)) / 2));
  margin-inline: calc(-1 * var(--bleed-inset));
  padding-inline: var(--bleed-inset);
  scroll-padding-inline: var(--bleed-inset);
}
```

Nothing keeps the two declarations in sync. A breakpoint or a redesign that
changes the column's width has to change `--bleed-inset` in the same edit.

## What works under it

Checked in Chromium, Firefox and WebKit:

- A plain deck. Snapping (Next, Dots, an arrow key, a drag) and the index
  stay at the column, because `scroll-padding-inline` excludes the padding
  the bleed adds back.
- `fade` and `stack`. Their sticky slides stick at the viewport's own
  content edge (the padding box's inner edge), which the bleed recipe has
  already put at the column. They need no change.
- `curve`. It sets no geometry of its own but `contain: layout`, so the
  padding reaches it exactly as it reaches a plain deck, with no extra
  scrollable overflow.
- `loop`, where the run is long enough to stay in shells (ADR-0013). A real
  slide's shell is measured from the real slides' own boxes, which already
  sit in the column.
- `loop`, where the run is short enough to fall back to copies. The
  shells-or-copies check, and whether there is room to loop at all, read
  the same way under the bleed as without it (#196), so a short, looping
  deck settles under this recipe too.

[Known limits](../guides/known-limits.md) has the rule for which mode a
loop is in: a run shorter than the viewport plus its widest slide, within
half a pixel, falls back to copies, and only there does a slide carry
`data-carouseldeck-copy`, per
[Progress and data attributes](../guides/progress.md). The bleed widens
the viewport, so a loop that stays in shells without it can cross that
boundary into copies once the bleed is added, with nothing about the loop
itself having changed.

The bleed is CSS alone, so server HTML already has it: nothing measures
anything, so there is no layout shift once the deck hydrates.

The story is `Recipes / Viewport Bleed`. An end-to-end test checks that a
slide past the column is visible beyond it; the `Bleed` stories' own tests,
on the same CSS, already check that Next, Dots, an arrow key and a drag
snap to the column.
