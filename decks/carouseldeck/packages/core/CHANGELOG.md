# @slidedeck/core

## 1.4.0

### Minor Changes

- 656e8e9: `DeckState` reports `slideCount`, the number of slides measured in the viewport, with a loop's shells and copies left out. It follows a slide added or removed after mount, and `onChange` fires when it changes.
- 7b9fb6d: `Deck.Viewport` writes two measured custom properties, as plain numbers with no unit: `--deck-viewport-step`, the distance from one slide to the next along the axis (its size plus the gap; a loop's shells and copies are left out), and `--deck-viewport-span`, the viewport's own size along the axis, in multiples of `--deck-viewport-step`. CSS can then divide pixels by either without dividing one length by another. Written at mount, on resize, and when a slide is added or removed; never before the first measurement, or with fewer than two slides, so use `var(--deck-viewport-step, <fallback>)` for either. A vertical deck reports its vertical step; a loop's shells and copies never change the values.

## 1.3.3

No changes in this release.

## 1.3.2

### Patch Changes

- 7d38437: A fast run of arrow-key presses that ends clamped at the scroll range's edge, or a single key scroll running over several slides such as End or Page Down, could leave the deck reporting a slide other than the one it actually rests on. The deck now waits for a key scroll to come to a full stop before reading its rest, and settles it there even where the browser sends no `scrollend` or `scrollsnapchange` event of its own.

## 1.3.1

### Patch Changes

- 8a7de54: A looping deck's JavaScript placement path no longer leaves a real slide's translate on the wrong axis after `setOrientation`: the deck forgets each slide's own placement on an axis change, instead of reading its old-axis offset back out along the new axis, so a slide whose slot does not change writes no translate at all.
- d3ef7ea: A looping deck's Next and Prev no longer stall once rapid presses outrun the deck's own settle: before, a press could ask to step past the shells the scroll range reaches, where the browser clamps the write and fires no event to jump off at, pinning the deck there for every press after. A press now corrects the position into the middle set first, synchronously, so it always has a full set of room ahead of it.
- 5b7efab: A looping slide now places itself with a scroll-driven animation where the browser supports one (Chromium 115+, Safari 26+), rather than a scroll listener on every scroll event; Firefox, and Safari before 26, still get the scroll listener.

  A consumer may notice: a looping slide now always contains its `position: fixed` descendants and starts a stacking context, for as long as it loops, not only while it is translated to a different slot; and each looping slide carries one placement animation of its own, which `slide.getAnimations()` and `document.getAnimations()` list alongside a consumer's own.

## 1.3.0

### Minor Changes

- 749e8d3: A looping deck mounts each slide once instead of rendering it again in copies before and after: the engine moves the one slide, by `translate`, onto whichever of its five sets of empty, inert shells sits nearest the viewport, so a slide's state, refs, effects, ids and media stay the same across the seam and the jump. A deck too short for a shell to have room beside its own slide still falls back to rendering copies as before, and `Deck.useSlide()` reports them there; a stacked deck (fade, stack) never falls back, since its shells are never translated and so need no extra room.

  A consumer may notice: a looping slide's computed `scroll-snap-align` now reads `none`, since its shell carries the snap point instead; `translate` on a looping slide belongs to the deck, so a consumer's own `translate` there is overwritten; a translated slide's `position: fixed` descendants are now contained by it; `Deck.useSlide().copy` is `undefined` everywhere except a small deck's fallback copies; and core exports two new markers, `SHELL` and `SPACER`, next to `COPY` and `SNAP_TARGET`, plus a new `DeckState.copies` field reporting which way a looping deck is rendering.

### Patch Changes

- cc8b628: A mouse drag whose `setPointerCapture` throws, as a busy main thread can make it when it delivers the pointer's move after the pointer itself is gone, no longer sticks in "dragging" with no pointer left to release it: the engine tries capture before anything else changes, so a throw there leaves the drag never started.
- 83454b5: A looping deck no longer strands the counter on the wrong slide when a slide is added or removed while its own jump off a copy still has a scroll end pending with the browser: the deck now goes back to the current index once that scroll ends too, instead of reading it from wherever the jump's uncompensated scroll left the viewport.

## 1.2.0

### Minor Changes

- f83bbcb: slidedeck is now carouseldeck. `@slidedeck/core`, `@slidedeck/react` and `@slidedeck/docs` are now `@carouseldeck/core`, `@carouseldeck/react` and `@carouseldeck/docs`, and the version line goes on from `@slidedeck` 1.1.0. Change your imports from `@slidedeck/*` to `@carouseldeck/*`.

  This release breaks CSS that targets the deck's markup. The data attributes are renamed from `data-slidedeck-*` to `data-carouseldeck-*`, such as `data-carouseldeck-slide` and `data-carouseldeck-viewport`. The `<style>` elements the deck renders now use the hrefs `carouseldeck-slide` and `carouseldeck-<effect>` and the precedence `carouseldeck`. Rename these in your selectors. The `--deck-*` custom properties do not change.

  A breaking change is a major. This release is a minor all the same, once, so the version line goes on from slidedeck's.

  `@carouseldeck/react-18` is new: `@carouseldeck/react` built for React 18, with the same components, props and types. On React 18, install it in place of `@carouseldeck/react`.

## 1.1.0

### Patch Changes

- c0d9e9e: A looping deck keeps its place when slides are added or removed. Before, a move across the seam that was still in flight could end on another slide, such as Next from the last slide ending back on it. A deck at rest also depended on the browser to re-snap after the change, which does not always happen in time.

## 1.0.3

### Patch Changes

- ed06d32: Decks no longer come to rest short of where they were going in Safari. A move from a dot, Next, Prev or the handle could stop a snap point or more short of its target, an arrow key could leave the deck where it was, and a mouse drag could settle back where it began.

  Two changes in every browser make this so. A move that seems to have stopped short now ends only once the browser has rendered a frame with the scroll stopped, so a browser that pauses rendering for a moment, as Safari can under load, carries the scroll on to its target. In a hidden tab, which renders no frame, a move still settles as before. A mouse drag now tracks where it has put the deck, so a scroll the browser makes on its own during the drag no longer moves it back, while a wheel or a scroll key the user turns or presses mid-drag, and a slide added or removed, still move the deck, and the drag goes on and is released from there.

## 1.0.2

### Patch Changes

- d1b54e7: Server HTML now carries each slide's starting `--deck-slide-progress`: its distance in slides from the slide the deck starts at, a loop's copy by its own place. Effects and your own CSS on progress paint from the server HTML, before any script runs, so a server-rendered `curve` deck no longer paints flat and then jumps into its arc at hydration, and slides scaled by progress no longer render full size and then shrink. With equal-size slides, one per snap point, nothing changes at hydration; with slides of different sizes the engine corrects the estimate when it measures.

## 1.0.1

### Patch Changes

- 166c6b8: The documentation moved to https://slidedeck.pages.dev/docs/, where each guide, reference page and recipe shows its feature in a live deck. The package README keeps the install steps, the quickstart and the comparison with Embla and Keen, and links to the site. Both packages' `homepage` is now the site. No code changed.

## 1.0.0

### Major Changes

- 0a4297e: 1.0.0 is the first stable release. Nothing breaks from 0.3.3: update and your deck works as before. From now on the public API follows semver: every export of both packages, the components' props, the `data-slidedeck-*` attributes and the `--deck-*` CSS custom properties change in a breaking way only in a major version.

## 0.3.3

### Patch Changes

- e7e406f: A pen swipe no longer reports a slide as it starts. When the browser takes a pen over to pan the deck, a deck that came to rest under the pen now waits for the pen to lift before it settles and calls `onIndexChange`, as it does for a touch. Where the browser gives no sign that the pen lifted, the deck settles 1 second after the pan begins.
- d232bb2: A looping deck no longer runs out of copies under quick chained trackpad or wheel flicks. Each flick went on from the momentum of the one before, so the deck never came to rest to jump off a copy, and it could scroll on to the end of the range. Now a wheel event along the deck's axis, while the deck is on the copies, moves it back onto the slides, to the same place, as a touch or a drag already did. Nothing shows: the index does not change and nothing is reported or announced.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Patch Changes

- f53e539: A looping deck no longer runs out of copies when swipes or drags come faster than it comes to rest. Each swipe carried on from the momentum of the one before, so the deck never rested, never jumped back off the copies, and stopped at an end of its scroll range after a few swipes, on an iPhone and with a mouse in Chrome. Now a touch or pen pressed on the viewport while it is on the copies, or a mouse drag starting there, moves the deck back one set of slides, to the same place among them, before the swipe or drag goes on. Nothing shows: the index stays the same, `onIndexChange` does not fire, nothing is announced, focus stays where it is, and `--deck-slide-progress` and `data-in-view` read as before. A mouse click, and a tap during a move, change nothing.

  A touch that the browser turns into a pan now holds the deck until the finger lifts. Before, a deck that came to rest under the finger, at the end of a move or a fling, jumped off a copy and reported its index as the pan began.

  A looping deck with centred slides at an end of its scroll range, as after a hard drag or flick, stayed there on the copies, off its slides' snap points, and reported a slide it did not show. It now moves to the nearest snap point within the scroll range, and then jumps back onto its slide as usual.

- 9a9242a: In Chromium, after slides are removed or shrink so that the deck rests past the new end, the deck could stop following its layout: a controlled deck did not go back to `index` once slides were added again, Dots and Counter kept the old count, and a switch of `effect` or `loop` did not keep the current slide. It happened where Chromium never ended the scroll that moves the deck back into range, as after a touch fling on another scroller was cut short by leaving the page. The deck now treats that scroll as part of the new layout, and settles a scroll that is not the user's once no scroll event has come for 100ms. A scroll of the user's still settles only at its own end.

## 0.2.0

### Minor Changes

- 6a3621e: Add `Deck.useDeck()`, a hook that gives any component inside `Deck.Root` the deck's state and moves, so you can build Prev, Next, a counter or pagination from your own components. It returns `index`, `count` (`null` until the viewport is measured, as on the server), `loop`, `fits`, `canPrev`, `canNext`, and `scrollTo(index)`, `next()` and `prev()`. The values are the ones `Deck.Prev`, `Deck.Next` and `Deck.Counter` read, so a custom control and a built-in one agree; a move stops autoplay, as a built-in control does. It never re-renders while the deck scrolls, only when `Deck.Root` does: when the deck settles somewhere new, its snap points change or, with `autoplay`, autoplay starts, stops or pauses. It throws outside `Deck.Root`. Its return type is exported as `UseDeckResult`.

### Patch Changes

- 4891b56: A deck follows a change of `dir` on an ancestor after it mounts, as a locale switch makes, without a remount. It stays on its slide, at rest, a move in flight still arrives on its target, and Next, the arrow keys, a mouse drag and `--deck-slide-progress` go the new way. In Firefox and WebKit the deck went back to its first slide.
- 0318c28: The README gains recipes for setups that are CSS or a little of your own code, not options: centring the first and last slide without `loop`, highlighting the middle slide in view (centred, by `data-focal`, or at the start, by `--deck-slide-progress`), sizing a curve (a radius in pixels to `--deck-curve-radius` in slides, and the room the arc needs in the viewport), and custom controls and a counter built on `Deck.useDeck()`. They are linked from a Recipes index and from the sections they extend.
- 8340f43: A deck with mandatory snapping that comes to rest between snap points now moves to the nearest one, and then reports its index as usual. If the user's wheel or another scroll took over a move, it moves to the nearest one in that scroll's direction, and after a move cut short, in the move's direction. With `loop`, it then jumps off a copy to its slide as usual. In Chromium, a long task on the page could leave a deck there, and the browser never snapped it back. Decks with proximity snapping stay where they rest. The deck never moves while a pointer is pressed on it, during a drag, or while a scroll is still going on.

  The deck now measures its snap points as the browser rests the slides, `scroll-padding` and `scroll-margin` included, so a move to a slide with either set ends where the browser snaps it, at once.

- ea6ce7c: A deck keeps its place when `effect` or `loop` changes after it mounts, as when a media query picks them per breakpoint. It stays at its current index, at rest on its snap point, before the browser paints the new layout, with no `onIndexChange` and nothing announced; a move in flight ends on its target, and a deck a pointer holds still goes back once it lets go. Where the new layout has fewer snap points than the index needs, the deck rests on the last one and reports it. It went to another slide: fade's snap targets, or loop's copies in WebKit, moved the snap points under the viewport. The README gains a recipe, "Change `effect`, `loop` or `autoplay` per breakpoint", linked from Effects and Autoplay.

## 0.1.0

### Minor Changes

- 24534f7: The first release: a headless carousel for React 19 built on native CSS scroll snap. The browser scrolls, with its own momentum, snapping and focus scrolling; slidedeck tracks where the deck rests and asks the browser to move.

  - **Primitives**: `Deck.Root`, `Deck.Viewport`, `Deck.Slide`, `Deck.Prev`, `Deck.Next`, `Deck.Dots`, `Deck.Counter` and `Deck.AutoplayToggle`, composed as `import * as Deck from '@slidedeck/react'`. They work with no stylesheet.
  - **Layout is CSS**: slides per view, gap, alignment and their breakpoints are plain CSS, never props. Snap in pages by making only the first slide of each page a snap point; Dots and Counter then count pages.
  - **Current index**: uncontrolled with `defaultIndex`, controlled with `index` and `onIndexChange`, or imperative through `handleRef` (`scrollTo`, `next`, `prev`).
  - **Focal slide**: `data-focal`, `onFocalChange`, and `clickToFocus` to bring a clicked slide to the focal position.
  - **Loop**: `loop` runs on past the last snap point to the first with no visible jump, using `inert`, `aria-hidden` copies of the slides. `Deck.useSlide()` tells a slide's content its index and whether it is a copy, so content such as a video player can render differently in the copies.
  - **Drag**: a mouse drags the deck and a flick settles on the projected snap point; touch, pen and trackpad scroll natively. `drag={false}` turns it off.
  - **Autoplay**: `autoplay={ms}` with `Deck.AutoplayToggle`; it pauses at once when a pointer comes over the deck or the document is hidden, stops on focus or a user move, and starts stopped under reduced motion.
  - **Vertical and right-to-left**: `orientation="vertical"`, and the writing direction read from the viewport's computed `direction`, so `dir` on any ancestor applies.
  - **Progress and data attributes**: each slide's `--deck-slide-progress`, written every frame, and `data-*` state on every primitive, for CSS to read while the deck scrolls.
  - **Effects**: `fade` from `@slidedeck/react/fade` and `curve` from `@slidedeck/react/curve`, each its own entry point, so a deck ships only the effects it imports.
  - **Theme**: an optional `@slidedeck/react/theme.css` for the controls, every rule in `:where()` and every value a custom property. The autoplay toggle is filled with the accent while playing, and a dot that is not current changes under a pointer.
  - **Server rendering**: the primitives render on the server, and the deck starts at `defaultIndex` with no layout shift.
  - **Accessibility**: a carousel region with labelled slides, native buttons, a polite live region, keyboard scrolling on the viewport, focus moving into a slide bringing the deck to rest on that slide's page, even mid-move, focus within a slide or on the viewport leaving a move to arrive on the move's target snap point, and reduced-motion handling throughout.
  - **`@slidedeck/core`**: the framework-neutral engine the React package builds on.
