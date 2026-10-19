---
"@carouseldeck/core": patch
---

A looping deck short enough to fall back to copies now settles reliably at the boundary where its run is about as wide as its viewport: whether there is room to loop at all, and whether to render shells or copies, read the same way whichever the deck currently renders, with or without a bled viewport's inline padding. Before, the two could disagree forever there, which threw "Maximum update depth exceeded".
