---
title: Progress and data attributes
description: 'The continuous state carouseldeck writes to the DOM for CSS to read as the deck scrolls: --deck-slide-progress, data-focal, data-in-view and the other attributes.'
---

Carouseldeck writes continuous state to the DOM, not to React state, so CSS can
read it while the deck scrolls:

| Where                 | Attribute or property           | Meaning                                                                                                                                                               |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each slide            | `--deck-slide-progress`         | Signed distance from the focal position, in slides: 0 there, -1 one slide before, 2.25 two and a quarter after. Every frame.                                          |
| Each slide            | `--deck-slide-index`            | The slide's index. Static, so server HTML has it.                                                                                                                     |
| Each slide            | `--deck-slide-count`            | The number of slides, shells and copies not counted. Static, so server HTML has it.                                                                                   |
| Each slide            | `data-in-view`                  | Any part of the slide is in the viewport. Hides nothing.                                                                                                              |
| Each slide            | `data-focal`                    | The focal slide.                                                                                                                                                      |
| Each slide            | `data-current`                  | The current slide.                                                                                                                                                    |
| `Deck.Root`           | `data-index`                    | The current index, as of the last settle; before the first measurement, the `defaultIndex` (or `index`) as given.                                                     |
| `Deck.Viewport`       | `data-orientation`              | `horizontal` or `vertical`.                                                                                                                                           |
| `Deck.Prev`/`Next`    | `data-disabled`                 | Disabled, at an end or by your `disabled` prop.                                                                                                                       |
| `Deck.Dots`           | `data-index`, `data-count`      | The current page and the page count; each dot has `data-index`.                                                                                                       |
| `Deck.Counter`        | `data-index`, `data-count`      | The same.                                                                                                                                                             |
| `Deck.AutoplayToggle` | `data-playing`                  | Autoplay is on.                                                                                                                                                       |
| `Deck.Viewport`       | `data-carouseldeck-effect`      | The effect's name, `fade`, `curve` or `stack`, when it has one.                                                                                                       |
| A small deck's copies | `data-carouseldeck-copy`        | `before` or `after` the slides, in a deck too small for shells. Inert and `aria-hidden`.                                                                              |
| Loop's shells         | `data-carouseldeck-shell`       | The set, `-2` to `2`, `0` the slides' own, a shell stands in for. Inert and `aria-hidden`, with no children; the engine moves the real slide onto one by `translate`. |
| Snap targets          | `data-carouseldeck-snap-target` | The empty elements fade and stack lay out to snap to. Not slides.                                                                                                     |

Every primitive also carries a marker attribute to select it by, whatever
your class names: `data-carouseldeck-viewport`, `data-carouseldeck-slide` (copies
included), `data-carouseldeck-shell`, `data-carouseldeck-prev`, `data-carouseldeck-next`,
`data-carouseldeck-dots`, `data-carouseldeck-counter` and
`data-carouseldeck-autoplay-toggle`. The live region is `data-carouseldeck-live`.

Each slide's `--deck-slide-progress` is in the server HTML too, counted from
the slide the deck starts at, so CSS on it paints before any script runs (see
[server rendering](./server-rendering.md)).

Progress is a whole number for every slide when one sits exactly at the focal
position. An effect that moves a slide should scale about its snap alignment
point (`transform-origin`), not away from it, or it moves the point the deck
measures progress from:

<!-- demo:example-progress -->

```css
.products [data-carouseldeck-slide] {
  /* abs() spelled with max() for older browsers. */
  scale: calc(
    1 -
      min(
        max(var(--deck-slide-progress, 0), -1 * var(--deck-slide-progress, 0)),
        1
      ) *
      0.2
  );
  transform-origin: center;
}
```
