---
title: Primitives
description: "Reference for carouseldeck's primitives, Deck.Root, Viewport, Slide, Prev, Next, Dots, Counter and AutoplayToggle: the element each renders and its props."
---

Each primitive passes its other props, `ref`, `className` and `style`
included, to the element in the table. Some render more inside it:
`Deck.Root` a visually hidden live region, `Deck.Viewport` a `<style>` with
the slides' default geometry and, with an effect such as fade, an empty snap
target per slide, and `Deck.Dots` its buttons.

| Primitive             | Renders    | What it does                                                                                                                                                                    |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Deck.Root`           | `<div>`    | The deck: a region with `aria-roledescription="carousel"`, the deck's state and a polite live region. Holds the props below.                                                    |
| `Deck.Viewport`       | `<div>`    | The native scroll container. Its children are the slides. Focusable, so the arrow keys scroll it. Takes `effect`.                                                               |
| `Deck.Slide`          | `<div>`    | One slide, a group labelled "n of m". Its size and alignment are your CSS.                                                                                                      |
| `Deck.Prev`           | `<button>` | Moves one snap point back. Disabled at the first unless the deck loops. Its text is "Previous" unless you pass children.                                                        |
| `Deck.Next`           | `<button>` | Moves one snap point on. Disabled at the last unless the deck loops. Its text is "Next" unless you pass children.                                                               |
| `Deck.Dots`           | `<div>`    | A group labelled "Choose page" with one button per page, "Go to page n"; the current one has `aria-current="true"`. Style the buttons with `[data-carouseldeck-dots] > button`. |
| `Deck.Counter`        | `<span>`   | The current page and the total, as "3 / 10".                                                                                                                                    |
| `Deck.AutoplayToggle` | `<button>` | Stops and starts autoplay: "Stop slide rotation" or "Start slide rotation". Renders only on a deck with `autoplay`.                                                             |

Prev, Next, Dots, Counter and AutoplayToggle render nothing when every slide
fits in the viewport, as there is nowhere to go. A consumer's `onClick` on
Prev, Next or AutoplayToggle runs first and can cancel the move with
`event.preventDefault()`.

<!-- demo:example-primitives -->

## `Deck.Root` props

`Deck.Root` props, besides those of a `<div>`:

| Prop            | Type                         | Default        | What it does                                                                                       |
| --------------- | ---------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `defaultIndex`  | `number`                     | `0`            | The snap point to start at. Read once, on mount.                                                   |
| `index`         | `number`                     |                | The snap point to rest at, controlled. Not with `defaultIndex`.                                    |
| `onIndexChange` | `(index: number) => void`    |                | Called once each time the deck settles on a new snap point.                                        |
| `handleRef`     | `Ref<RootHandle>`            |                | Receives `scrollTo(index)`, `next()` and `prev()`; each stops autoplay, as `useDeck()`'s moves do. |
| `onFocalChange` | `(slide: number) => void`    |                | Called once each time the focal slide changes, with its index, or -1 when no slide snaps.          |
| `clickToFocus`  | `boolean`                    | `false`        | Clicking a slide brings it to the focal position.                                                  |
| `loop`          | `boolean`                    | `false`        | Past the last snap point is the first, and back.                                                   |
| `drag`          | `boolean`                    | `true`         | A mouse can drag the deck.                                                                         |
| `autoplay`      | `number`                     |                | Moves one snap point on every this many milliseconds. Off when unset.                              |
| `orientation`   | `'horizontal' \| 'vertical'` | `'horizontal'` | The axis the deck scrolls along.                                                                   |

The package also exports the types `RootProps`, `RootHandle`,
`ViewportProps`, `UseDeckResult` (what `useDeck` returns), `UseSlideResult`
(what `useSlide` returns), `Effect` and `Orientation`.
