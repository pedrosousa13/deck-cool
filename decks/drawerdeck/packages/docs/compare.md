---
title: Comparison with vaul and Base UI's Drawer
label: Compare
description: 'How drawerdeck compares with vaul and Base UI''s Drawer today: native scrolling against pointer-driven JavaScript, a feature table sourced from each project''s own docs, and bench numbers with their caveats.'
---

**Verdict today:** Base UI's Drawer is the most complete and settles fastest. drawerdeck is the smallest and stays smoothest under heavy load, but it is a beta with fewer features. vaul is unmaintained. drawerdeck's numbers below come from a first bench run on a busy machine, so treat them as provisional until the quiet re-run lands.

## At a glance

| Question | drawerdeck | vaul | Base UI Drawer | Winner |
| --- | --- | --- | --- | --- |
| Maintained? | Beta | No, last release Dec 2024 | Yes | **Base UI** |
| Features: all sides, non-modal, nesting, background indent, keyboard | Bottom, modal only | All | All | **Base UI**, **vaul** |
| Bundle size (min+gzip) | 2.3 KB* | 22.5 KB | 30.5 KB | **drawerdeck*** |
| Dropped frames while dragging, heavy load | 49% | 68% | 58% | **drawerdeck*** |
| Dropped frames while dragging, no load | 6% | 0% | 2% | **vaul** |
| Longest stall while dragging, no load | 517 ms | 167 ms | 450 ms | **vaul** |
| Flick down closes it, under heavy load | Always | Always | Failed 5 of 5 | **drawerdeck**, **vaul** |
| Open to half | 931 ms | 1059 ms | 592 ms | **Base UI** |
| Mouse throw to settled | 1053 ms | 1105 ms | 690 ms | **Base UI** |
| Built on native `<dialog>` and native scrolling | Yes | No | No | **drawerdeck** |
| React versions | 19 | 16.8 to 19 | 17 to 19 | **vaul** |

\* Provisional. drawerdeck's size was measured without its React wrapper, and its bench runs shared the machine with other work (load 5 to 6 on 4 cores against the rivals' 3 to 4). The quiet re-run against the real package replaces these. Medians of 5 runs in Chromium; the details and every caveat are below.

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
| Bundle size (min+gzip, React external) | 2.34 KB: measured as plain JS/TS with no React wrapper (the beta had none yet when this ran). See "numbers we don't trust" below: the quiet re-run measures the real `@drawerdeck/react` package instead. | 22.48 KB (`vaul` 1.1.2). | 30.47 KB (`@base-ui/react` 1.9.0, the `Drawer` export). |

## The benchmark

