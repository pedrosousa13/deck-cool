# @slidedeck/react

## 1.5.2

### Patch Changes

- a4d9608: The deck removes the listeners it adds for its whole life with one `AbortController` when it is destroyed, in place of a `removeEventListener` call for each. The bundle is smaller, and a listener can no longer outlive the deck because its removal did not match how it was added.
- Updated dependencies [a4d9608]
  - @carouseldeck/core@1.5.2

## 1.5.1

### Patch Changes

- 3ba2192: A new layout landing right after a wheel, key or pointer scroll, before that scroll reaches the viewport, no longer settles the deck early and misses the scroll's own end: a refresh that only measures the layout now waits for such a scroll the same way it already waits for one already going.
- Updated dependencies [3ba2192]
  - @carouseldeck/core@1.5.1

## 1.5.0

### Patch Changes

- 8fc797c: A short looping deck whose viewport has inline padding, such as under the viewport bleed recipe, now settles instead of throwing "Maximum update depth exceeded". A deck that turns `loop` off now measures like one that never looped, rather than keeping whatever it last happened to render. `createDeck` takes a `loop` option, and the engine a `setLoop()` method, for whether the deck loops.
- Updated dependencies [8fc797c]
  - @carouseldeck/core@1.5.0

## 1.4.0

### Minor Changes

- 4315f08: `Deck.Root` takes an opt-in `autoplayResume` (milliseconds): autoplay restarts that long after focus leaves the deck, the pointer is off it and the last move settles. A new interaction cancels the wait. It never restarts once `Deck.AutoplayToggle` has stopped autoplay, and never under reduced motion. Without `autoplayResume`, nothing changes.
- c01b3c3: The curve effect now orders its slides as it draws them: a zero-specificity `z-index` rule puts the focal slide on top, lower the further a slide is from it, the same on both sides. Your own `z-index` still overrides it.

  A new switch, `--deck-curve-fade-view: 1`, fades a slide by how much of it is in the viewport instead of its distance from the focal slide: fully opaque while at least half of it is in view, fading to 0 as the rest of it leaves. It needs `--deck-viewport-span`; before the deck has measured it, the radius-based fade stands.

