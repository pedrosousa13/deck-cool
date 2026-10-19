---
"@carouseldeck/core": minor
"@carouseldeck/react": patch
"@carouseldeck/react-18": patch
---

A short looping deck whose viewport has inline padding, such as under the viewport bleed recipe, now settles instead of throwing "Maximum update depth exceeded". A deck that turns `loop` off now measures like one that never looped, rather than keeping whatever it last happened to render. `createDeck` takes a `loop` option, and the engine a `setLoop()` method, for whether the deck loops.
