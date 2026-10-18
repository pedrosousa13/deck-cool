---
"@carouseldeck/core": minor
"@carouseldeck/react": minor
"@carouseldeck/react-18": minor
---

`Deck.Viewport` writes two measured custom properties, as plain numbers with no unit: `--deck-step`, the distance from one real slide to the next along the axis (its size plus the gap), and `--deck-view`, the viewport's own size along the axis, in multiples of `--deck-step`. CSS can then divide pixels by either without dividing one length by another. Written at mount, on resize, and when a slide is added or removed; never before the first measurement, or with fewer than two real slides, so use `var(--deck-step, <fallback>)` for either. A vertical deck reports its vertical step; loop's shells and copies never change the values.
