---
title: Comparison with vaul, Base UI's Drawer and React Aria's Sheet
label: Compare
description: 'How drawerdeck compares with vaul, Base UI''s Drawer and React Aria''s Sheet today: native scrolling against pointer-driven JavaScript, a feature table sourced from each project''s own docs, and the first fair, CI-run bench numbers with their caveats.'
---

**Verdict today:** this CI run has drawerdeck winning bundle size, dropped frames under medium and heavy load, and the mouse throw at every load, and tying longest stall, flick-dismiss settle time and open-to-half at every load. The flick-dismiss tie is close: the shards disagree on a winner at every load, but React Aria's medians (719.5 / 869 / 1128.5 ms) read lower than drawerdeck's (983 / 1161.5 / 1404 ms) at every load; the cause is still being traced in [#296](https://github.com/pedrosousa13/deck-cool/issues/296).

## At a glance

| Question | drawerdeck | vaul | Base UI Drawer | React Aria Sheet | Winner |
| --- | --- | --- | --- | --- | --- |
| Bundle size (min+gzip, React external) | 5.93 KB | 22.54 KB | 30.88 KB | 30.65 KB | **drawerdeck** |
| Dropped frames while dragging, no load | 0.0% | 0.0% | 0.0% | 0.0% | Tie |
| Dropped frames while dragging, medium load (100ms busy tick) | 0.0% | 24.1% | 12.7% | 18.4% | **drawerdeck** |
| Dropped frames while dragging, heavy load (200ms busy tick) | 0.0% | 51.7% | 40.9% | 50.0% | **drawerdeck** |
| Longest stall while dragging, no load | 33.3 ms | 166.7 ms | 33.3 ms | 33.3 ms | Tie |
| Flick down closes it: settle time, no load | 983.0 ms | 1136.5 ms | 1120.0 ms | 719.5 ms | Tie |
| Mouse throw: settle time, no load | 862.5 ms | 950.0 ms | 951.5 ms | not supported | **drawerdeck** |
| Open to half: settle time, no load | 872.0 ms | 1019.0 ms | 978.0 ms | 913.5 ms | Tie |
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
| Open and close animation | Yes, written by the consumer. `open()` sets scroll position straight to the snap point with no scroll animation; `data-starting-style` on open and `data-ending-style` on close drive a CSS `transition` you write yourself ([`animate-the-drawer`](https://github.com/pedrosousa13/deck-cool/blob/main/decks/drawerdeck/packages/docs/guides/animate-the-drawer.md), 300ms on the family curve), the same attribute names as Base UI's own ([#268](https://github.com/pedrosousa13/deck-cool/issues/268)). | Yes, out of the box: `Drawer.Overlay`'s and `Drawer.Content`'s own shipped CSS (`style.css`'s `[data-vaul-overlay]`/`[data-vaul-drawer]` rules) fades and slides them, as long as both are rendered. | Yes, documented: the packaged docs give `Drawer.Popup` and `Drawer.Backdrop` a `transition: transform 450ms cubic-bezier(0.32, 0.72, 0, 1)` on `[data-starting-style]`/`[data-ending-style]`, with the release duration scaled by `--drawer-swipe-strength`. | No CSS entrance: `Sheet` opens with a native smooth scroll the engine drives, the same approach drawerdeck used before #268. `SheetBackdrop` needs its own `swipeAnimation` prop and `@keyframes` for its fade, or it paints nothing. |
| Headless/unstyled | Yes. | Yes. | Yes. | Yes. |
| Bundle size (min+gzip, React external) | 5.93 KB: the real `@drawerdeck/react` plus `@drawerdeck/core`, built from `main` and packed, with `react`, `react-dom` and `react/jsx-runtime` external, the same as the rivals. | 22.54 KB (`vaul` 1.1.2). | 30.88 KB (`@base-ui/react` 1.9.0, the `Drawer` export). | 30.65 KB (`react-aria-components` 1.22.1, the `Sheet` subpath export: `Sheet`, `SheetTrigger`, `SheetOverlay`, `SheetBackdrop`, `SheetContent`), the whole cost of importing `Sheet`: overlays, focus management, everything else it pulls in. |

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
[40989000487](https://github.com/pedrosousa13/deck-cool/actions/runs/40989000487)
of `drawer-bench.yml`, on main at commit `bf27a1a`, scored against all 11
fairness rules below. It supersedes the earlier run
([40981978495](https://github.com/pedrosousa13/deck-cool/actions/runs/40981978495),
commit `541a83c`), run after [#296](https://github.com/pedrosousa13/deck-cool/issues/296)'s
fix landed: a flicked drawer now closes as soon as it leaves view, not on
`scrollend`. Six parallel, dedicated `ubuntu-latest` shards (never a
machine shared with other work), each running the complete interleaved
bench with 5 reps per (scenario, load, deck) cell; every rep's own run
order is reshuffled fresh, so no deck's reps land disproportionately on a
busier or quieter stretch of a shard's run. Pooled across all six shards:
1440 scored rows, n=30 per cell (a discarded warm-up rep per page
excluded).

**The 11 fairness rules** ([#266](https://github.com/pedrosousa13/deck-cool/issues/266),
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
| drawerdeck | 33.3 (33.3-33.3) | 116.7 (116.7-133.3) | 233.3 (216.7-233.3) |
| vaul | 166.7 (166.7-166.7) | 166.7 (116.7-166.7) | 233.3 (216.7-233.3) |
| Base UI | 33.3 (33.3-33.3) | 116.7 (116.7-133.3) | 216.7 (200.0-233.3) |
| React Aria | 33.3 (33.3-33.3) | 116.7 (100.0-133.3) | 216.7 (216.7-233.3) |

n=30 per cell. Overall: tie at every load (rule 7). At load=0, all six
shards agreed on drawerdeck, but the gap never cleared its own spread; at
load=100 and load=200 the shards split, between drawerdeck and Base UI at
load=100, and across vaul, Base UI and drawerdeck at load=200.

### Same scenario: dropped frames (%)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 0.0 (0.0-0.0) | 0.0 (0.0-2.3) | 0.0 (0.0-3.7) |
| vaul | 0.0 (0.0-0.0) | 24.1 (0.0-29.6) | 51.7 (48.9-72.0) |
| Base UI | 0.0 (0.0-1.9) | 12.7 (8.6-22.3) | 40.9 (0.9-68.2) |
| React Aria | 0.0 (0.0-0.0) | 18.4 (18.0-33.6) | 50.0 (26.8-77.5) |

n=30 per cell. Overall: tie at load=0 (all six shards agreed on drawerdeck,
but the gap didn't clear its own spread); drawerdeck wins outright at
load=100 and load=200, where agreement and gap both held.

### Touch flick dismiss: settle time (ms)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 983.0 (925.0-1380.0) | 1161.5 (1111.0-1454.0) | 1404.0 (1386.0-1681.0) |
| vaul | 1136.5 (1080.0-1190.0) | 1473.0 (1267.0-1667.0) | 2023.5 (2005.0-2255.0) |
| Base UI | 1120.0 (1072.0-1174.0) | 1394.5 (1294.0-1681.0) | 2067.0 (2039.0-2558.0) |
| React Aria | 719.5 (674.0-1233.0) | 869.0 (841.0-1505.0) | 1128.5 (1115.0-1608.0) |

n=30 per cell. Overall: tie at every load. At load=0, all six shards agreed
on React Aria, but the gap over drawerdeck didn't clear React Aria's own
spread; at load=100 and load=200 one shard each picked drawerdeck instead,
so the shards disagree there too. It's a statistical tie, but React Aria's
medians (719.5 / 869 / 1128.5 ms) read lower than drawerdeck's (983 /
1161.5 / 1404 ms) at every load regardless of the tie label;
[#296](https://github.com/pedrosousa13/deck-cool/issues/296) is tracing the
remaining gap.

### Mouse drag and release, upward throw: settle time (ms)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 862.5 (824.0-893.0) | 894.5 (869.0-930.0) | 1150.0 (1132.0-1167.0) |
| vaul | 950.0 (920.0-988.0) | 1287.5 (1254.0-1422.0) | 1757.0 (1523.0-1772.0) |
| Base UI | 951.5 (921.0-987.0) | 1069.5 (1042.0-1439.0) | 1552.5 (1323.0-1566.0) |
| React Aria | not supported | not supported | not supported |

**Not supported:** React Aria did not respond to this gesture in most of
its reps ([#294](https://github.com/pedrosousa13/deck-cool/issues/294),
rule 11), so it is excluded from this scenario's winners and ties rather
than crowned for never moving. n=30 for the three decks that responded.
Overall: drawerdeck wins outright at every load (every shard agreed, gap
held each time).

### Open to settled half: settle time (ms)

| Deck | load=0 | load=100 | load=200 |
| --- | --- | --- | --- |
| drawerdeck | 872.0 (827.0-913.0) | 922.0 (898.0-955.0) | 1182.0 (1180.0-1188.0) |
| vaul | 1019.0 (975.0-1052.0) | 1187.5 (1155.0-1217.0) | 1433.5 (1429.0-1439.0) |
| Base UI | 978.0 (944.0-1026.0) | 979.5 (937.0-1085.0) | 1182.5 (1178.0-1376.0) |
| React Aria | 913.5 (859.0-966.0) | 929.5 (895.0-952.0) | 1181.5 (1177.0-1188.0) |

n=30 per cell. Overall: tie at every load. At load=0 and load=100, all six
shards agreed on drawerdeck, but the gap didn't clear its own spread; at
load=200 the shards split three ways, between React Aria, Base UI and
drawerdeck.

### Cost: bundle size (min+gzip, React external)

| Deck | Size |
| --- | --- |
| drawerdeck | 5.93 KB |
| vaul | 22.54 KB |
| Base UI | 30.88 KB |
| React Aria | 30.65 KB |

Overall: drawerdeck wins, by a wide margin; not a per-shard metric (the
build is the same on every shard), so there's no agreement question here.

### Per-shard agreement

Of the fifteen scored (scenario, load) cells above, all six shards agreed
on a single deck in ten of them; the other five (the drag stall at
load=100 and load=200, flick dismiss at load=100 and load=200, and
open-to-half at load=200) split across more than one deck. Agreement
alone isn't enough to win, though: five of those ten unanimous cells (the
drag stall at load=0, dropped frames at load=0, flick dismiss at load=0,
and open-to-half at load=0 and load=100) still report "tie," because the
gap between the best and second-best medians never cleared the winning
deck's own spread across shards (rule 7). The other five unanimous cells
are this run's outright wins, all for drawerdeck: dropped frames at
load=100 and load=200, and the mouse throw at every load.

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
([40989000487](https://github.com/pedrosousa13/deck-cool/actions/runs/40989000487),
commit `bf27a1a`), not from this page's own claims. `drawer-bench.yml` runs
the bench weekly, and the numbers here are re-run before every drawerdeck
release, against whatever `@drawerdeck/react` ships that release, not just
drawerdeck's first beta. A loss stays on this page until a re-run says
otherwise: this page does not drop a losing row to look better. Every
rival's adapter is checked into
[`decks/drawerdeck/bench/src/`](https://github.com/pedrosousa13/deck-cool/tree/main/decks/drawerdeck/bench/src),
and that project's own maintainers are invited to flag a misconfiguration
there.
