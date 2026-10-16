# @carouseldeck/react-18

## 1.3.3

### Patch Changes

- 1aec379: `@carouseldeck/react-18` now ships the stack effect at `@carouseldeck/react-18/stack`, as `@carouseldeck/react` does.
- @carouseldeck/core@1.3.3

## 1.3.2

### Patch Changes

- Updated dependencies [7d38437]
  - @carouseldeck/core@1.3.2

## 1.3.1

### Patch Changes

- Updated dependencies [8a7de54]
- Updated dependencies [d3ef7ea]
- Updated dependencies [5b7efab]
  - @carouseldeck/core@1.3.1

## 1.3.0

### Minor Changes

- 749e8d3: A looping deck mounts each slide once instead of rendering it again in copies before and after: the engine moves the one slide, by `translate`, onto whichever of its five sets of empty, inert shells sits nearest the viewport, so a slide's state, refs, effects, ids and media stay the same across the seam and the jump. A deck too short for a shell to have room beside its own slide still falls back to rendering copies as before, and `Deck.useSlide()` reports them there; a stacked deck (fade, stack) never falls back, since its shells are never translated and so need no extra room.

  A consumer may notice: a looping slide's computed `scroll-snap-align` now reads `none`, since its shell carries the snap point instead; `translate` on a looping slide belongs to the deck, so a consumer's own `translate` there is overwritten; a translated slide's `position: fixed` descendants are now contained by it; `Deck.useSlide().copy` is `undefined` everywhere except a small deck's fallback copies; and core exports two new markers, `SHELL` and `SPACER`, next to `COPY` and `SNAP_TARGET`, plus a new `DeckState.copies` field reporting which way a looping deck is rendering.

### Patch Changes

- Updated dependencies [cc8b628]
- Updated dependencies [749e8d3]
- Updated dependencies [83454b5]
  - @carouseldeck/core@1.3.0

## 1.2.0

### Minor Changes

- f83bbcb: slidedeck is now carouseldeck. `@slidedeck/core`, `@slidedeck/react` and `@slidedeck/docs` are now `@carouseldeck/core`, `@carouseldeck/react` and `@carouseldeck/docs`, and the version line goes on from `@slidedeck` 1.1.0. Change your imports from `@slidedeck/*` to `@carouseldeck/*`.

  This release breaks CSS that targets the deck's markup. The data attributes are renamed from `data-slidedeck-*` to `data-carouseldeck-*`, such as `data-carouseldeck-slide` and `data-carouseldeck-viewport`. The `<style>` elements the deck renders now use the hrefs `carouseldeck-slide` and `carouseldeck-<effect>` and the precedence `carouseldeck`. Rename these in your selectors. The `--deck-*` custom properties do not change.

  A breaking change is a major. This release is a minor all the same, once, so the version line goes on from slidedeck's.

  `@carouseldeck/react-18` is new: `@carouseldeck/react` built for React 18, with the same components, props and types. On React 18, install it in place of `@carouseldeck/react`.

### Patch Changes

- Updated dependencies [f83bbcb]
  - @carouseldeck/core@1.2.0
