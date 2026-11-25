---
"@carouseldeck/core": patch
"@carouseldeck/react": patch
"@carouseldeck/react-18": patch
---

A Settle now reads each slide's size and position once, where it read the same box several times over. Decks on one page share one `ResizeObserver`. When several resize together, every deck reads its layout first and every deck writes after, so one deck's writes no longer force the browser to recalculate style before the next deck reads. A deck that is scrolling, being dragged or pressed, rendering Copies or Shells, or sitting inside another deck still reads as it goes, after the other decks have written. Two decks on one element now each get its resizes. Where a deck rests and what it reports do not change.
