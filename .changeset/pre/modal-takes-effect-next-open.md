---
"@drawerdeck/core": patch
"@drawerdeck/react": patch
---

`modal` now takes effect on the next open only. Changing it on an already-open drawer no longer leaves the dialog's native mode and its hit-area styles disagreeing with each other: it keeps the mode (and the top layer, the focus trap, the inert page and the hit-area styles that come with it) it opened in until it closes and opens again, when the new value takes over.
