---
"@carouseldeck/core": patch
---

A burst of rapid arrow-key presses could leave the published index one slide behind where the deck actually rests: a key scroll that ends exactly on a snap point, as one clamped at the scroll range's edge often does, can leave the browser sending no `scrollend` or `scrollsnapchange` event for it, and the engine waited on one that never came. Quiet now settles a scroll already resting on a snap point instead of waiting on a native end event forever.
