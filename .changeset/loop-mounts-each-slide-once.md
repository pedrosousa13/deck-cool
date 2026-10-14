---
"@carouseldeck/core": minor
"@carouseldeck/react": minor
"@carouseldeck/react-18": minor
---

A looping deck mounts each slide once instead of rendering it again in copies before and after: the engine moves the one slide, by `translate`, onto whichever of its five sets of empty, inert shells sits nearest the viewport, so a slide's state, refs, effects, ids and media stay the same across the seam and the jump. A deck too short for a shell to have room beside its own slide still falls back to rendering copies as before, and `Deck.useSlide()` reports them there; a stacked deck (fade, stack) never falls back, since its shells are never translated and so need no extra room.

A consumer may notice: a looping slide's computed `scroll-snap-align` now reads `none`, since its shell carries the snap point instead; `translate` on a looping slide belongs to the deck, so a consumer's own `translate` there is overwritten; a translated slide's `position: fixed` descendants are now contained by it; `Deck.useSlide().copy` is `undefined` everywhere except a small deck's fallback copies; and core exports two new markers, `SHELL` and `SPACER`, next to `COPY` and `SNAP_TARGET`, plus a new `DeckState.copies` field reporting which way a looping deck is rendering.