Branch [`prototype/drawer-bench`](https://github.com/pedrosousa13/deck-cool/tree/prototype/drawer-bench),
full write-up at
[`decks/carouseldeck/prototypes/drawer-bench/RESULTS.md`](https://github.com/pedrosousa13/deck-cool/blob/prototype/drawer-bench/decks/carouseldeck/prototypes/drawer-bench/RESULTS.md),
commit `5216788`. Answers
[#233](https://github.com/pedrosousa13/deck-cool/issues/233), part of the
drawerdeck map ([#230](https://github.com/pedrosousa13/deck-cool/issues/230)).

**Method.** A Chromium trace scores each run's longest visual stall, its
hitch ratio and its percent of dropped frames. Touch gestures use Chrome
DevTools Protocol's trusted touch input, not simulated events. Every
scenario runs at three main-thread loads: none, a 100ms busy-loop tick,
and a 200ms tick, 5 reps each. Tables below are the median, with the
min–max spread in parentheses. All three drawers render the same 50-row
content, the same snap points (half and full), and the same bench-owned
probe for "openness," so a native-scroll drawer, a `translate3d` drawer
and a CSS-variable drawer are all read the same way.

### First run, on a busy 4-core machine: provisional

This machine was not quiet: load average (`uptime`, checked before every
scenario) ranged from 2.2 to 6.1 across the run, shared with other work.
Read the comparison across drawers at the same load as the trustworthy
signal, not any single absolute number. A quiet re-run, against the real
`@drawerdeck/react` package, is in progress
([#245](https://github.com/pedrosousa13/deck-cool/issues/245)): its
tables go in the spot marked below once they land.

**Touch drag half → full → back: longest stall (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 517 (500–533) | 567 (567–583) | 583 (567–767) |
| vaul | 167 (167–167) | 167 (167–167) | 217 (217–217) |
| Base UI | 450 (450–467) | 450 (433–500) | 500 (483–533) |

**Same scenario: dropped frames (%)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 6 (6–9) | 9 (6–28) | 49 (47–57) |
| vaul | 0 (0–0) | 20 (0–43) | 68 (28–71) |
| Base UI | 2 (0–4) | 18 (2–24) | 58 (53–58) |

**Touch flick down from half: settle time (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 1151 (1097–1497) | 1705 (1229–1753) | 1834 (1595–1844) |
| vaul | 1189 (1180–1195) | 1398 (1387–1420) | 1747 (1740–1762) |
| Base UI | 889 (846–917) | 1054 (1034–1154) | 1623 (1398–1659) |

**Same scenario: ended closed? (px still open, 0 = closed)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| vaul | 0 (0–0) | 0 (0–0) | 0 (0–0) |
| Base UI | 0 (0–0) | 0 (0–380) | 380 (380–380) |

**Mouse drag and release, upward throw: settle time (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 1053 (1037–1104) | 1235 (1169–1333) | 1552 (1107–2263) |
| vaul | 1105 (1039–1129) | 1351 (1346–1377) | 1738 (1413–1965) |
| Base UI | 690 (625–736) | 678 (655–883) | 895 (880–1314) |

**Open to settled half: settle time (ms)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 931 (907–953) | 904 (903–921) | 1150 (1145–1153) |
| vaul | 1059 (1057–1096) | 1201 (1198–1206) | 1419 (1411–1419) |
| Base UI | 592 (576–613) | 638 (624–647) | 904 (900–923) |

**Cost: bundle size (min+gzip)**

| Deck | Size | Notes |
| --- | --- | --- |
| drawerdeck | 2.34 KB | plain JS/TS, no React wrapper |
| vaul 1.1.2 | 22.48 KB | React/react-dom/jsx-runtime external |
| Base UI Drawer 1.9.0 | 30.47 KB | same externals |

**Cost: script time per frame during the touch drag (LoAF total blocking, median of 5)**

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 0 ms / 0 | 603 ms / 12 | 3309 ms / 22 |
| vaul | 0 ms / 0 | 507 ms / 10 | 3007 ms / 20 |
| Base UI | 0 ms / 0 | 552 ms / 11 | 3006 ms / 20 |

All three show zero at load=0: no library's own drag handling blocks a
frame past LoAF's 50ms threshold during ordinary use. The loaded columns
track the injected busy loop's own cost, not a difference between the
three libraries.

### Quiet run: not posted yet

[#245](https://github.com/pedrosousa13/deck-cool/issues/245) is running
now, against the real `@drawerdeck/react` package. This section will
carry its tables once they post; until then, the first run above is
history, not the number to trust for loaded scenarios.

### Where drawerdeck loses

- **Longest stall during the half ↔ full drag, at every load.** vaul is
  roughly 3x shorter (167–217ms against drawerdeck's 517–583ms), and
  Base UI also beats drawerdeck here (450–500ms). drawerdeck does not win
  this metric at any load.
- **Settle time for a mouse-drag throw, and for opening to half.** Base
  UI is faster at both, at every load tested: roughly 1.5x on the mouse
  throw (690ms against 1053ms at load=0) and on opening (592ms against
  931ms at load=0). vaul is slower than drawerdeck at both of these, so
  this is a Base UI difference, not a two-rivals-beat-drawerdeck pattern.
- **Settle time for the touch-flick dismiss.** Base UI is fastest here
  too (889ms against drawerdeck's 1151ms at load=0), though see "where
  drawerdeck wins": Base UI's dismiss stopped landing reliably at higher
  load, so its speed advantage here comes with a reliability cost
  drawerdeck and vaul do not have.
- **Bundle size, on its own terms.** drawerdeck's 2.34 KB has no React
  wrapper at all, so it is not a fair comparison to vaul's 22.48 KB or
  Base UI's 30.47 KB as shipped React components. Noted as a difference
  in kind, not scored as a win.

### Where drawerdeck wins

- **Dismiss reliability under load.** `touch-flick-dismiss` closed on
  every one of drawerdeck's and vaul's 15 reps, at every load. Base UI's
  did not: at load=200 it settled back to half (380px, still open) on
  every rep, and on one of five reps at load=100.
- **Dropped-frame resistance to load, relative to its own baseline.**
  drawerdeck's dropped-frame percentage rises from 6% (load=0) to 49%
  (load=200), roughly 8x; vaul's rises from 0% to 68%, and Base UI's from
  2% to 58%. drawerdeck is not the least-dropped unloaded, but degrades
  the least steeply and ends up least-dropped at load=200, though the
  margin (49% against 58%/68%) is not large, and this run's machine was
  not quiet.

### Numbers we don't trust, and why

- **This machine was not quiet.** Load averaged 2.2–6.1 across the run.
  Absolute figures are this run's own; within-row comparisons (same
  scenario, same load, across drawers) are more trustworthy than any
  single number, and the loaded cells have not had the quiet re-run
  [#219](https://github.com/pedrosousa13/deck-cool/issues/219) asked for.
- **The longest-stall figure spans a whole gesture, not just the drag.**
  It includes the mid-run settle wait between the two drags, so a gap can
  be genuine idle time as much as a real stall. Read the within-deck,
  across-load comparison, not the absolute figure.
- **Script time per frame (LoAF) at load=100/200 is dominated by the
  injected load, not by a library's own cost**. The same finding
  carouseldeck's own bench made. The load=0 column, where all three show
  zero, is the real, comparable figure.
- **drawerdeck's bundle size has no React wrapper**, so it is a
  difference in kind against vaul's and Base UI's shipped React
  components, not a size win.
- **Input-to-first-moved-frame and blank/seam-frame counts are not
  measured** for any deck here (a drawer has no seam; the input mark was
  not armed).
- **Chromium only.** Two of the four scenarios need trusted touch input,
  which Playwright only gives on Chromium. Nothing here says anything
  about Safari, iOS or Firefox.
- **Headless Chromium paces frames with a timer**, not a real display's
  vsync: absolute ms figures are comparative within this run, not a
  device's real frame budget.

**Reproduce it**, from `decks/carouseldeck/prototypes/drawer-bench/`:

```sh
pnpm install   # once, from the repo root: installs vaul and @base-ui/react here
pnpm build
pnpm exec playwright install chromium   # once
uptime         # check the load before any timing run

pnpm exec playwright test -c bench/playwright.config.ts bench/bench.spec.ts
node bench/bundle-size.mjs
python3 bench/report.py bench/results
```

## How this page stays honest

The numbers above come from the bench at commit `5216788` on
`prototype/drawer-bench`, not from this page's own claims. They are
re-run before every drawerdeck release, against whatever `@drawerdeck/react`
ships that release, not just drawerdeck's first beta. A loss stays on this
page until a re-run says otherwise: this page does not drop a losing row
to look better.
