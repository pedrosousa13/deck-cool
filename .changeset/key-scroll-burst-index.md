---
"@carouseldeck/core": patch
---

A fast run of arrow-key presses that ends clamped at the scroll range's edge, or a single key scroll running over several slides such as End or Page Down, could leave the deck reporting a slide other than the one it actually rests on. The deck now waits for a key scroll to come to a full stop before reading its rest, and settles it there even where the browser sends no `scrollend` or `scrollsnapchange` event of its own.
