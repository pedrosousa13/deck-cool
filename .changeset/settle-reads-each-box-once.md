---
"@carouseldeck/core": patch
"@carouseldeck/react": patch
"@carouseldeck/react-18": patch
---

A settle now reads each box's rect and computed style at most once, instead of several times over in `measureSnapPoints`, `writeGeometry`, `writeProgress`, `focalSlide` and `resnap`. A loop's own jump off a copy still forgets a cached rect right after, since the scroll moves every box on screen; shells mode's own re-measure still reads fresh after its own write, for the same reason. No behaviour change: a deck settles at the same place, reporting the same state.
