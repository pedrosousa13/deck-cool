# @carouseldeck/react-18

## 1.4.0

### Minor Changes

- 4315f08: `Deck.Root` takes an opt-in `autoplayResume` (milliseconds): autoplay restarts that long after focus leaves the deck, the pointer is off it and the last move settles. A new interaction cancels the wait. It never restarts once `Deck.AutoplayToggle` has stopped autoplay, and never under reduced motion. Without `autoplayResume`, nothing changes.
- c01b3c3: The curve effect now orders its slides as it draws them: a zero-specificity `z-index` rule puts the focal slide on top, lower the further a slide is from it, the same on both sides. Your own `z-index` still overrides it.

  A new switch, `--deck-curve-fade-view: 1`, fades a slide by how much of it is in the viewport instead of its distance from the focal slide: fully opaque while at least half of it is in view, fading to 0 as the rest of it leaves. It needs `--deck-viewport-span`; before the deck has measured it, the radius-based fade stands.

- 630974f: `Deck.Root`'s `handleRef` handle now stops autoplay when its `scrollTo`, `next` or `prev` moves the deck, exactly as `useDeck()`'s moves already do.
- 65be849: `@carouseldeck/react-18` supports React 18 and React 19 from one build: its peer range is now `react` and `react-dom` `>=18 <20`. On React 19, install it in place of `@carouseldeck/react` where a dependency needs to run on either version; `@carouseldeck/react` stays the package for an app on React 19 alone.
- 656e8e9: `useDeck()` reports two more slide indexes, next to `index` and `count`: `slide`, the current slide, and `focal`, the focal slide, each a slide even where `index` and `count` count pages. Both are `null` until the viewport is measured, as `count` already is, and both are `-1` where no slide snaps, matching what `onFocalChange` reports for `focal`. A new `slideCount` reports the number of slides, as opposed to `count`'s snap points, with a loop's shells and its copies both left out; it too can be `null`, where it is not known yet.
- 7b9fb6d: `Deck.Viewport` writes two measured custom properties, as plain numbers with no unit: `--deck-viewport-step`, the distance from one slide to the next along the axis (its size plus the gap; a loop's shells and copies are left out), and `--deck-viewport-span`, the viewport's own size along the axis, in multiples of `--deck-viewport-step`. CSS can then divide pixels by either without dividing one length by another. Written at mount, on resize, and when a slide is added or removed; never before the first measurement, or with fewer than two slides, so use `var(--deck-viewport-step, <fallback>)` for either. A vertical deck reports its vertical step; a loop's shells and copies never change the values.

### Patch Changes

- Updated dependencies [656e8e9]
- Updated dependencies [7b9fb6d]
  - @carouseldeck/core@1.4.0

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
