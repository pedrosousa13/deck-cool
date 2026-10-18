---
"@carouseldeck/react": minor
"@carouseldeck/react-18": minor
---

`useDeck()` reports two more slides, next to `index` and `count`: `slide`, the current slide, and `focal`, the focal slide, each a slide even where `index` and `count` count pages. Both are `null` until the viewport is measured, as `count` already is, and `focal` is `-1` where no slide snaps, matching `onFocalChange`. A new `slideCount` reports the number of slides, as opposed to `count`'s snap points, with a loop's extra copies left out.
