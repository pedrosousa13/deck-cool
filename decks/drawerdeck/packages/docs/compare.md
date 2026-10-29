---
title: Comparison with vaul and Base UI's Drawer
label: Compare
description: 'How drawerdeck compares with vaul and Base UI''s Drawer today: native scrolling against pointer-driven JavaScript, a feature table sourced from each project''s own docs, and bench numbers with their caveats.'
---

**Verdict today:** Base UI's Drawer is still the most complete and settles fastest, but its flick dismiss stops closing under heavy load. vaul has the shortest stall and the fewest dropped frames, both unloaded and under heavy load, but it is unmaintained and dropped one dismiss of fifteen under heavy load. drawerdeck is the smallest, with its React wrapper counted this time, and the only one of the three that closes a flick dismiss on every rep at every load, but it has the longest stall of the three and drops the most frames unloaded; it remains a beta with fewer features.

## At a glance

| Question | drawerdeck | vaul | Base UI Drawer | Winner |
| --- | --- | --- | --- | --- |
| Maintained? | Beta | No, last release Dec 2024 | Yes | **Base UI** |
| Features: all sides, non-modal, nesting, background indent, keyboard | Bottom, modal only | All | All | **Base UI**, **vaul** |
| Bundle size (min+gzip, React wrapper included) | 5.1 KB | 22.5 KB | 30.5 KB | **drawerdeck** |
| Dropped frames while dragging, heavy load | 49% | 23% | 57% | **vaul** |
| Dropped frames while dragging, no load | 9% | 0% | 4% | **vaul** |
| Longest stall while dragging, no load | 500 ms | 167 ms | 450 ms | **vaul** |
| Flick down closes it, under heavy load | Always | 4 of 5 | Failed 5 of 5 | **drawerdeck** |
| Open to half | 959 ms | 1066 ms | 576 ms | **Base UI** |
| Mouse throw to settled | 672 ms | 997 ms | 629 ms | **Base UI** |
| Built on native `<dialog>` and native scrolling | Yes | No | No | **drawerdeck** |
| React versions | 19 | 16.8 to 19 | 17 to 19 | **vaul** |

