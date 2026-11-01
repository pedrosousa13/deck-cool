---
title: Comparison with vaul, Base UI's Drawer and React Aria's Sheet
label: Compare
description: "How drawerdeck compares with vaul, Base UI's Drawer and React Aria's Sheet today: native scrolling against pointer-driven JavaScript, a feature table sourced from each project's own docs, and the first fair, CI-run bench numbers with their caveats."
---

**Verdict today:** this CI run has drawerdeck winning or tying every row at every load. It wins bundle size, dropped frames under medium and heavy load, flick-dismiss settle time under heavy load, and the mouse throw at every load; it ties longest stall and open-to-half at every load, and flick-dismiss settle time at no load and medium load. See "Who closes on a flick" below for which rivals report closing at all.

## At a glance

| Question                                                             | drawerdeck                                       | vaul                      | Base UI Drawer | React Aria Sheet                                                                                                         | Winner                      |
| -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Bundle size (min+gzip, React external)                               | 6.83 KB                                          | 22.58 KB                  | 30.92 KB       | 30.69 KB                                                                                                                 | **drawerdeck**              |
| Dropped frames while dragging, no load                               | 0.0%                                             | 0.0%                      | 0.0%           | 0.0%                                                                                                                     | Tie                         |
| Dropped frames while dragging, medium load (100ms busy tick)         | 0.0%                                             | 24.1%                     | 12.7%          | 19.6%                                                                                                                    | **drawerdeck**              |
| Dropped frames while dragging, heavy load (200ms busy tick)          | 0.0%                                             | 51.7%                     | 42.3%          | 50.0%                                                                                                                    | **drawerdeck**              |
| Longest stall while dragging, no load                                | 33.3 ms                                          | 166.7 ms                  | 33.3 ms        | 33.3 ms                                                                                                                  | Tie                         |
| Flick down closes it: settle time, no load                           | 1016.5 ms                                        | 1166.0 ms                 | 1147.5 ms      | did not close                                                                                                            | Tie                         |
| Flick down closes it: settle time, medium load (100ms busy tick)     | 1167.0 ms                                        | 1542.5 ms                 | did not close  | did not close                                                                                                            | Tie                         |
| Flick down closes it: settle time, heavy load (200ms busy tick)      | 1400.5 ms                                        | did not close             | did not close  | did not close                                                                                                            | **drawerdeck**              |
| Mouse throw: settle time, no load                                    | 874.5 ms                                         | 971.5 ms                  | 973.5 ms       | not supported                                                                                                            | **drawerdeck**              |
| Open to half: settle time, no load                                   | 889.0 ms                                         | 1036.0 ms                 | 985.0 ms       | 935.5 ms                                                                                                                 | Tie                         |
| Maintained?                                                          | Beta                                             | No, last release Dec 2024 | Yes            | Yes (Adobe)                                                                                                              | **Base UI**, **React Aria** |
| Features: all sides, non-modal, nesting, background indent, keyboard | All sides, modal or non-modal, keyboard handling | All                       | All            | Most (no non-modal option; only a nested sheet's own backdrop and parent scale back, not the page behind a single sheet) | **Base UI**, **vaul**       |
| Built on native `<dialog>` and native scrolling                      | Yes                                              | No                        | No             | No (a scrollable overlay driven by CSS scroll-snap, not `<dialog>`)                                                      | **drawerdeck**              |
| React versions                                                       | 18 to 19                                         | 16.8 to 19                | 17 to 19       | 16.8 to 19                                                                                                               | **vaul**, **React Aria**    |

The Winner column is copied from the "Overall" column of the bench's own per-shard winners table (below): a "tie" there means the six shards disagreed on a winner, or the gap between the best and second-best pooled medians didn't clear the winning deck's own spread across shards. A tie is never shown as a win here, whichever deck's number happens to read lowest.

## Who closes on a flick

Settle time is only half the flick-dismiss story: a fast "settle" means
nothing if the drawer never actually reports itself closed. This is
whether each deck's own `onOpenChange`/`isOpen` state reports closed after
a flick-down, at each load, in this run ([#311](https://github.com/pedrosousa13/deck-cool/issues/311), [#266](https://github.com/pedrosousa13/deck-cool/issues/266) rule 12).

| Deck       | No load        | Medium load (100ms busy tick) | Heavy load (200ms busy tick) |
| ---------- | -------------- | ----------------------------- | ---------------------------- |
| drawerdeck | closes         | closes                        | closes                       |
| vaul       | closes         | closes                        | does not close               |
| Base UI    | closes         | does not close                | does not close               |
| React Aria | does not close | does not close                | does not close               |

drawerdeck closes at every load. vaul closes at no load and medium load; at
heavy load, the run recorded it not reporting itself closed in most of its
reps, and RESULTS.md gives no further cause. Base UI closes at no load,
but stops closing under medium and heavy load: its own swipe-dismiss logic
judges the release from a velocity sample that goes stale once the gap
since the last touch move passes 80ms (`MAX_RELEASE_VELOCITY_AGE_MS`), and
a busy main thread pushes the touchend past that window, so the release
reads as too slow to count as a dismiss
([#314](https://github.com/pedrosousa13/deck-cool/issues/314)). React Aria
does not close at any load in this environment: its Sheet detects a swipe
settling closed through an `IntersectionObserver` that, in this bench's
headless Chromium, fires once on mount and never again during the gesture,
so `onOpenChange(false)` never runs
([#311](https://github.com/pedrosousa13/deck-cool/issues/311)); this may be
specific to headless Chromium and might not reproduce on a real device.

## Feature table

Every drawerdeck cell comes from its own source
(`@drawerdeck/core`, `@drawerdeck/react`) or its docs package. Every vaul,
Base UI and React Aria cell comes from that project's own docs or source,
linked below.

| Feature                                | drawerdeck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | vaul                                                                                                                                                                                                                                       | Base UI Drawer                                                                                                                                                                                                                                                                                    | React Aria Sheet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintained (last release)              | Beta, unreleased (`0.0.0`, private). The engine landed in [#240](https://github.com/pedrosousa13/deck-cool/issues/240); the release is tracked in [#242](https://github.com/pedrosousa13/deck-cool/issues/242).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [1.1.2](https://github.com/emilkowalski/vaul/releases/tag/v1.1.2), 14 Dec 2024. Its [README](https://github.com/emilkowalski/vaul/blob/v1.1.2/README.md) says: "This repo is unmaintained... This was and always will be a hobby project." | `@base-ui/react` [1.9.0](https://www.npmjs.com/package/@base-ui/react), 9 Oct 2026 (npm).                                                                                                                                                                                                         | `react-aria-components` [1.22.1](https://www.npmjs.com/package/react-aria-components), 9 Oct 2026 (npm), Apache-2.0, built and maintained by Adobe.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| React versions                         | React 18 and 19. `@drawerdeck/react` is for React 19 alone; `@drawerdeck/react-18` (`peerDependencies`: `>=18 <20`) builds the same source for React 18 too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | React 16.8 to 19 (`peerDependencies`: `^16.8 \|\| ^17.0 \|\| ^18.0 \|\| ^19.0.0 \|\| ^19.0.0-rc`).                                                                                                                                         | React 17 to 19 (npm `peerDependencies`: `^17 \|\| ^18 \|\| ^19`).                                                                                                                                                                                                                                 | React 16.8 to 19 (npm `peerDependencies`: `^16.8.0 \|\| ^17.0.0-rc.1 \|\| ^18.0.0 \|\| ^19.0.0-rc.1`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Snap points                            | Yes. Fractions of the viewport height or fixed pixel strings, nearest first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Yes. Numbers 0-1 as a fraction, or pixel values.                                                                                                                                                                                           | Yes. Numbers 0-1 as a fraction, greater than 1 as pixels, or `px`/`rem` strings.                                                                                                                                                                                                                  | Yes. `snapPoints`: a bare number as pixels of the sheet visible, a CSS length, or a percentage, "relative to the size of the sheet" ([react-aria.adobe.com/Sheet](https://react-aria.adobe.com/Sheet)), not the viewport; the bench bounds `Sheet`'s own box to `100dvh` first so its percentages match the other three decks' fractions of the viewport.                                                                                                                                                                                                                 |
| Inner-content scroll handoff           | Automatic. The inner scroller (`Drawer.Content`) is locked (`overflow-y: hidden`) until the drawer reaches its top snap point, then it scrolls natively. No attribute to add.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A per-event heuristic (`shouldDrag()`): drags the sheet unless the target has scrolled, has text selected, or carries `data-vaul-no-drag`.                                                                                                 | Swipe applies to the whole panel by default; opt an element out with `data-base-ui-swipe-ignore` (optionally scoped to one axis).                                                                                                                                                                 | Not documented on its docs or blog post; the sheet's own drag already is native scrolling (see "Drag engine" below), so there's no separate handoff to describe.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Mouse drag                             | Yes. A dedicated handler for `pointerType === 'mouse'` only: a short velocity history and a 240ms eased throw onto the nearest snap point.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Yes. The same pointer/touch handling drives every input type; no mouse-specific path.                                                                                                                                                      | Yes. Pointer and touch events drive every input type.                                                                                                                                                                                                                                             | No (the bench measured it not responding): neither [react-aria.adobe.com/Sheet](https://react-aria.adobe.com/Sheet) nor the [blog post](https://react-aria.adobe.com/blog/sheet) mentions mouse dragging, and a plain `overflow-y: auto` scroll container does not turn a left-button press-move-release into a scroll in Chromium the way touch or a trackpad pan does.                                                                                                                                                                                                  |
| Sides (bottom/top/left/right)          | All four (`side` prop, default `'bottom'`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | All four (`direction` prop, default `'bottom'`).                                                                                                                                                                                           | All four (`swipeDirection` prop, default `'down'`).                                                                                                                                                                                                                                               | All four, plus `'center'`, and `'start'`/`'end'` ("mirrored in right-to-left locales") (`position` prop: `'bottom' \| 'top' \| 'left' \| 'right' \| 'start' \| 'end' \| 'center'`).                                                                                                                                                                                                                                                                                                                                                                                       |
| Non-modal                              | Yes (`modal` prop: `true` or `false`, default `true`). `modal={false}` opens `Drawer.Popup` with `show()`, out of the top layer; an outside press never closes it by default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Yes (`modal` prop: `true` or `false`).                                                                                                                                                                                                     | Yes (`modal` prop: `true`, `false`, or `'trap-focus'`).                                                                                                                                                                                                                                           | Not documented. `Sheet` has no modal prop; `preventDismissal` blocks Escape, outside-press and swipe dismissal, but there's no option to render it non-modal.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Nested drawers                         | No.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Yes (`nested` prop).                                                                                                                                                                                                                       | Yes. Dedicated `data-nested-drawer-open`/`data-nested-drawer-swiping` attributes and `--nested-drawers`/`--drawer-frontmost-height` CSS variables.                                                                                                                                                | Yes. Sheets stack by nesting one `SheetTrigger` inside another; a parent sheet scales back when a child opens (`stackAnimation`), tracked by `data-stack-index`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Background indent/scale                | No. [ADR 0001](https://github.com/pedrosousa13/deck-cool/blob/main/decks/drawerdeck/docs/adr/0001-native-scrolling-is-the-engine.md) found that a scroll-driven animation does not resolve across the top layer, so "a background indent needs JS, or a different structure", not built yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Yes (`shouldScaleBackground` prop).                                                                                                                                                                                                        | Yes. `Drawer.Provider`, `Drawer.IndentBackground` and `Drawer.Indent` scale the background when a drawer opens.                                                                                                                                                                                   | Partial. `SheetBackdrop` dims only the bottom-most sheet in a stack, and a parent sheet scales back behind a nested child (`stackAnimation`); there's no option to indent or scale the page itself behind a single, non-nested sheet.                                                                                                                                                                                                                                                                                                                                     |
| On-screen keyboard handling            | Yes, on by default, no prop to turn it on. The Viewport keeps its own full size and position; a keyboard just covers its lower part, the way Base UI's and React Aria's own sheets do too. `Drawer.Popup` carries `--drawer-keyboard-inset` (`visualViewport`'s own numbers, re-read on every `visualViewport` 'resize'/'scroll' and `window` 'resize'), applied to `Drawer.Content` as `padding-bottom`/`scroll-padding-bottom` too: the current snap index is kept (or the drawer expands to its largest one and scrolls the field clear of the keyboard, if it would otherwise hide it). A momentary `transform` on a focused field, the same trick vaul 1.1.2's own vendored, older React Aria copy and Base UI's own `touchend` handler both carry (current React Aria no longer does, see its own cell, right), is a best-effort first line against Safari's own page pan pushing `Drawer.Popup`'s top edge off screen; a standalone `translate` on `Drawer.Panel`, re-read alongside the inset, undoes a pan already in progress regardless, so the Panel's own top edge stays on screen whether or not the transform caught it ([#273](https://github.com/pedrosousa13/deck-cool/issues/273), [#327](https://github.com/pedrosousa13/deck-cool/pull/327)). | Yes, on by default (`repositionInputs`, `true` by default). Writes the drawer's own inline `height` and `bottom` on a `visualViewport` resize ([vaul.emilkowal.ski/api](https://vaul.emilkowal.ski/api)). Its own vendored `onFocus` handler (`vaul/dist/index.js`) is where the `translateY(-2000px)`-on-focus trick drawerdeck's own cell (left) also carries survives, credited there to an older React Aria.                                  | Opt-in: wrap the sheet in `<Drawer.VirtualKeyboardProvider>`, which leaves the sheet's own box alone and sets `--drawer-keyboard-inset` ([base-ui.com/react/components/drawer](https://base-ui.com/react/components/drawer), `packages/react/src/drawer/root/DrawerVirtualKeyboardProvider.tsx`). Its own `touchend` handler applies the same momentary transform drawerdeck's own cell (left) carries, from `focusKeyboardInputWithoutPageScroll`, before the browser's own focus fires. | Yes, built into `ModalOverlay`, which `Sheet` renders on and also leaves alone: reads `useViewportSize()` (`packages/@react-aria/utils/src/useViewportSize.ts`) and sets `--visual-viewport-height`, which `Sheet` turns into `--sheet-scroll-padding-y: calc(100dvh - var(--visual-viewport-height))` for a consumer's own CSS. Current `usePreventScroll` (`react-aria` 3.53.1, `dist/private/overlays/usePreventScroll.mjs`) no longer carries the focus-transform trick at all: it sets `overflow: hidden` on the root element and overrides `HTMLElement.prototype.focus` with `preventScroll: true` instead ([react-aria.adobe.com/Modal](https://react-aria.adobe.com/Modal)). |
| Uses `<dialog>`/top layer              | Yes, when modal (the default): `Drawer.Popup` renders a `<dialog>`, opened with `showModal()`, the top layer, focus trap and Escape for free. `modal={false}` opens the same `<dialog>` with `show()` instead, out of the top layer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | No. Built on `@radix-ui/react-dialog`: a `<div>`, not the native element.                                                                                                                                                                  | No. A custom `<div>`-based implementation.                                                                                                                                                                                                                                                        | No. `Sheet` is a scrollable overlay (a styled `<div>`), not `<dialog>`; its [blog post](https://react-aria.adobe.com/blog/sheet) says it is "double the height of the window viewport, and positioned so that only the top half is visible, with the sheet in the bottom half."                                                                                                                                                                                                                                                                                           |
| Drag engine                            | Native CSS scroll-snap drives touch, wheel and trackpad. Mouse alone gets a JS pointer handler, because a mouse cannot drag a scroll container.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | JS pointer and touch events throughout: writes `translate3d` on every move.                                                                                                                                                                | JS pointer and touch events throughout: writes `--drawer-swipe-movement-x`/`-y` CSS variables that drive a transform.                                                                                                                                                                             | Native CSS scroll-snap and `view-timeline`, like drawerdeck's own engine, but with no mouse path: its [blog post](https://react-aria.adobe.com/blog/sheet) says "Scrolling is All You Need", so "swipe gestures run off the main thread at the native display refresh rate without any JavaScript touch handling."                                                                                                                                                                                                                                                        |
| Open and close animation               | Yes, written by the consumer. `open()` sets scroll position straight to the snap point with no scroll animation; `data-starting-style` on open and `data-ending-style` on close drive a CSS `transition` you write yourself ([`animate-the-drawer`](https://github.com/pedrosousa13/deck-cool/blob/main/decks/drawerdeck/packages/docs/guides/animate-the-drawer.md), 300ms on the family curve), the same attribute names as Base UI's own ([#268](https://github.com/pedrosousa13/deck-cool/issues/268)).                                                                                                                                                                                                                                                                                                                                                                                                               | Yes, out of the box: `Drawer.Overlay`'s and `Drawer.Content`'s own shipped CSS (`style.css`'s `[data-vaul-overlay]`/`[data-vaul-drawer]` rules) fades and slides them, as long as both are rendered.                                       | Yes, documented: the packaged docs give `Drawer.Popup` and `Drawer.Backdrop` a `transition: transform 450ms cubic-bezier(0.32, 0.72, 0, 1)` on `[data-starting-style]`/`[data-ending-style]`, with the release duration scaled by `--drawer-swipe-strength`.                                      | No CSS entrance: `Sheet` opens with a native smooth scroll the engine drives, the same approach drawerdeck used before #268. `SheetBackdrop` needs its own `swipeAnimation` prop and `@keyframes` for its fade, or it paints nothing.                                                                                                                                                                                                                                                                                                                                     |
| Headless/unstyled                      | Yes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Yes.                                                                                                                                                                                                                                       | Yes.                                                                                                                                                                                                                                                                                              | Yes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Bundle size (min+gzip, React external) | 6.83 KB: the real `@drawerdeck/react` plus `@drawerdeck/core`, built from `main` and packed, with `react`, `react-dom` and `react/jsx-runtime` external, the same as the rivals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 22.58 KB (`vaul` 1.1.2).                                                                                                                                                                                                                   | 30.92 KB (`@base-ui/react` 1.9.0, the `Drawer` export).                                                                                                                                                                                                                                           | 30.69 KB (`react-aria-components` 1.22.1, the `Sheet` subpath export: `Sheet`, `SheetTrigger`, `SheetOverlay`, `SheetBackdrop`, `SheetContent`), the whole cost of importing `Sheet`: overlays, focus management, everything else it pulls in.                                                                                                                                                                                                                                                                                                                            |

## The benchmark

Answers [#266](https://github.com/pedrosousa13/deck-cool/issues/266) and
[#283](https://github.com/pedrosousa13/deck-cool/issues/283), part of the
drawerdeck map ([#230](https://github.com/pedrosousa13/deck-cool/issues/230)).
Full write-up, including all 12 fairness rules in full, at
[`decks/drawerdeck/bench/RESULTS.md`](https://github.com/pedrosousa13/deck-cool/blob/main/decks/drawerdeck/bench/RESULTS.md).

**Method, in brief.** A Chromium trace scores each run's longest visual
stall, dropped frames and settle time, from Chrome DevTools Protocol's
trusted touch input, not simulated events, restricted to each gesture's own
active window (so an idle pause between two drags never counts as a
stall). Four scenarios (touch drag half to full and back, touch flick
dismiss, mouse drag throw, open to half) each run at three main-thread
loads (none, a 100ms busy-loop tick, a 200ms tick). All four drawers render
the same 50-row content, the same snap points (half and full, `[0.5,
0.92]`), and the same bench-owned probe for "openness," so a native-scroll
drawer, a `translate3d` drawer, a CSS-variable drawer and a scroll-snap
drawer are all read the same way.

**This run:** GitHub Actions run
[41220329308](https://github.com/pedrosousa13/deck-cool/actions/runs/41220329308)
of `drawer-bench.yml`, on main at commit `4b588fa`, scored against all 12
fairness rules below. It supersedes the earlier run
([41036709823](https://github.com/pedrosousa13/deck-cool/actions/runs/41036709823),
commit `36de430`), and is the first run after drawers could open from the
top, left or right too
([#270](https://github.com/pedrosousa13/deck-cool/issues/270)) and a mouse
drag past the closed position stopped reopening the drawer
([#322](https://github.com/pedrosousa13/deck-cool/issues/322)), which grew
drawerdeck from 6.29 KB to 6.83 KB. Six parallel, dedicated `ubuntu-latest`
shards (never a machine shared with
other work), each running the complete interleaved bench with 5 reps per
(scenario, load, deck) cell; every rep's own run order is reshuffled fresh,
so no deck's reps land disproportionately on a busier or quieter stretch of
a shard's run. Pooled across all six shards: 1440 scored rows, n=30 per
cell (a discarded warm-up rep per page excluded).

**The 12 fairness rules** ([#266](https://github.com/pedrosousa13/deck-cool/issues/266),
full text in RESULTS.md):

1. Same runner, interleaved: one Playwright worker, foreground, every rep's run order freshly shuffled.
2. Production builds for everyone: `vite build`, one shared React version, no `<StrictMode>`.
3. Each rival configured the way its own docs recommend, with every non-default option listed and why. History: [#304](https://github.com/pedrosousa13/deck-cool/issues/304) found the bench missing documented entrance, exit and backdrop CSS for Base UI, vaul and React Aria, fixed before this run.
4. The same task: the same content, snap points and viewport for every deck, with React Aria's one documented exception (percentage strings, not bare fractions).
5. Latest stable versions, pinned, with release dates.
6. A warm-up rep, discarded.
7. Ties are ties: a winner needs every shard to agree, and a gap bigger than the winning deck's own spread.
8. Reproducible and reviewable: every adapter is checked in, and raw results, the pooled jsonl and every rep's trace are uploaded.
9. Losses stay visible: every metric is printed for every deck, win or lose.
10. Stalls score motion, not a scripted pause: only a gesture's own active window counts.
11. A drawer that does not respond to a gesture cannot win it (React Aria's mouse throw, below).
12. A dismiss counts only when the library itself reports it closed, scored separately per load. History: [#311](https://github.com/pedrosousa13/deck-cool/issues/311) found a dismiss being counted from the bench's own reading of the drawer's on-screen position, which credited React Aria's Sheet for scrolling out of view without ever reporting itself closed; fixed by driving every adapter's own open state into the harness. [#314](https://github.com/pedrosousa13/deck-cool/issues/314) then found the "did not close"/"not supported" verdict pooled across every load instead of scoring each load's own rows, which mislabeled individual load cells; fixed before this run.

**Versions, with release dates**

| Deck                                 | Version                                 | Released   |
| ------------------------------------ | --------------------------------------- | ---------- |
| drawerdeck                           | this commit (`workspace:*`, unreleased) | -          |
| vaul                                 | 1.1.2                                   | 2024-12-14 |
| Base UI (`@base-ui/react`)           | 1.9.0                                   | 2026-10-09 |
| React Aria (`react-aria-components`) | 1.22.1                                  | 2026-10-09 |

### Touch drag half to full to back: longest stall (ms)

Scoped to each drag's own active window (rule 10); the legacy, unscoped
numbers (a whole gesture, idle wait included) are in the `RESULTS.md`
artifact's "unscoped (legacy)" columns, kept there so the fix stays
checkable, not reproduced on this page.

| Deck       | load=0              | load=100            | load=200            |
| ---------- | ------------------- | ------------------- | ------------------- |
| drawerdeck | 33.3 (33.3-33.3)    | 116.7 (116.7-133.3) | 233.3 (216.7-233.3) |
| vaul       | 166.7 (166.7-166.7) | 166.7 (166.7-166.7) | 233.3 (216.7-233.3) |
| Base UI    | 33.3 (33.3-116.7)   | 116.7 (100.0-133.3) | 216.7 (200.0-233.3) |
| React Aria | 33.3 (33.3-33.3)    | 116.7 (116.7-133.3) | 216.7 (216.7-233.3) |

n=30 per cell. Overall: tie at every load (rule 7). At load=0, all six
shards agreed on drawerdeck, but the gap never cleared its own spread; at
load=100 the shards split between drawerdeck and Base UI; at load=200 the
shards split across Base UI, vaul and drawerdeck. Under heavy load,
drawerdeck's own pooled median (233.3 ms) reads above Base UI's and React
Aria's (216.7 ms each); the page still reports a tie there, not a
drawerdeck win, because that's what Overall says. A paired re-run of the
commit before non-modal drawers landed (#312)
([41220326440](https://github.com/pedrosousa13/deck-cool/actions/runs/41220326440))
measured the same 233.3 ms longest stall under heavy load, so this isn't a
regression from #312.

### Same scenario: dropped frames (%)

| Deck       | load=0        | load=100         | load=200         |
| ---------- | ------------- | ---------------- | ---------------- |
| drawerdeck | 0.0 (0.0-0.0) | 0.0 (0.0-2.3)    | 0.0 (0.0-3.7)    |
| vaul       | 0.0 (0.0-0.0) | 24.1 (0.0-29.6)  | 51.7 (49.6-71.4) |
| Base UI    | 0.0 (0.0-6.4) | 12.7 (0.0-28.2)  | 42.3 (34.4-66.2) |
| React Aria | 0.0 (0.0-0.0) | 19.6 (18.0-34.2) | 50.0 (28.9-69.5) |

n=30 per cell. Overall: tie at load=0 (all six shards agreed on drawerdeck,
but the gap didn't clear its own spread); drawerdeck wins outright at
load=100 and load=200, where agreement and gap both held.

### Touch flick dismiss: settle time (ms)

| Deck       | load=0                 | load=100               | load=200               |
| ---------- | ---------------------- | ---------------------- | ---------------------- |
| drawerdeck | 1016.5 (958.0-1382.0)  | 1167.0 (1144.0-1568.0) | 1400.5 (1381.0-1667.0) |
| vaul       | 1166.0 (1131.0-1196.0) | 1542.5 (1280.0-1677.0) | did not close          |
| Base UI    | 1147.5 (1102.0-1186.0) | did not close          | did not close          |
| React Aria | did not close          | did not close          | did not close          |

**Did not close:** Base UI (load=100, 200), React Aria (load=0, 100, 200)
and vaul (load=200) never reported itself closed in most of its reps at
that load ([#311](https://github.com/pedrosousa13/deck-cool/issues/311),
[#266](https://github.com/pedrosousa13/deck-cool/issues/266) rule 12), so
it is excluded from this scenario's winners and ties at that load. n=30
for the cells with a settle time. Overall: tie at load=0, where the shards
split between drawerdeck and Base UI; tie at load=100 too, where all six
shards agreed on drawerdeck but the gap didn't clear its own spread;
drawerdeck wins outright at load=200, where all six shards agreed and the
gap held. See "Who closes on a flick" above for which rivals report
closing at all.

### Mouse drag and release, upward throw: settle time (ms)

| Deck       | load=0              | load=100               | load=200               |
| ---------- | ------------------- | ---------------------- | ---------------------- |
| drawerdeck | 874.5 (834.0-888.0) | 900.5 (874.0-931.0)    | 1150.5 (1141.0-1172.0) |
| vaul       | 971.5 (942.0-986.0) | 1308.5 (1278.0-1427.0) | 1761.0 (1520.0-1771.0) |
| Base UI    | 973.5 (945.0-992.0) | 1096.5 (1050.0-1440.0) | 1548.0 (1323.0-1563.0) |
| React Aria | not supported       | not supported          | not supported          |

**Not supported:** React Aria did not respond to this gesture in most of
its reps ([#294](https://github.com/pedrosousa13/deck-cool/issues/294),
rule 11), so it is excluded from this scenario's winners and ties rather
than crowned for never moving. n=30 for the three decks that responded.
Overall: drawerdeck wins outright at every load (every shard agreed, gap
held each time).

### Open to settled half: settle time (ms)

| Deck       | load=0                | load=100               | load=200               |
| ---------- | --------------------- | ---------------------- | ---------------------- |
| drawerdeck | 889.0 (854.0-913.0)   | 937.0 (912.0-960.0)    | 1181.0 (1178.0-1186.0) |
| vaul       | 1036.0 (977.0-1049.0) | 1207.0 (1175.0-1229.0) | 1431.0 (1428.0-1435.0) |
| Base UI    | 985.0 (941.0-1014.0)  | 1080.0 (953.0-1081.0)  | 1180.5 (1178.0-1185.0) |
| React Aria | 935.5 (908.0-960.0)   | 943.0 (920.0-971.0)    | 1180.0 (1177.0-1184.0) |

n=30 per cell. Overall: tie at every load. At load=0, all six shards
agreed on drawerdeck, but the gap didn't clear its own spread; at
load=100, all six shards agreed on drawerdeck too, but the gap didn't
clear its own spread there either; at load=200 the shards split across
Base UI, React Aria and drawerdeck.

### Cost: bundle size (min+gzip, React external)

| Deck       | Size     |
| ---------- | -------- |
| drawerdeck | 6.83 KB  |
| vaul       | 22.58 KB |
| Base UI    | 30.92 KB |
| React Aria | 30.69 KB |

Overall: drawerdeck wins, by a wide margin; not a per-shard metric (the
build is the same on every shard), so there's no agreement question here.

### Per-shard agreement

Of the fifteen scored (scenario, load) cells above, all six shards agreed
on a single deck in eleven of them; the other four (the drag stall at
load=100 and load=200, flick dismiss at load=0, and open-to-half at
load=200) split across more than one deck. Agreement alone isn't enough to
win, though: five of those eleven unanimous cells (the drag stall at
load=0, dropped frames at load=0, flick dismiss at load=100, and
open-to-half at load=0 and load=100) still report "tie," because the gap
between the best and second-best medians never cleared the winning deck's
own spread across shards (rule 7). The other six unanimous cells are this
run's outright wins, all for drawerdeck: dropped frames at load=100 and
load=200, flick dismiss at load=200, and the mouse throw at every load.

### Where the earlier local runs went

This page used to carry two local runs instead of a CI run: the first on a
busy 4-core machine shared with other work, and a quieter re-run that still
scored a drawer's longest stall across its whole gesture, counting the idle
wait between two drags as if it were a stall. Both are dropped entirely
here, not kept for comparison: the busy machine's numbers were never
trustworthy, and the quiet re-run's own stall figure wasn't fair to compare
against a rival's, which is what rule 10's active-window scoring exists to
fix. The CI run above is what this page now trusts.

## How this page stays honest

The numbers above come from one named CI run
([41220329308](https://github.com/pedrosousa13/deck-cool/actions/runs/41220329308),
commit `4b588fa`), not from this page's own claims. `drawer-bench.yml` runs
the bench weekly, and the numbers here are re-run before every drawerdeck
release, against whatever `@drawerdeck/react` ships that release, not just
drawerdeck's first beta. A loss stays on this page until a re-run says
otherwise: this page does not drop a losing row to look better. Every
rival's adapter is checked into
[`decks/drawerdeck/bench/src/`](https://github.com/pedrosousa13/deck-cool/tree/main/decks/drawerdeck/bench/src),
and that project's own maintainers are invited to flag a misconfiguration
there.
