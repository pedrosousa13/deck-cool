---
"@carouseldeck/react": minor
"@carouseldeck/react-18": minor
---

`useDeck()` reports two more slide indexes, next to `index` and `count`: `slide`, the current slide, and `focal`, the focal slide, each a slide even where `index` and `count` count pages. Both are `null` until the viewport is measured, as `count` already is, and both are `-1` where no slide snaps, matching what `onFocalChange` reports for `focal`. A new `slideCount` reports the number of slides, as opposed to `count`'s snap points, with a loop's shells and its copies both left out; it too can be `null`, where it is not known yet.
