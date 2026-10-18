---
title: Progress and data attributes
description: 'The continuous state carouseldeck writes to the DOM for CSS to read as the deck scrolls: --deck-slide-progress, data-focal, data-in-view and the other attributes.'
---

Carouseldeck writes continuous state to the DOM, not to React state, so CSS can
read it while the deck scrolls:

| Where                 | Attribute or property           | Meaning                                                                                                                                                                       |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each slide            | `--deck-slide-progress`         | Signed distance from the focal position, in slides: 0 there, -1 one slide before, 2.25 two and a quarter after. Every frame.                                                  |
| Each slide            | `--deck-slide-index`            | The slide's index. Static, so server HTML has it.                                                                                                                             |
| Each slide            | `--deck-slide-count`            | The number of slides, shells and copies not counted. Static, so server HTML has it.                                                                                           |
| Each slide            | `data-in-view`                  | Any part of the slide is in the viewport. Hides nothing.                                                                                                                      |
| Each slide            | `data-focal`                    | The focal slide.                                                                                                                                                              |
| Each slide            | `data-current`                  | The current slide.                                                                                                                                                            |
| `Deck.Root`           | `data-index`                    | The current index, as of the last settle; before the first measurement, the `defaultIndex` (or `index`) as given.                                                             |
| `Deck.Viewport`       | `data-orientation`              | `horizontal` or `vertical`.                                                                                                                                                   |
| `Deck.Viewport`       | `--deck-viewport-step`          | The distance from one real slide to the next along the axis (its size plus the gap), a plain number with no unit. Measure time only: mount, resize, a slide added or removed. |
| `Deck.Viewport`       | `--deck-viewport-span`          | The viewport's size along the axis, in steps, a plain number with no unit. The same measure time as `--deck-viewport-step`.                                                   |
| `Deck.Viewport`       | `data-carouseldeck-effect`      | The effect's name, `fade`, `curve` or `stack`, when it has one.                                                                                                               |
| `Deck.Prev`/`Next`    | `data-disabled`                 | Disabled, at an end or by your `disabled` prop.                                                                                                                               |
| `Deck.Dots`           | `data-index`, `data-count`      | The current page and the page count; each dot has `data-index`.                                                                                                               |
| `Deck.Counter`        | `data-index`, `data-count`      | The same.                                                                                                                                                                     |
| `Deck.AutoplayToggle` | `data-playing`                  | Autoplay is on.                                                                                                                                                               |
| A small deck's copies | `data-carouseldeck-copy`        | `before` or `after` the slides, in a deck too small for shells. Inert and `aria-hidden`.                                                                                      |
| Loop's shells         | `data-carouseldeck-shell`       | The set, `-2` to `2`, `0` the slides' own, a shell stands in for. Inert and `aria-hidden`, with no children; the engine moves the real slide onto one by `translate`.         |
| Snap targets          | `data-carouseldeck-snap-target` | The empty elements fade and stack lay out to snap to. Not slides.                                                                                                             |

Every primitive also carries a marker attribute to select it by, whatever
your class names: `data-carouseldeck-viewport`, `data-carouseldeck-slide` (copies
included), `data-carouseldeck-shell`, `data-carouseldeck-prev`, `data-carouseldeck-next`,
`data-carouseldeck-dots`, `data-carouseldeck-counter` and
`data-carouseldeck-autoplay-toggle`. The live region is `data-carouseldeck-live`.

Each slide's `--deck-slide-progress` is in the server HTML too, counted from
the slide the deck starts at, so CSS on it paints before any script runs (see
[server rendering](./server-rendering.md)).

`--deck-viewport-step` and `--deck-viewport-span` are plain numbers, with no
unit, so your CSS can turn pixels into slides, or slides into pixels, with a
`calc()`: CSS cannot divide one length by another outside Chrome 140+, but
it can divide two numbers. They are measured, so they are not in the server
HTML: use `var(--deck-viewport-step, <fallback>)` for whatever your layout
gives a slide before the deck mounts, such as
`var(--deck-viewport-step, 176)` for 160px slides with a 16px gap. A
vertical deck's are its height and gap, along the block axis. A loop's
shells and copies carry the real slides; neither changes the values,
wherever the slides are currently placed. With fewer than two real slides
there is no "next" one to measure a step from, so neither property is set.
Fade and stack lay out one snap target per slide, each exactly the
viewport's own size: under them, `--deck-viewport-step` is the viewport's
size and `--deck-viewport-span` always reads about 1, true to what they
measure, not a count of visible slides.

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
