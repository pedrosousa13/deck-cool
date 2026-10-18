---
"@carouseldeck/core": minor
"@carouseldeck/react": minor
"@carouseldeck/react-18": minor
---

`Deck.Viewport` writes two measured custom properties, as plain numbers with no unit: `--deck-viewport-step`, the distance from one slide to the next along the axis (its size plus the gap; a loop's shells and copies are left out), and `--deck-viewport-span`, the viewport's own size along the axis, in multiples of `--deck-viewport-step`. CSS can then divide pixels by either without dividing one length by another. Written at mount, on resize, and when a slide is added or removed; never before the first measurement, or with fewer than two slides, so use `var(--deck-viewport-step, <fallback>)` for either. A vertical deck reports its vertical step; a loop's shells and copies never change the values.
