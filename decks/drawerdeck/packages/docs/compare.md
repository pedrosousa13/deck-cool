---
title: Comparison with vaul, Base UI's Drawer and React Aria's Sheet
label: Compare
description: 'How drawerdeck compares with vaul, Base UI''s Drawer and React Aria''s Sheet today: native scrolling against pointer-driven JavaScript, a feature table sourced from each project''s own docs, and the first fair, CI-run bench numbers with their caveats.'
---

**Verdict today:** the first CI run has drawerdeck winning bundle size and dropped frames under heavy load, tying longest stall and flick-dismiss settle time at every load (and mouse-throw and open-to-half under heavy load too), and losing mouse-throw and open-to-half to Base UI at no and medium load. [#268](https://github.com/pedrosousa13/deck-cool/issues/268) tracks closing the open gap, [#269](https://github.com/pedrosousa13/deck-cool/issues/269) the mouse-throw gap, and [#296](https://github.com/pedrosousa13/deck-cool/issues/296) drawerdeck's flick-dismiss settle time, numerically the slowest of the four at no load even though the run calls it a tie.

## At a glance

| Question | drawerdeck | vaul | Base UI Drawer | React Aria Sheet | Winner |
| --- | --- | --- | --- | --- | --- |
| Bundle size (min+gzip, React external) | 5.21 KB | 22.51 KB | 30.51 KB | 30.59 KB | **drawerdeck** |
| Dropped frames while dragging, no load | 0.0% | 0.0% | 0.0% | 3.4% | Tie |
| Dropped frames while dragging, medium load (100ms busy tick) | 0.0% | 0.0% | 17.1% | 20.5% | Tie |
| Dropped frames while dragging, heavy load (200ms busy tick) | 0.0% | 22.4% | 58.3% | 47.9% | **drawerdeck** |
| Longest stall while dragging, no load | 33.3 ms | 166.7 ms | 33.3 ms | 33.3 ms | Tie |
| Flick down closes it: settle time, no load | 1010.5 ms | 1154.0 ms | 840.0 ms | 730.5 ms | Tie |
| Mouse throw: settle time, no load | 876.5 ms | 957.5 ms | 606.0 ms | not supported | **Base UI** |
| Open to half: settle time, no load | 904.0 ms | 1020.0 ms | 535.5 ms | 927.5 ms | **Base UI** |
| Maintained? | Beta | No, last release Dec 2024 | Yes | Yes (Adobe) | **Base UI**, **React Aria** |
| Features: all sides, non-modal, nesting, background indent, keyboard | Bottom, modal only | All | All | Most (no non-modal option; only a nested sheet's own backdrop and parent scale back, not the page behind a single sheet) | **Base UI**, **vaul** |
| Built on native `<dialog>` and native scrolling | Yes | No | No | No (a scrollable overlay driven by CSS scroll-snap, not `<dialog>`) | **drawerdeck** |
| React versions | 18 to 19 | 16.8 to 19 | 17 to 19 | 16.8 to 19 | **vaul**, **React Aria** |

The Winner column is copied from the "Overall" column of the bench's own per-shard winners table (below): a "tie" there means the six shards disagreed on a winner, or the gap between the best and second-best pooled medians didn't clear the winning deck's own spread across shards. A tie is never shown as a win here, whichever deck's number happens to read lowest.

## Feature table

Every drawerdeck cell comes from its own source
(`@drawerdeck/core`, `@drawerdeck/react`) or its docs package. Every vaul,
Base UI and React Aria cell comes from that project's own docs or source,
linked below.

| Feature | drawerdeck | vaul | Base UI Drawer | React Aria Sheet |
| --- | --- | --- | --- | --- |
| Maintained (last release) | Beta, unreleased (`0.0.0`, private). The engine landed in [#240](https://github.com/pedrosousa13/deck-cool/issues/240); the release is tracked in [#242](https://github.com/pedrosousa13/deck-cool/issues/242). | [1.1.2](https://github.com/emilkowalski/vaul/releases/tag/v1.1.2), 14 Dec 2024. Its [README](https://github.com/emilkowalski/vaul/blob/v1.1.2/README.md) says: "This repo is unmaintained... This was and always will be a hobby project." | `@base-ui/react` [1.9.0](https://www.npmjs.com/package/@base-ui/react), 9 Oct 2026 (npm). | `react-aria-components` [1.22.1](https://www.npmjs.com/package/react-aria-components), 9 Oct 2026 (npm), Apache-2.0, built and maintained by Adobe. |
| React versions | React 18 and 19. `@drawerdeck/react` is for React 19 alone; `@drawerdeck/react-18` (`peerDependencies`: `>=18 <20`) builds the same source for React 18 too. | React 16.8 to 19 (`peerDependencies`: `^16.8 \|\| ^17.0 \|\| ^18.0 \|\| ^19.0.0 \|\| ^19.0.0-rc`). | React 17 to 19 (npm `peerDependencies`: `^17 \|\| ^18 \|\| ^19`). | React 16.8 to 19 (npm `peerDependencies`: `^16.8.0 \|\| ^17.0.0-rc.1 \|\| ^18.0.0 \|\| ^19.0.0-rc.1`). |
| Snap points | Yes. Fractions of the viewport height or fixed pixel strings, nearest first. | Yes. Numbers 0-1 as a fraction, or pixel values. | Yes. Numbers 0-1 as a fraction, greater than 1 as pixels, or `px`/`rem` strings. | Yes. `snapPoints`: a bare number as pixels of the sheet visible, a CSS length, or a percentage, "relative to the size of the sheet" ([react-aria.adobe.com/Sheet](https://react-aria.adobe.com/Sheet)), not the viewport; the bench bounds `Sheet`'s own box to `100dvh` first so its percentages match the other three decks' fractions of the viewport. |
| Inner-content scroll handoff | Automatic. The inner scroller (`Drawer.Content`) is locked (`overflow-y: hidden`) until the drawer reaches its top snap point, then it scrolls natively. No attribute to add. | A per-event heuristic (`shouldDrag()`): drags the sheet unless the target has scrolled, has text selected, or carries `data-vaul-no-drag`. | Swipe applies to the whole panel by default; opt an element out with `data-base-ui-swipe-ignore` (optionally scoped to one axis). | Not documented on its docs or blog post; the sheet's own drag already is native scrolling (see "Drag engine" below), so there's no separate handoff to describe. |
| Mouse drag | Yes. A dedicated handler for `pointerType === 'mouse'` only: a short velocity history and a 240ms eased throw onto the nearest snap point. | Yes. The same pointer/touch handling drives every input type; no mouse-specific path. | Yes. Pointer and touch events drive every input type. | No (the bench measured it not responding): neither [react-aria.adobe.com/Sheet](https://react-aria.adobe.com/Sheet) nor the [blog post](https://react-aria.adobe.com/blog/sheet) mentions mouse dragging, and a plain `overflow-y: auto` scroll container does not turn a left-button press-move-release into a scroll in Chromium the way touch or a trackpad pan does. |
| Sides (bottom/top/left/right) | Bottom only. | All four (`direction` prop, default `'bottom'`). | All four (`swipeDirection` prop, default `'down'`). | All four, plus `'center'`, and `'start'`/`'end'` ("mirrored in right-to-left locales") (`position` prop: `'bottom' \| 'top' \| 'left' \| 'right' \| 'start' \| 'end' \| 'center'`). |
| Non-modal | No. Modal only. | Yes (`modal` prop: `true` or `false`). | Yes (`modal` prop: `true`, `false`, or `'trap-focus'`). | Not documented. `Sheet` has no modal prop; `preventDismissal` blocks Escape, outside-press and swipe dismissal, but there's no option to render it non-modal. |
| Nested drawers | No. | Yes (`nested` prop). | Yes. Dedicated `data-nested-drawer-open`/`data-nested-drawer-swiping` attributes and `--nested-drawers`/`--drawer-frontmost-height` CSS variables. | Yes. Sheets stack by nesting one `SheetTrigger` inside another; a parent sheet scales back when a child opens (`stackAnimation`), tracked by `data-stack-index`. |
| Background indent/scale | No. [ADR 0001](https://github.com/pedrosousa13/deck-cool/blob/main/decks/drawerdeck/docs/adr/0001-native-scrolling-is-the-engine.md) found that a scroll-driven animation does not resolve across the top layer, so "a background indent needs JS, or a different structure", not built yet. | Yes (`shouldScaleBackground` prop). | Yes. `Drawer.Provider`, `Drawer.IndentBackground` and `Drawer.Indent` scale the background when a drawer opens. | Partial. `SheetBackdrop` dims only the bottom-most sheet in a stack, and a parent sheet scales back behind a nested child (`stackAnimation`); there's no option to indent or scale the page itself behind a single, non-nested sheet. |
| On-screen keyboard handling | Not yet. Listed as still open in [#230](https://github.com/pedrosousa13/deck-cool/issues/230) and the "Why native scrolling" guide. | Yes. Repositions the drawer on `visualViewport` resize (`repositionInputs`, on by default once `snapPoints` is set). | Yes. `Drawer.VirtualKeyboardProvider` gives keyboard-aware focus and scroll handling, and sets `--drawer-keyboard-inset`. | Yes. Pads the sheet (`padding-bottom: calc(100dvh - var(--visual-viewport-height))`) so the keyboard doesn't push the page. |
| Uses `<dialog>`/top layer | Yes. `Drawer.Popup` renders a `<dialog>`, opened with `showModal()`: the top layer, focus trap and Escape for free. | No. Built on `@radix-ui/react-dialog`: a `<div>`, not the native element. | No. A custom `<div>`-based implementation. | No. `Sheet` is a scrollable overlay (a styled `<div>`), not `<dialog>`; its [blog post](https://react-aria.adobe.com/blog/sheet) says it is "double the height of the window viewport, and positioned so that only the top half is visible, with the sheet in the bottom half." |
| Drag engine | Native CSS scroll-snap drives touch, wheel and trackpad. Mouse alone gets a JS pointer handler, because a mouse cannot drag a scroll container. | JS pointer and touch events throughout: writes `translate3d` on every move. | JS pointer and touch events throughout: writes `--drawer-swipe-movement-x`/`-y` CSS variables that drive a transform. | Native CSS scroll-snap and `view-timeline`, like drawerdeck's own engine, but with no mouse path: its [blog post](https://react-aria.adobe.com/blog/sheet) says "Scrolling is All You Need", so "swipe gestures run off the main thread at the native display refresh rate without any JavaScript touch handling." |
| Headless/unstyled | Yes. | Yes. | Yes. | Yes. |
| Bundle size (min+gzip, React external) | 5.21 KB: the real `@drawerdeck/react` plus `@drawerdeck/core`, built from `main` and packed, with `react`, `react-dom` and `react/jsx-runtime` external, the same as the rivals. | 22.51 KB (`vaul` 1.1.2). | 30.51 KB (`@base-ui/react` 1.9.0, the `Drawer` export). | 30.59 KB (`react-aria-components` 1.22.1, the `Sheet` subpath export: `Sheet`, `SheetTrigger`, `SheetOverlay`, `SheetBackdrop`, `SheetContent`), the whole cost of importing `Sheet`: overlays, focus management, everything else it pulls in. |

## The benchmark

Answers [#266](https://github.com/pedrosousa13/deck-cool/issues/266) and
[#283](https://github.com/pedrosousa13/deck-cool/issues/283), part of the
drawerdeck map ([#230](https://github.com/pedrosousa13/deck-cool/issues/230)).
Full write-up, including all 11 fairness rules in full, at
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
[40858353381](https://github.com/pedrosousa13/deck-cool/actions/runs/40858353381)
of `drawer-bench.yml`, on commit `6772ebe`, scored against all 11 fairness
rules below. Six parallel, dedicated `ubuntu-latest` shards (never a
machine shared with other work), each running the complete interleaved
bench with 5 reps per (scenario, load, deck) cell; every rep's own run
order is reshuffled fresh, so no deck's reps land disproportionately on a
busier or quieter stretch of a shard's run. Pooled across all six shards:
1440 scored rows, n=30 per cell (a discarded warm-up rep per page excluded).

**The 11 fairness rules** ([#266](https://github.com/pedrosousa13/deck-cool/issues/266),
full text in RESULTS.md):

1. Same runner, interleaved: one Playwright worker, foreground, every rep's run order freshly shuffled.
2. Production builds for everyone: `vite build`, one shared React version, no `<StrictMode>`.
3. Each rival configured the way its own docs recommend, with every non-default option listed and why.
4. The same task: the same content, snap points and viewport for every deck, with React Aria's one documented exception (percentage strings, not bare fractions).
5. Latest stable versions, pinned, with release dates.
6. A warm-up rep, discarded.
7. Ties are ties: a winner needs every shard to agree, and a gap bigger than the winning deck's own spread.
8. Reproducible and reviewable: every adapter is checked in, and raw results, the pooled jsonl and every rep's trace are uploaded.
9. Losses stay visible: every metric is printed for every deck, win or lose.
10. Stalls score motion, not a scripted pause: only a gesture's own active window counts.
11. A drawer that does not respond to a gesture cannot win it (React Aria's mouse throw, below).

**Versions, with release dates**

| Deck | Version | Released |
| --- | --- | --- |
| drawerdeck | this commit (`workspace:*`, unreleased) | - |
| vaul | 1.1.2 | 2024-12-14 |
| Base UI (`@base-ui/react`) | 1.9.0 | 2026-10-09 |
| React Aria (`react-aria-components`) | 1.22.1 | 2026-10-09 |

### Touch drag half to full to back: longest stall (ms)

Scoped to each drag's own active window (rule 10); the legacy, unscoped
numbers (a whole gesture, idle wait included) are in the `RESULTS.md`
artifact's "unscoped (legacy)" columns, kept there so the fix stays
checkable, not reproduced on this page.

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 33.3 (33.3-33.3) | 125.0 (116.7-133.3) | 233.3 (216.7-250.0) |
| vaul | 166.7 (166.7-166.7) | 166.7 (166.7-166.7) | 216.7 (216.7-233.3) |
| Base UI | 33.3 (33.3-33.3) | 116.7 (116.7-116.7) | 216.7 (200.0-233.3) |
| React Aria | 33.3 (33.3-33.3) | 133.3 (116.7-133.3) | 233.3 (233.3-250.0) |

n=30 per cell. Overall: tie at every load (rule 7: every shard agreed, but
the gap never cleared the winning deck's own spread across shards).

### Same scenario: dropped frames (%)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 0.0 (0.0-0.0) | 0.0 (0.0-0.0) | 0.0 (0.0-3.7) |
| vaul | 0.0 (0.0-0.0) | 0.0 (0.0-32.8) | 22.4 (0.0-72.1) |
| Base UI | 0.0 (0.0-3.8) | 17.1 (16.4-22.7) | 58.3 (3.8-78.3) |
| React Aria | 3.4 (3.2-3.4) | 20.5 (15.2-22.2) | 47.9 (38.7-50.0) |

n=30 per cell. Overall: tie at load=0 and load=100 (all six shards agreed on
drawerdeck both times, but the gap didn't clear its own spread); drawerdeck
outright wins at load=200, the only cell in this run where agreement and gap
both held.

### Touch flick dismiss: settle time (ms)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 1010.5 (967.0-1358.0) | 1140.5 (1123.0-1172.0) | 1389.0 (1376.0-1640.0) |
| vaul | 1154.0 (1108.0-1241.0) | 1420.5 (1312.0-1445.0) | 1765.5 (1528.0-1792.0) |
| Base UI | 840.0 (823.0-867.0) | 936.5 (916.0-1102.0) | 1199.5 (1187.0-1955.0) |
| React Aria | 730.5 (707.0-1413.0) | 1141.5 (848.0-1518.0) | 1127.0 (1110.0-1619.0) |

n=30 per cell. Overall: tie at every load. At load=0, all six shards agreed
on React Aria, but the gap over Base UI didn't clear React Aria's own
spread; at load=100 and load=200 the shards split between React Aria and
Base UI outright. drawerdeck is the numerically slowest of the four at
load=0 regardless of the tie label; [#296](https://github.com/pedrosousa13/deck-cool/issues/296)
tracks closing it.

### Mouse drag and release, upward throw: settle time (ms)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 876.5 (851.0-895.0) | 889.5 (863.0-921.0) | 1132.5 (1121.0-1153.0) |
| vaul | 957.5 (925.0-984.0) | 1298.5 (1272.0-1322.0) | 1753.5 (1519.0-2028.0) |
| Base UI | 606.0 (587.0-628.0) | 672.0 (653.0-702.0) | 946.5 (939.0-1459.0) |
| React Aria | not supported | not supported | not supported |

**Not supported:** React Aria did not respond to this gesture in most of
its reps ([#294](https://github.com/pedrosousa13/deck-cool/issues/294),
rule 11), so it is excluded from this scenario's winners and ties rather
than crowned for never moving. n=30 for the three decks that responded.
Overall: Base UI wins outright at load=0 and load=100 (every shard agreed,
gap held); tie at load=200, where two shards picked drawerdeck instead.
[#269](https://github.com/pedrosousa13/deck-cool/issues/269) tracks closing
the gap to Base UI.

### Open to settled half: settle time (ms)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 904.0 (868.0-928.0) | 931.0 (912.0-951.0) | 1180.0 (1173.0-1183.0) |
| vaul | 1020.0 (1003.0-1065.0) | 1199.5 (1178.0-1231.0) | 1431.0 (1427.0-1434.0) |
| Base UI | 535.5 (513.0-555.0) | 637.0 (578.0-648.0) | 928.0 (679.0-930.0) |
| React Aria | 927.5 (887.0-956.0) | 929.5 (913.0-951.0) | 1179.0 (1172.0-1182.0) |

n=30 per cell. Overall: Base UI wins outright at load=0 and load=100 (every
shard agreed, gap held); tie at load=200, where all six shards still picked
Base UI but the gap didn't clear its own spread.
[#268](https://github.com/pedrosousa13/deck-cool/issues/268) tracks closing
the gap to Base UI.

### Cost: bundle size (min+gzip, React external)

| Deck | Size |
| --- | --- |
| drawerdeck | 5.21 KB |
| vaul | 22.51 KB |
| Base UI | 30.51 KB |
| React Aria | 30.59 KB |

Overall: drawerdeck wins, by a wide margin; not a per-shard metric (the
build is the same on every shard), so there's no agreement question here.

### Per-shard agreement

Of the twelve scored (scenario, load) cells above, all six shards agreed on
a single deck in nine of them; the other three (stall at load=100, flick
dismiss at load=100 and load=200, and mouse throw at load=200) split
outright between two decks. Agreement alone isn't enough to win, though:
four of those nine unanimous cells (stall at every load, dropped frames at
load=0 and load=100) still report "tie," because the gap between the best
and second-best medians never cleared the winning deck's own spread across
shards (rule 7). Only four cells in this run are outright wins: dropped
frames at load=200 (drawerdeck), and mouse throw and open-to-half at load=0
and load=100 (Base UI, both).

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
([40858353381](https://github.com/pedrosousa13/deck-cool/actions/runs/40858353381),
commit `6772ebe`), not from this page's own claims. `drawer-bench.yml` runs
the bench weekly, and the numbers here are re-run before every drawerdeck
release, against whatever `@drawerdeck/react` ships that release, not just
drawerdeck's first beta. A loss stays on this page until a re-run says
otherwise: this page does not drop a losing row to look better. Every
rival's adapter is checked into
[`decks/drawerdeck/bench/src/`](https://github.com/pedrosousa13/deck-cool/tree/main/decks/drawerdeck/bench/src),
and that project's own maintainers are invited to flag a misconfiguration
there.