Numbers from the quiet re-run against the real `@drawerdeck/react` package ([#245](https://github.com/pedrosousa13/deck-cool/issues/245)): every run held a 1-minute load average at or under 1.0 (max 0.96), against the first run's 2.2 to 6.1. Medians of 5 runs in Chromium; the details and every caveat are below.

## Feature table

Every drawerdeck cell comes from its own source
(`@drawerdeck/core`, `@drawerdeck/react`) or its docs package. Every vaul
and Base UI cell comes from that project's own docs or source, linked
below.

| Feature | drawerdeck | vaul | Base UI Drawer |
| --- | --- | --- | --- |
| Maintained (last release) | Beta, unreleased (`0.0.0`, private). The engine landed in [#240](https://github.com/pedrosousa13/deck-cool/issues/240); the release is tracked in [#242](https://github.com/pedrosousa13/deck-cool/issues/242). | [1.1.2](https://github.com/emilkowalski/vaul/releases/tag/v1.1.2), 14 Dec 2024. Its [README](https://github.com/emilkowalski/vaul/blob/v1.1.2/README.md) says: "This repo is unmaintained... This was and always will be a hobby project." | `@base-ui/react` [1.9.0](https://www.npmjs.com/package/@base-ui/react), 9 Oct 2026 (npm). |
| React versions | React 19 only. React 18 is explicitly "not in the beta." | React 16.8 to 19 (`peerDependencies`: `^16.8 \|\| ^17.0 \|\| ^18.0 \|\| ^19.0.0 \|\| ^19.0.0-rc`). | React 17 to 19 (npm `peerDependencies`: `^17 \|\| ^18 \|\| ^19`). |
| Snap points | Yes. Fractions of the viewport height or fixed pixel strings, nearest first. | Yes. Numbers 0–1 as a fraction, or pixel values. | Yes. Numbers 0–1 as a fraction, greater than 1 as pixels, or `px`/`rem` strings. |
| Inner-content scroll handoff | Automatic. The inner scroller (`Drawer.Content`) is locked (`overflow-y: hidden`) until the drawer reaches its top snap point, then it scrolls natively. No attribute to add. | A per-event heuristic (`shouldDrag()`): drags the sheet unless the target has scrolled, has text selected, or carries `data-vaul-no-drag`. | Swipe applies to the whole panel by default; opt an element out with `data-base-ui-swipe-ignore` (optionally scoped to one axis). |
| Mouse drag | Yes. A dedicated handler for `pointerType === 'mouse'` only: a short velocity history and a 240ms eased throw onto the nearest snap point. | Yes. The same pointer/touch handling drives every input type; no mouse-specific path. | Yes. Pointer and touch events drive every input type. |
| Sides (bottom/top/left/right) | Bottom only. | All four (`direction` prop, default `'bottom'`). | All four (`swipeDirection` prop, default `'down'`). |
| Non-modal | No. Modal only. | Yes (`modal` prop: `true` or `false`). | Yes (`modal` prop: `true`, `false`, or `'trap-focus'`). |
| Nested drawers | No. | Yes (`nested` prop). | Yes. Dedicated `data-nested-drawer-open`/`data-nested-drawer-swiping` attributes and `--nested-drawers`/`--drawer-frontmost-height` CSS variables. |
| Background indent/scale | No. [ADR 0001](https://github.com/pedrosousa13/deck-cool/blob/main/decks/drawerdeck/docs/adr/0001-native-scrolling-is-the-engine.md) found that a scroll-driven animation does not resolve across the top layer, so "a background indent needs JS, or a different structure", not built yet. | Yes (`shouldScaleBackground` prop). | Yes. `Drawer.Provider`, `Drawer.IndentBackground` and `Drawer.Indent` scale the background when a drawer opens. |
| On-screen keyboard handling | Not yet. Listed as still open in [#230](https://github.com/pedrosousa13/deck-cool/issues/230) and the "Why native scrolling" guide. | Yes. Repositions the drawer on `visualViewport` resize (`repositionInputs`, on by default once `snapPoints` is set). | Yes. `Drawer.VirtualKeyboardProvider` gives keyboard-aware focus and scroll handling, and sets `--drawer-keyboard-inset`. |
| Uses `<dialog>`/top layer | Yes. `Drawer.Popup` renders a `<dialog>`, opened with `showModal()`: the top layer, focus trap and Escape for free. | No. Built on `@radix-ui/react-dialog`: a `<div>`, not the native element. | No. A custom `<div>`-based implementation. |
| Drag engine | Native CSS scroll-snap drives touch, wheel and trackpad. Mouse alone gets a JS pointer handler, because a mouse cannot drag a scroll container. | JS pointer and touch events throughout: writes `translate3d` on every move. | JS pointer and touch events throughout: writes `--drawer-swipe-movement-x`/`-y` CSS variables that drive a transform. |
| Headless/unstyled | Yes. | Yes. | Yes. |
| Bundle size (min+gzip, React external) | 5.05 KB: the real `@drawerdeck/react` plus `@drawerdeck/core` underneath it, built from `main` and packed, with `react`, `react-dom` and `react/jsx-runtime` external, the same as the rivals. | 22.48 KB (`vaul` 1.1.2). | 30.47 KB (`@base-ui/react` 1.9.0, the `Drawer` export). |

## The benchmark

Branch [`prototype/drawer-bench`](https://github.com/pedrosousa13/deck-cool/tree/prototype/drawer-bench),
full write-up at
[`decks/carouseldeck/prototypes/drawer-bench/RESULTS.md`](https://github.com/pedrosousa13/deck-cool/blob/prototype/drawer-bench/decks/carouseldeck/prototypes/drawer-bench/RESULTS.md),
commit `59dff00`. Answers
[#233](https://github.com/pedrosousa13/deck-cool/issues/233) and its quiet
re-run, [#245](https://github.com/pedrosousa13/deck-cool/issues/245), part
of the drawerdeck map ([#230](https://github.com/pedrosousa13/deck-cool/issues/230)).

**Method.** A Chromium trace scores each run's longest visual stall, its
hitch ratio and its percent of dropped frames. Touch gestures use Chrome
DevTools Protocol's trusted touch input, not simulated events. Every
scenario runs at three main-thread loads: none, a 100ms busy-loop tick,
and a 200ms tick, 5 reps each. Tables below are the median, with the
min–max spread in parentheses. All three drawers render the same 50-row
content, the same snap points (half and full), and the same bench-owned
probe for "openness," so a native-scroll drawer, a `translate3d` drawer
and a CSS-variable drawer are all read the same way.

### First run, on a busy 4-core machine: history

The first run ([#233](https://github.com/pedrosousa13/deck-cool/issues/233))
shared its machine with other work (load average 2.2 to 6.1 on 4 cores,
against a quiet run's under 1.0) and benched drawerdeck's ported
mechanics, not the shipped package, so its size row had no React wrapper
either. Its full tables are kept in RESULTS.md at the bench's commit
`5216788`, for the record. Every table below is the quiet re-run instead
([#245](https://github.com/pedrosousa13/deck-cool/issues/245)), and is
what this page now trusts.

### Quiet run, against the real package

Every run held a 1-minute load average (`uptime`, checked before starting)
at or under 1.0, max 0.96. drawerdeck's rows are the real
`@drawerdeck/react` plus `@drawerdeck/core`, built from `main` and packed,
driven only through `Drawer.*`'s public API.

**Touch drag half → full → back: longest stall (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 500 (500–517) | 567 (567–600) | 583 (567–767) |
| vaul | 167 (167–167) | 167 (167–167) | 217 (217–417) |
| Base UI | 450 (450–450) | 483 (450–500) | 517 (483–517) |

drawerdeck's stall barely moved from the busy run (517ms to 500ms at
load=0): the quiet machine does not explain it. [#243](https://github.com/pedrosousa13/deck-cool/issues/243)
looked for the cause in the trace and could not find one, because no run
of this bench has ever kept a trace file; see "numbers we don't trust"
below.

**Same scenario: dropped frames (%)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 9 (6–11) | 20 (14–26) | 49 (42–54) |
| vaul | 0 (0–3) | 29 (12–38) | 23 (10–45) |
| Base UI | 4 (2–4) | 20 (17–24) | 57 (54–58) |

**Touch flick down from half: settle time (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 766 (757–1444) | 1134 (1123–1741) | 1579 (1108–1607) |
| vaul | 1186 (1154–1219) | 1405 (1352–1432) | 1745 (1736–2006) |
| Base UI | 865 (844–899) | 918 (912–1053) | 1408 (1183–1435) |

**Same scenario: ended closed? (fail count of 5 reps, by load)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 0 of 5 | 0 of 5 | 0 of 5 |
| vaul | 0 of 5 | 0 of 5 | 1 of 5 |
| Base UI | 0 of 5 | 3 of 5 | 5 of 5 |

**Mouse drag and release, upward throw: settle time (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 672 (657–692) | 827 (743–878) | 859 (848–1096) |
| vaul | 997 (992–1004) | 1393 (1290–1406) | 1746 (1744–1762) |
| Base UI | 629 (628–647) | 642 (630–662) | 925 (899–935) |

**Open to settled half: settle time (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 959 (953–990) | 938 (926–957) | 1169 (1158–1171) |
| vaul | 1066 (1049–1075) | 1193 (1185–1203) | 1418 (1412–1419) |
| Base UI | 576 (567–596) | 632 (630–638) | 918 (915–919) |

**Cost: bundle size (min+gzip)**

| Deck | Size | Notes |
| --- | --- | --- |
| drawerdeck | 5.05 KB | `@drawerdeck/react` + `@drawerdeck/core`, React/react-dom/jsx-runtime external |
| vaul 1.1.2 | 22.48 KB | same externals |
| Base UI Drawer 1.9.0 | 30.47 KB | same externals |

**Cost: script time per frame during the touch drag (LoAF total blocking, median of 5)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 0 ms / 0 | 654 ms / 13 | 3167 ms / 21 |
| vaul | 0 ms / 0 | 567 ms / 11 | 2705 ms / 18 |
| Base UI | 0 ms / 0 | 557 ms / 11 | 3005 ms / 20 |

All three show zero at load=0: no library's own drag handling blocks a
frame past LoAF's 50ms threshold during ordinary use. The loaded columns
track the injected busy loop's own cost, not a difference between the
three libraries.

### Where drawerdeck loses

- **Longest stall during the half ↔ full drag, at every load.** vaul is
  roughly 3x shorter (167–217ms against drawerdeck's 500–583ms), and
  Base UI also beats drawerdeck here (450–517ms). drawerdeck does not win
  this metric at any load, and the quiet machine does not close the gap:
  drawerdeck's own figure barely moved from the busy run. See
  [#243](https://github.com/pedrosousa13/deck-cool/issues/243): no run of
  this bench has kept a trace, so the cause is still open.
- **Dropped frames while dragging, with no load.** drawerdeck is worst of
  the three unloaded (9%, against vaul's 0% and Base UI's 4%).
- **Dropped frames while dragging, under heavy load, too.** Quiet,
  vaul is now the least-dropped at load=200 (23%), with drawerdeck (49%)
  and Base UI (57%) both well behind it. The busy run's reading that
  drawerdeck degraded the least steeply does not hold up quiet: that was
  the busy machine hurting vaul's own numbers specifically, not a
  property of drawerdeck's frame scheduling under load.
- **Settle time for a mouse-drag throw, and for opening to half.** Base
  UI is still faster at both, at every load tested, though the margin on
  the mouse throw narrowed a great deal (629ms against drawerdeck's
  672ms at load=0, down from 690ms against 1053ms in the first run).
  Opening to half stayed a clear Base UI win (576ms against drawerdeck's
  959ms at load=0). vaul is slower than drawerdeck at both, so this is a
  Base UI difference, not a two-rivals-beat-drawerdeck pattern.

### Where drawerdeck wins

- **Dismiss reliability under load, outright.** `touch-flick-dismiss`
  closed on every one of drawerdeck's 15 reps, at every load. vaul lost
  one of its 15 (one rep at load=200 settled back open) that it did not
  lose in the first run; Base UI's did not close reliably at all once
  loaded, settling back to half on 3 of 5 reps at load=100 and 5 of 5 at
  load=200.
- **Settle time for the touch-flick dismiss, at no load.** drawerdeck is
  now fastest here (766ms, against Base UI's 865ms and vaul's 1186ms),
  where the first run's ported mechanics had it slowest of the three.
  The real package's settle logic is not the code the first run
  benched.
- **Bundle size, on equal terms this time.** With its React wrapper
  counted (5.05 KB, `@drawerdeck/react` plus `@drawerdeck/core`),
  drawerdeck is still the smallest of the three by a wide margin against
  vaul's 22.48 KB and Base UI's 30.47 KB: a real win now, not a
  difference in kind.

### Numbers we don't trust, and why

- **No run of this bench has ever kept a trace.** `bench/bench.spec.ts`
  captures each run's CDP trace in memory, reduces it to the summary
  numbers in this page's tables, and never writes the raw events to
  disk. [#243](https://github.com/pedrosousa13/deck-cool/issues/243)
  asked whether drawerdeck's longest-stall figure is a real stall or the
  scenario's own idle pause between its two drags; without a trace, that
  stays open.
- **The longest-stall figure spans a whole gesture, not just the drag.**
  It includes the mid-run settle wait between the two drags, so a gap
  can be genuine idle time as much as a real stall. Read the
  within-deck, across-load comparison, not the absolute figure.
- **Script time per frame (LoAF) at load=100/200 is dominated by the
  injected load, not by a library's own cost**. The same finding
  carouseldeck's own bench made. The load=0 column, where all three show
  zero, is the real, comparable figure.
- **Input-to-first-moved-frame and blank/seam-frame counts are not
  measured** for any deck here (a drawer has no seam; the input mark was
  not armed).
- **Chromium only.** Two of the four scenarios need trusted touch input,
  which Playwright only gives on Chromium. Nothing here says anything
  about Safari, iOS or Firefox.
- **Headless Chromium paces frames with a timer**, not a real display's
  vsync: absolute ms figures are comparative within this run, not a
  device's real frame budget.

**Reproduce it:** RESULTS.md's own "Exact commands to re-run" has the full
steps, including packing the real `@drawerdeck/react` and
`@drawerdeck/core` from `main` before installing the bench.

## How this page stays honest

The numbers above come from the bench at commit `59dff00` on
`prototype/drawer-bench`, not from this page's own claims. They are
re-run before every drawerdeck release, against whatever `@drawerdeck/react`
ships that release, not just drawerdeck's first beta. A loss stays on this
page until a re-run says otherwise: this page does not drop a losing row
to look better.
