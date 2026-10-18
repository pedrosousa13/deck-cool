---
"@carouseldeck/react": minor
"@carouseldeck/react-18": minor
---

The curve effect now orders its slides as it draws them: a zero-specificity `z-index` rule puts the focal slide on top, lower the further a slide is from it, the same on both sides. Your own `z-index` still overrides it.

A new switch, `--deck-curve-fade-view: 1`, fades a slide by how much of it is in the viewport instead of its distance from the focal slide: fully opaque while at least half of it is in view, fading to 0 as the rest of it leaves. It needs `--deck-viewport-step` and `--deck-viewport-span`; before the deck has measured them, the radius-based fade stands.
