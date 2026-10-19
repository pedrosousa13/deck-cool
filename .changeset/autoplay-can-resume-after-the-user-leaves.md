---
"@carouseldeck/react": minor
"@carouseldeck/react-18": minor
---

`Deck.Root` takes an opt-in `autoplayResume` (milliseconds): autoplay restarts that long after focus leaves the deck, the pointer is off it and the last move settles. A new interaction cancels the wait. It never restarts once `Deck.AutoplayToggle` has stopped autoplay, and never under reduced motion. Without `autoplayResume`, nothing changes.
