---
title: Pages
description: 'Snap a carouseldeck deck a page at a time: make the first slide of each group a snap point, and Next moves a page while Dots and Counter count pages.'
---

To snap in groups, make only the first slide of each group a snap point. Next
then moves a page, and Dots and Counter count pages:

<!-- demo:example-pages -->

```css
/* Three slides in view, three to a page, from 640px. */
@media (min-width: 640px) {
  .products [data-carouseldeck-slide] {
    width: calc(100% / 3);
  }
  .products [data-carouseldeck-slide]:nth-child(3n + 1) {
    scroll-snap-align: start;
  }
  .products [data-carouseldeck-slide]:not(:nth-child(3n + 1)) {
    scroll-snap-align: none;
  }
}
```

Each slide is still labelled "n of m" by slide. The index, `scrollTo` and a
controlled `index` count pages, so when a breakpoint changes the page size,
the same index points at different slides. `Deck.useDeck()`'s `slide` and
`focal` count slides instead, even where `index` counts pages; see
[Hooks](../reference/hooks.md).

## A page size from data

A page size from a prop or CMS data has no number in the stylesheet for
`:nth-child(3n + 1)` to read: CSS cannot build
`:nth-child(var(--n)n + 1)`. Mark each page's first slide from React
instead, with what `Deck.Slide` already takes: its `style`, or a data
attribute for CSS to select.

### One page size

An inline style wins over any stylesheet rule, so it suits one page size
used at every breakpoint:

<!-- demo:example-pages-prop -->

```tsx
import * as Deck from '@carouseldeck/react';

function Products({ names, pageSize }: { names: string[]; pageSize: number }) {
  return (
    <Deck.Viewport>
      {names.map((name, i) => (
        <Deck.Slide
          key={name}
          style={{ scrollSnapAlign: i % pageSize === 0 ? 'start' : 'none' }}
        >
          {name}
        </Deck.Slide>
      ))}
    </Deck.Viewport>
  );
}
```

### A page size per breakpoint

An inline style wins everywhere, so it can't give way at a breakpoint. Mark
each slide with a data attribute per breakpoint instead, and keep the
breakpoints themselves in CSS, as every other breakpoint in carouseldeck is:

<!-- demo:example-pages-breakpoints -->

```tsx
import * as Deck from '@carouseldeck/react';

function Products({ names }: { names: string[] }) {
  return (
    <Deck.Root aria-label="Products" className="products">
      <Deck.Viewport>
        {names.map((name, i) => (
          <Deck.Slide
            key={name}
            data-page-start={i % 2 === 0 ? '' : undefined}
            data-page-start-wide={i % 3 === 0 ? '' : undefined}
          >
            {name}
          </Deck.Slide>
        ))}
      </Deck.Viewport>
    </Deck.Root>
  );
}
```

```css
/* Two slides to a page below 640px, three from it. */
.products [data-carouseldeck-slide] {
  width: 50%;
}
.products [data-carouseldeck-slide][data-page-start] {
  scroll-snap-align: start;
}
.products [data-carouseldeck-slide]:not([data-page-start]) {
  scroll-snap-align: none;
}

@media (min-width: 640px) {
  .products [data-carouseldeck-slide] {
    width: calc(100% / 3);
  }
  .products [data-carouseldeck-slide][data-page-start-wide] {
    scroll-snap-align: start;
  }
  .products [data-carouseldeck-slide]:not([data-page-start-wide]) {
    scroll-snap-align: none;
  }
}
```

Either way, the index, `scrollTo` and Dots and Counter still count pages, as
above.

### Under an effect

Fade and stack both lay every slide over its own snap target
([Effects](./effects.md)) and ignore slide width, alignment and pages.
Both recipes above mark the slide, never its target, so neither reaches
what fade or stack actually snaps on: a browser test shows Next and a drag
still move one slide at a time under either effect, with or without a page
recipe. `Deck.Slide`'s own `style` does win over the effect's there, as
any consumer style does, but it changes nothing a user can see. Curve
keeps the slides in the flow, with the consumer's alignment and pages
untouched, so both recipes hold under it.
