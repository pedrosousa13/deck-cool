---
"@drawerdeck/core": patch
---

A non-modal drawer no longer closes on Escape when a page widget (a combobox, a menu, a date picker) already called `preventDefault()` on the same keydown to handle it itself. A modal drawer already had this for free, from the browser's own close-watcher honoring a prevented keydown before it fires `cancel`.
