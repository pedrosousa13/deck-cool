---
"@carouseldeck/core": patch
---

A looping deck no longer strands the counter on the wrong slide when a slide is added or removed while its own jump off a copy still has a scroll end pending with the browser: the deck now goes back to the current index once that scroll ends too, instead of reading it from wherever the jump's uncompensated scroll left the viewport.