- 630974f: `Deck.Root`'s `handleRef` handle now stops autoplay when its `scrollTo`, `next` or `prev` moves the deck, exactly as `useDeck()`'s moves already do.
- 656e8e9: `useDeck()` reports two more slide indexes, next to `index` and `count`: `slide`, the current slide, and `focal`, the focal slide, each a slide even where `index` and `count` count pages. Both are `null` until the viewport is measured, as `count` already is, and both are `-1` where no slide snaps, matching what `onFocalChange` reports for `focal`. A new `slideCount` reports the number of slides, as opposed to `count`'s snap points, with a loop's shells and its copies both left out; it too can be `null`, where it is not known yet.
- 7b9fb6d: `Deck.Viewport` writes two measured custom properties, as plain numbers with no unit: `--deck-viewport-step`, the distance from one slide to the next along the axis (its size plus the gap; a loop's shells and copies are left out), and `--deck-viewport-span`, the viewport's own size along the axis, in multiples of `--deck-viewport-step`. CSS can then divide pixels by either without dividing one length by another. Written at mount, on resize, and when a slide is added or removed; never before the first measurement, or with fewer than two slides, so use `var(--deck-viewport-step, <fallback>)` for either. A vertical deck reports its vertical step; a loop's shells and copies never change the values.

### Patch Changes

- Updated dependencies [656e8e9]
- Updated dependencies [7b9fb6d]
  - @carouseldeck/core@1.4.0

## 1.3.3

### Patch Changes

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

## 1.1.0

### Minor Changes

- ff73434: A new effect, `stack` from `@slidedeck/react/stack`, stacks the slides in one place, as cards, and orders them by progress: the focal slide on top, the slides after it behind it, and a slide leaving drops to the back halfway. It ships no appearance: the look and the throw are your CSS on `--deck-slide-progress`, as the card stack recipe in the docs shows.

  Every slide and copy now carries `--deck-slide-count`, the number of slides, copies not counted, set inline from the first render, so server HTML has it.

### Patch Changes

- 688999f: The docs pages and the package README read more plainly, with the same facts, headings, code blocks and API.
- 5b5b59f: The packages' `homepage` and the README's docs link now point at https://slide.deck.cool. No code changed.
- Updated dependencies [c0d9e9e]
  - @slidedeck/core@1.1.0

## 1.0.3

### Patch Changes

- ed06d32: Decks no longer come to rest short of where they were going in Safari. A move from a dot, Next, Prev or the handle could stop a snap point or more short of its target, an arrow key could leave the deck where it was, and a mouse drag could settle back where it began.

  Two changes in every browser make this so. A move that seems to have stopped short now ends only once the browser has rendered a frame with the scroll stopped, so a browser that pauses rendering for a moment, as Safari can under load, carries the scroll on to its target. In a hidden tab, which renders no frame, a move still settles as before. A mouse drag now tracks where it has put the deck, so a scroll the browser makes on its own during the drag no longer moves it back, while a wheel or a scroll key the user turns or presses mid-drag, and a slide added or removed, still move the deck, and the drag goes on and is released from there.

- Updated dependencies [ed06d32]
  - @slidedeck/core@1.0.3

## 1.0.2

### Patch Changes

- d1b54e7: Server HTML now carries each slide's starting `--deck-slide-progress`: its distance in slides from the slide the deck starts at, a loop's copy by its own place. Effects and your own CSS on progress paint from the server HTML, before any script runs, so a server-rendered `curve` deck no longer paints flat and then jumps into its arc at hydration, and slides scaled by progress no longer render full size and then shrink. With equal-size slides, one per snap point, nothing changes at hydration; with slides of different sizes the engine corrects the estimate when it measures.
- Updated dependencies [d1b54e7]
  - @slidedeck/core@1.0.2

## 1.0.1

### Patch Changes

- 166c6b8: The documentation moved to https://slidedeck.pages.dev/docs/, where each guide, reference page and recipe shows its feature in a live deck. The package README keeps the install steps, the quickstart and the comparison with Embla and Keen, and links to the site. Both packages' `homepage` is now the site. No code changed.
- Updated dependencies [166c6b8]
  - @slidedeck/core@1.0.1

## 1.0.0

### Major Changes

- 0a4297e: 1.0.0 is the first stable release. Nothing breaks from 0.3.3: update and your deck works as before. From now on the public API follows semver: every export of both packages, the components' props, the `data-slidedeck-*` attributes and the `--deck-*` CSS custom properties change in a breaking way only in a major version.

### Patch Changes

- Updated dependencies [0a4297e]
  - @slidedeck/core@1.0.0

## 0.3.3

### Patch Changes

- e7e406f: A pen swipe no longer reports a slide as it starts. When the browser takes a pen over to pan the deck, a deck that came to rest under the pen now waits for the pen to lift before it settles and calls `onIndexChange`, as it does for a touch. Where the browser gives no sign that the pen lifted, the deck settles 1 second after the pan begins.
- d232bb2: A looping deck no longer runs out of copies under quick chained trackpad or wheel flicks. Each flick went on from the momentum of the one before, so the deck never came to rest to jump off a copy, and it could scroll on to the end of the range. Now a wheel event along the deck's axis, while the deck is on the copies, moves it back onto the slides, to the same place, as a touch or a drag already did. Nothing shows: the index does not change and nothing is reported or announced.
- Updated dependencies [e7e406f]
- Updated dependencies [d232bb2]
  - @slidedeck/core@0.3.3

## 0.3.2

### Patch Changes

- 62689d4: A deck rendered straight from a React server component now has Dots and Counter filled in its server HTML, one page per slide, as a deck in a client component does. They no longer render empty until hydration. `@slidedeck/react` now has a `react-server` export condition, which frameworks such as the Next.js App Router resolve for a server component: its `Deck.Root` counts the slides there. The exports, props and types do not change. In a server file, `Deck.Root` is now a server component, so passing it as a value to a client component, as in `as={Deck.Root}`, fails: import it in the client component instead.
- @slidedeck/core@0.3.2

## 0.3.1

### Patch Changes

- a4f3339: `@slidedeck/react`, `@slidedeck/react/fade` and `@slidedeck/react/curve` now start with `'use client'`. In a React Server Components framework, such as the Next.js App Router, a server component can render the deck, with `effect={fade}` or `effect={curve}`, without a client component of your own. Function props such as `onIndexChange`, and a `ref` to the handle, still need a client component.
- @slidedeck/core@0.3.1

## 0.3.0

### Minor Changes

- 67a46f2: A deck no longer shows a scrollbar. It still scrolls by touch, trackpad, mouse wheel, drag, keyboard and its controls, and it snaps as before. Where scrollbars take layout space, as on Windows and most Linux desktops, the viewport no longer loses that space to one, so a horizontal deck is that much shorter and a vertical deck's slides that much wider.

  The default `scrollbar-width: none` is a zero-specificity rule, so any rule of yours wins. To bring the scrollbar back:

  ```css
  [data-slidedeck-viewport] {
    scrollbar-width: auto;
  }
  ```

  Safari before 18.2 does not support `scrollbar-width`. There the deck hides the scrollbar with `::-webkit-scrollbar { display: none }` instead, at the specificity of one element, so your `[data-slidedeck-viewport]::-webkit-scrollbar` rule wins. The native scrollbar cannot come back there: any `::-webkit-scrollbar` rule replaces it with one drawn from your CSS. To show a styled one there, and leave other browsers theirs (untested in Safari before 18.2):

  ```css
  @supports not (scrollbar-width: auto) {
    [data-slidedeck-viewport]::-webkit-scrollbar {
      display: block;
      width: 8px;
      height: 8px;
    }
    [data-slidedeck-viewport]::-webkit-scrollbar-thumb {
      background: rgb(0 0 0 / 0.4);
      border-radius: 4px;
    }
  }
  ```

### Patch Changes

- f53e539: A looping deck no longer runs out of copies when swipes or drags come faster than it comes to rest. Each swipe carried on from the momentum of the one before, so the deck never rested, never jumped back off the copies, and stopped at an end of its scroll range after a few swipes, on an iPhone and with a mouse in Chrome. Now a touch or pen pressed on the viewport while it is on the copies, or a mouse drag starting there, moves the deck back one set of slides, to the same place among them, before the swipe or drag goes on. Nothing shows: the index stays the same, `onIndexChange` does not fire, nothing is announced, focus stays where it is, and `--deck-slide-progress` and `data-in-view` read as before. A mouse click, and a tap during a move, change nothing.

  A touch that the browser turns into a pan now holds the deck until the finger lifts. Before, a deck that came to rest under the finger, at the end of a move or a fling, jumped off a copy and reported its index as the pan began.

  A looping deck with centred slides at an end of its scroll range, as after a hard drag or flick, stayed there on the copies, off its slides' snap points, and reported a slide it did not show. It now moves to the nearest snap point within the scroll range, and then jumps back onto its slide as usual.

- 9a9242a: In Chromium, after slides are removed or shrink so that the deck rests past the new end, the deck could stop following its layout: a controlled deck did not go back to `index` once slides were added again, Dots and Counter kept the old count, and a switch of `effect` or `loop` did not keep the current slide. It happened where Chromium never ended the scroll that moves the deck back into range, as after a touch fling on another scroller was cut short by leaving the page. The deck now treats that scroll as part of the new layout, and settles a scroll that is not the user's once no scroll event has come for 100ms. A scroll of the user's still settles only at its own end.
- Updated dependencies [f53e539]
- Updated dependencies [9a9242a]
  - @slidedeck/core@0.3.0

## 0.2.0

### Minor Changes

- 6a3621e: Add `Deck.useDeck()`, a hook that gives any component inside `Deck.Root` the deck's state and moves, so you can build Prev, Next, a counter or pagination from your own components. It returns `index`, `count` (`null` until the viewport is measured, as on the server), `loop`, `fits`, `canPrev`, `canNext`, and `scrollTo(index)`, `next()` and `prev()`. The values are the ones `Deck.Prev`, `Deck.Next` and `Deck.Counter` read, so a custom control and a built-in one agree; a move stops autoplay, as a built-in control does. It never re-renders while the deck scrolls, only when `Deck.Root` does: when the deck settles somewhere new, its snap points change or, with `autoplay`, autoplay starts, stops or pauses. It throws outside `Deck.Root`. Its return type is exported as `UseDeckResult`.

### Patch Changes

- 4891b56: A deck follows a change of `dir` on an ancestor after it mounts, as a locale switch makes, without a remount. It stays on its slide, at rest, a move in flight still arrives on its target, and Next, the arrow keys, a mouse drag and `--deck-slide-progress` go the new way. In Firefox and WebKit the deck went back to its first slide.
- 09021e1: A controlled deck no longer undoes a move that starts just after it reports a new index, before React renders the parent taking that index: Next, Prev, a dot, `scrollTo`, a drag's release or an autoplay step. The deck went back to the reported index, and ended one slide short. Under load, as in WebKit on a busy machine, a press could come in that gap. Now an `index` the parent takes from `onIndexChange` never undoes a move started since, and the move goes on. A deck at rest elsewhere still goes to `index`.
- 0318c28: The README gains recipes for setups that are CSS or a little of your own code, not options: centring the first and last slide without `loop`, highlighting the middle slide in view (centred, by `data-focal`, or at the start, by `--deck-slide-progress`), sizing a curve (a radius in pixels to `--deck-curve-radius` in slides, and the room the arc needs in the viewport), and custom controls and a counter built on `Deck.useDeck()`. They are linked from a Recipes index and from the sections they extend.
- 8340f43: A deck with mandatory snapping that comes to rest between snap points now moves to the nearest one, and then reports its index as usual. If the user's wheel or another scroll took over a move, it moves to the nearest one in that scroll's direction, and after a move cut short, in the move's direction. With `loop`, it then jumps off a copy to its slide as usual. In Chromium, a long task on the page could leave a deck there, and the browser never snapped it back. Decks with proximity snapping stay where they rest. The deck never moves while a pointer is pressed on it, during a drag, or while a scroll is still going on.

  The deck now measures its snap points as the browser rests the slides, `scroll-padding` and `scroll-margin` included, so a move to a slide with either set ends where the browser snaps it, at once.

- ea6ce7c: A deck keeps its place when `effect` or `loop` changes after it mounts, as when a media query picks them per breakpoint. It stays at its current index, at rest on its snap point, before the browser paints the new layout, with no `onIndexChange` and nothing announced; a move in flight ends on its target, and a deck a pointer holds still goes back once it lets go. Where the new layout has fewer snap points than the index needs, the deck rests on the last one and reports it. It went to another slide: fade's snap targets, or loop's copies in WebKit, moved the snap points under the viewport. The README gains a recipe, "Change `effect`, `loop` or `autoplay` per breakpoint", linked from Effects and Autoplay.
- Updated dependencies [4891b56]
- Updated dependencies [0318c28]
- Updated dependencies [8340f43]
- Updated dependencies [ea6ce7c]
- Updated dependencies [6a3621e]
  - @slidedeck/core@0.2.0

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

### Patch Changes

- Updated dependencies [24534f7]
  - @slidedeck/core@0.1.0
