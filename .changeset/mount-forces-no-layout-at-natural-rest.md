---
"@carouseldeck/core": patch
"@carouseldeck/react": patch
"@carouseldeck/react-18": patch
---

A deck that mounts at its natural rest -- index 0 or lower, no loop, no shells or copies -- no longer forces a style and layout pass before the first paint: it measures itself after the browser's own layout instead. A deck whose snap points are not one per slide corrects its controls one frame later than before, on a client render the same as it already does after hydration; a deck with a non-zero index, a loop or shells is unaffected.
