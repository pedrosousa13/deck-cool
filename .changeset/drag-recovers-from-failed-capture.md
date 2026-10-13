---
"@carouseldeck/core": patch
---

A mouse drag whose `setPointerCapture` throws, as a busy main thread can make it when it delivers the pointer's move after the pointer itself is gone, no longer sticks in "dragging" with no pointer left to release it: the engine now goes back to idle at once, snapping restored.
