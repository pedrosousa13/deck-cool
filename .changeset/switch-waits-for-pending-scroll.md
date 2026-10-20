---
"@carouseldeck/core": patch
"@carouseldeck/react": patch
"@carouseldeck/react-18": patch
---

A new layout landing right after a wheel, key or pointer scroll, before that scroll reaches the viewport, no longer settles the deck early and misses the scroll's own end: a refresh that only measures the layout now waits for such a scroll the same way it already waits for one already going.
