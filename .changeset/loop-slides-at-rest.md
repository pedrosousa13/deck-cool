---
"@carouseldeck/core": patch
---

A looping deck no longer strands the counter on the wrong slide when a slide is added or removed while the deck looks at rest. The deck's own jump off a loop's copy, onto the identical slide among the real ones, can still have a scroll end pending with the browser when the layout changes right after: the engine now goes back to the current index once that scroll ends too, as it would have at once had the scroll not still been going, instead of reading the index from wherever that uncompensated scroll left the viewport.
