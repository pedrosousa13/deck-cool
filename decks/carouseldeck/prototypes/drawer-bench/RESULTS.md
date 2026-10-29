# Drawer bench: results (#233)

THROWAWAY. Answers #233, part of the drawerdeck map (#230). Benches
drawerdeck's mechanics -- ported from the throwaway prototype
(`prototype/sheetdeck`, `decks/sheetdeck-prototype/index.html`, variant B:
nested list, locked until full) -- against vaul 1.1.2 (pinned per #230:
unmaintained, last release December 2024) and Base UI's Drawer
(`@base-ui/react@1.9.0`), on motion (stalls, settle times) and cost
(bundle size, script time per frame). Reuses carouseldeck's bench harness
(branch `prototype/smoothness-bench`): the Chromium trace method #137
researched and #138/#139 used for stalls, not rAF timing, and the same
load-injection and bundle-size-measurement methods.

## Machine (#219)

4 cores (`nproc`). Load average (`uptime`) checked before every scenario
run, logged below each one. It ranged from 2.2 to 6.1 across the run --
**this machine was not quiet**: other work shared it throughout, the same
condition #138 and #219 flag for carouseldeck's bench. Absolute ms figures
are this run's; the within-row (same scenario, same load) comparison
across the three drawers is more trustworthy than any single number. See
"Quiet re-run, against the real package (#245)" below for the re-run
#219's own standing ask called for.

Per-run loads (1-minute average, `uptime`, immediately before that
scenario's 15 reps):

| Run                                  | Load |
| ------------------------------------ | ---- |
| drawerdeck touch-drag-half-full-back | 6.01 |
| drawerdeck touch-flick-dismiss       | 6.06 |
| drawerdeck mouse-drag-throw          | 5.26 |
| drawerdeck open-to-half              | 5.12 |
| vaul touch-drag-half-full-back       | 3.03 |
| vaul touch-flick-dismiss             | 3.59 |
| vaul mouse-drag-throw                | 2.68 |
| vaul open-to-half                    | 4.04 |
| baseui touch-drag-half-full-back     | 3.15 |
| baseui touch-flick-dismiss           | 3.21 |
| baseui mouse-drag-throw              | 3.34 |
| baseui open-to-half                  | 3.71 |

## Quiet re-run, against the real package (#245)

Re-run per #245's own ask: the first run's `drawerdeck` rows ran at a load
of 5 to 6 against the rivals' 3 to 4, and used ported mechanics
(`src/drawerdeck.ts`, now deleted), not the shipped package. This run
swaps in the real, packed `@drawerdeck/react` plus `@drawerdeck/core`
(packed from `origin/main`, installed as `file:` dependencies -- see
`src/drawerdeck-app.tsx`, `src/main-drawerdeck.tsx`), driven only through
`Drawer.*`'s public API, same shape as vaul's and Base UI's own entries,
and checks the load before starting each scenario instead of only
recording it after the fact.

Per-scenario 1-minute load average (`uptime`), checked immediately before
that scenario's 15 reps. Every run started at or under a load of 1.0 (max
0.96):

| Run                                  | Load |
| ------------------------------------- | ---- |
| drawerdeck touch-drag-half-full-back  | 0.87 |
| drawerdeck touch-flick-dismiss        | 0.96 |
| drawerdeck mouse-drag-throw           | 0.82 |
| drawerdeck open-to-half               | 0.85 |
| vaul touch-drag-half-full-back        | 0.86 |
| vaul touch-flick-dismiss              | 0.78 |
| vaul mouse-drag-throw                 | 0.82 |
| vaul open-to-half                     | 0.94 |
| baseui touch-drag-half-full-back      | 0.70 |
| baseui touch-flick-dismiss            | 0.73 |
| baseui mouse-drag-throw               | 0.86 |
| baseui open-to-half                   | 0.62 |

Everything under "Results: quiet run (#245)" below comes from this run,
same method and same 5-reps-per-cell convention as the first run. Raw
rows: `bench/results/chromium.jsonl` (gitignored by this app's own
`.gitignore`; force-added to the commit that carries this file, so the
quiet run's numbers are reproducible straight from the branch -- `git add
-f`).

## What was built

A sibling app, `decks/carouseldeck/prototypes/drawer-bench/`, not a page
inside `../scroll-snap/`: that app has no React, and adding React, vaul
and Base UI to its shared `vite.config.ts`/`tsconfig.json` would couple a
vanilla-JS carousel prototype to three new dependencies it never uses, for
a bench that shares none of its content. The sibling app has its own
`package.json`, `vite.config.ts` (with `@vitejs/plugin-react`),
`tsconfig.json` (not wired into `decks/carouseldeck/tsconfig.json`'s
project references -- intentional: a throwaway bench's typecheck is not
coupled to the deck's own `pnpm typecheck`), and three bench pages:

- `bench-drawerdeck.html` -- `src/drawerdeck.ts`, drawerdeck's mechanics
  ported from the prototype's variant B: a `<dialog>` with a
  `scroll-snap-type: y mandatory` scroller, three snap points (`closed`,
  `half` at 50% of the viewport, `full` at 92%) via absolutely-positioned
  marker elements, the phase state machine
  (`closed`/`opening`/`open`/`closing`), the scrollend-or-120ms-debounce
  dismissal check, resize handling, and the mouse-only drag (filtered on
  `pointerType`) with a 240ms ease-out cubic and a velocity-projected
  release onto the nearest of `[0, half, full]`. Touch is untouched native
  scrolling. Dropped, as not exercised by any scenario here: the dim
  overlay, tap-outside-to-close, Escape handling,
  `prefers-reduced-motion`. No HUD, no variant switcher (#233's brief).
- `bench-vaul.html` -- `src/vaul-app.tsx`/`main-vaul.tsx`, `Drawer.Root`
  with `snapPoints={[0.5, 0.92]}` (vaul's own convention: a number 0-1 is
  "% of the screen a given snap point should take up"), driven only
  through vaul's public API.
- `bench-baseui.html` -- `src/baseui-app.tsx`/`main-baseui.tsx`,
  `Drawer.Root` with the same `snapPoints={[0.5, 0.92]}` (Base UI's own
  docs: "numbers between 0 and 1... fractions of the viewport height" --
  the same convention as vaul's, so one pair of numbers means the same
  thing to both libraries).

All three render the same content (`src/content.ts`: 50 rows, "Row 1"
through "Row 50") inside an `.inner-list` that scrolls once the content
overflows the panel, and share a handle bar, a trigger button and the
rows' styling (`src/style.css`). Each panel carries this bench's own
`id="panel"` marker (the same convention carouseldeck's harness uses for
`data-bench-index`: the bench's own marker, not a library's), so
`src/harness.ts`'s probe reads one engine-neutral signal on every deck --
**"openness"**, `window.innerHeight - panel.getBoundingClientRect().top`,
the px of the panel visible from the bottom of the viewport -- whether a
library moves it with native scroll (drawerdeck), a per-frame
`translate3d` (vaul), or a CSS custom property driving a transform/height
(Base UI). `harness.ts` also gives every deck the same load injection (a
250ms-ticking busy loop, armed by `window.__bench.jank(ms)`, the same
mechanism carouseldeck's own harness uses) and the same idle-time settle
detector (`idleFor()`) every scenario waits on.

Two of three libraries needed CSS this bench had to find by testing, not
by assuming the quickstart example was complete -- see "Method notes".

## Method

`bench/scenarios.ts` has the bench's own four scenarios, each starting
from the state #233 specifies:

1. **`touch-drag-half-full-back`** -- open to half, then a trusted CDP
   touch drag from half to full and back, at a fixed 16ms cadence between
   touch points (12 steps up, 12 steps down, covering the half-to-full
   distance each way).
2. **`touch-flick-dismiss`** -- open to half, then a fast, short CDP
   touch flick downward (6 steps, 8ms cadence -- half the cadence of
   scenario 1: a flick, not a held drag).
3. **`mouse-drag-throw`** -- open to half, then a `page.mouse` drag
   upward and release (6 steps, 8ms cadence, the same cadence
   `../scroll-snap/bench/scenarios.ts`'s own `drag-throw` uses).
4. **`open-to-half`** -- starts closed; a real click on `#trigger`.

Every scenario runs at the harness's three main-thread loads (none, 100ms,
200ms busy-loop ticks), 5 reps each, in Chromium only (a drawer's touch
scenarios need CDP's trusted touch regardless of browser, the same reason
carouseldeck's own touch scenario is Chromium-only; there is no
Firefox/WebKit subset here). `bench/trace.ts` is
`../scroll-snap/bench/trace.ts`, imported unchanged: a CDP trace scores
the longest visual stall, the hitch ratio and percent dropped frames from
`PipelineReporter` frames, the method #137's research validated and #138
used. `bench/bench.spec.ts` captures one trace per scenario run (the drag
or flick, plus the settle wait after it) and records one JSON line per
run to `bench/results/chromium.jsonl`. `bench/report.py` turns that into
the median-and-spread tables below (a small, bench-specific complement to
`../scroll-snap/bench/analyze.py`, which is also directly reusable here
unchanged -- it reads the same `deck`/`scenario`/`load` grouping and the
same `trace`/`raf`/`settleMs` fields this bench's rows also carry -- but
it reports medians only, not the spread this ticket asks for, so
`report.py` adds that and renders markdown directly).

`bench/bundle-size.mjs` measures min+gzip JS the same way
`../scroll-snap/bench/bundle-size.mjs` does (an in-memory Vite build,
minified, gzipped, every JS chunk plus any stylesheet the entry imports),
with `react`, `react-dom`, `react-dom/client` and `react/jsx-runtime`
external for vaul and Base UI (#233's brief). In the first run,
drawerdeck had no React wrapper in this bench -- its ported mechanics
were measured as plain JS/TS, and labelled that way, not as a "0 React
cost" library. #245's quiet run (below) measures the real
`@drawerdeck/react` plus `@drawerdeck/core` with the same externals
instead, so that distinction no longer applies there.

"Script time per frame during scenario 1" is read from the same
`long-animation-frame` entries (`window.__bench.loaf()`) every scenario 1
run already captures (count and total blocking time), not a separate
probe.

## Method notes (found while building and validating this bench)

- **vaul and Base UI are headless: the quickstart examples alone do not
  position the drawer.** vaul's `Drawer.Content` needs `position: fixed;
left: 0; right: 0; bottom: 0` from the consumer (vaul's own
  getting-started example gives it, its API docs don't); without it,
  `Content` sits in normal document flow and every snap offset vaul
  computes lands at the wrong screen position (measured empirically:
  "half" read as ~299px of a 760px viewport instead of the configured
  380px). It further needs a bounded height
  (`max-height: 100dvh; overflow: hidden`, `display: flex; flex-direction:
column`) or the panel renders at its full, unclipped content height
  (2162px for 50 rows) and "openness" reads in the thousands of px. Both
  fixes are in `src/vaul.css`, found by inspecting the rendered
  `transform`/`height`/`getBoundingClientRect()` directly, not by reading
  only the types.
- **vaul's own shipped `style.css` is not reachable through its
  `exports` map, and has one invalid selector.** `import 'vaul/style.css'`
  fails under Vite 8/rolldown's strict exports resolution (the file
  exists in the package, but `package.json`'s `exports` field does not
  list it as a subpath) -- vendored into `src/vaul-vendor.css` instead,
  copied verbatim except for removing a stray colon in
  `[data-vaul-handle-hitarea]: {` (an invalid selector a browser silently
  drops but this project's CSS minifier refuses to build).
- **Base UI's Drawer needed its own positioning CSS too**
  (`src/baseui.css`), from its own quickstart
  (`base-ui.com/react/components/drawer`): `height: var(--drawer-height)`
  and `transform: translateY(calc(var(--drawer-snap-point-offset) +
var(--drawer-swipe-movement-y)))` on the popup, `position: fixed; inset:
0; pointer-events: none` on the viewport.
- **A bench-level bug, not a library one: `geometry()` on a closed vaul or
  Base UI drawer polled for ~30s per rep.** Both libraries render nothing
  for `#panel` while closed (no DOM node at all, not just a hidden one);
  drawerdeck always renders `#panel` (hidden inside a closed `<dialog>`).
  `bench/scenarios.ts`'s `geometry()` reads `locator('#panel
.handle').boundingBox()`, and Playwright's locator actions wait out
  their default actionability timeout for an element that doesn't exist
  yet -- for the `open-to-half` scenario (which starts closed and never
  needs geometry; its `run()` only clicks `#trigger`), this meant ~30s of
  dead waiting per rep on vaul and Base UI, long enough to blow this
  bench's own per-test timeout across 15 reps. Fixed with a `needsGeometry:
false` flag on that one scenario, skipping the call entirely. Caught
  because the first full sweep for vaul hung (two Playwright runs needed
  killing before this was found), not because of a design review --
  worth re-stating carouseldeck's own lesson (#137/#138) that this kind of
  probe cost has to be checked against each engine, not assumed uniform.
- **`longestStallMs` for `touch-drag-half-full-back` spans the whole
  up-then-settle-then-down gesture, including the wait between the two
  drags.** The scenario's own mid-run `settle()` call sits inside the
  traced window by design (so the settle-to-full is itself part of what's
  measured), but it means a gap here can be genuine idle time between the
  two drags as much as a real stall. Read the within-deck, across-load
  comparison (same scenario, same deck, load=0 vs load=200) as the
  trustworthy signal; the absolute figure less so.
- **LoAF during scenario 1 is dominated by the injected load, not by a
  library's own cost** -- the same finding #138 made for carouseldeck.
  Total blocking time at load=100/200 is near-identical across all three
  drawers (the busy-loop ticks the same way on every one); at load=0, all
  three show zero LoAF entries during the scenario, meaning none of the
  three libraries' own drag handling blocks a frame past the 50ms LoAF
  threshold during ordinary use -- that zero is the real, comparable
  figure; the loaded columns are the injected load's own cost, not a
  library difference.
- **`blankFrames` is not measured for any deck here.** carouseldeck's
  harness used it as a seam/flash detector specific to a looping carousel;
  a drawer has no seam, so this bench's `raf` metrics always report
  `blankFrames: 0` -- not a claim that no deck ever shows a blank frame,
  just that this bench never tried to detect one.
- **This machine was not quiet** (see "Machine" above): the loaded-level
  (100/200) cells, especially, would benefit from a re-run once a quiet
  machine is available, the same standing caveat #219 raised for
  carouseldeck's bench and has not yet re-run here either.

## Results: first run, busy machine (#233)

5 reps per cell; cells are `median (min-max, n=5)`. Raw data for this run
was not kept (gitignored, and overwritten by the quiet run below);
regenerate it with the commands at the end of this file.

### 1. Touch drag half -> full -> back: longest stall (ms)

| Deck       | load=0        | load=100      | load=200      |
| ---------- | ------------- | ------------- | ------------- |
| drawerdeck | 517 (500-533) | 567 (567-583) | 583 (567-767) |
| vaul       | 167 (167-167) | 167 (167-167) | 217 (217-217) |
| baseui     | 450 (450-467) | 450 (433-500) | 500 (483-533) |

### 1. Touch drag half -> full -> back: dropped frames (%)

| Deck       | load=0  | load=100  | load=200   |
| ---------- | ------- | --------- | ---------- |
| drawerdeck | 6 (6-9) | 9 (6-28)  | 49 (47-57) |
| vaul       | 0 (0-0) | 20 (0-43) | 68 (28-71) |
| baseui     | 2 (0-4) | 18 (2-24) | 58 (53-58) |

### 2. Touch flick down from half: settle time (ms)

| Deck       | load=0           | load=100         | load=200         |
| ---------- | ---------------- | ---------------- | ---------------- |
| drawerdeck | 1151 (1097-1497) | 1705 (1229-1753) | 1834 (1595-1844) |
| vaul       | 1189 (1180-1195) | 1398 (1387-1420) | 1747 (1740-1762) |
| baseui     | 889 (846-917)    | 1054 (1034-1154) | 1623 (1398-1659) |

### 2. Touch flick down from half: ended closed? (px still open, 0 = closed)

| Deck       | load=0  | load=100  | load=200      |
| ---------- | ------- | --------- | ------------- |
| drawerdeck | 0 (0-0) | 0 (0-0)   | 0 (0-0)       |
| vaul       | 0 (0-0) | 0 (0-0)   | 0 (0-0)       |
| baseui     | 0 (0-0) | 0 (0-380) | 380 (380-380) |

### 3. Mouse drag and release, upward throw: settle time (ms)

| Deck       | load=0           | load=100         | load=200         |
| ---------- | ---------------- | ---------------- | ---------------- |
| drawerdeck | 1053 (1037-1104) | 1235 (1169-1333) | 1552 (1107-2263) |
| vaul       | 1105 (1039-1129) | 1351 (1346-1377) | 1738 (1413-1965) |
| baseui     | 690 (625-736)    | 678 (655-883)    | 895 (880-1314)   |

### 4. Open to settled half: settle time (ms)

| Deck       | load=0           | load=100         | load=200         |
| ---------- | ---------------- | ---------------- | ---------------- |
| drawerdeck | 931 (907-953)    | 904 (903-921)    | 1150 (1145-1153) |
| vaul       | 1059 (1057-1096) | 1201 (1198-1206) | 1419 (1411-1419) |
| baseui     | 592 (576-613)    | 638 (624-647)    | 904 (900-923)    |

### 5. Cost: bundle size (min+gzip)

| Deck                 | Size     | Notes                                                               |
| -------------------- | -------- | ------------------------------------------------------------------- |
| drawerdeck           | 2.34 KB  | plain JS/TS, **no React wrapper**                                   |
| vaul 1.1.2           | 22.48 KB | `react`/`react-dom`/`react-dom/client`/`react/jsx-runtime` external |
| Base UI Drawer 1.9.0 | 30.47 KB | same externals                                                      |

### 5. Cost: script time per frame during scenario 1 (LoAF total blocking, ms / count of 5-rep median)

| Deck       | load=0   | load=100    | load=200     |
| ---------- | -------- | ----------- | ------------ |
| drawerdeck | 0 ms / 0 | 603 ms / 12 | 3309 ms / 22 |
| vaul       | 0 ms / 0 | 507 ms / 10 | 3007 ms / 20 |
| baseui     | 0 ms / 0 | 552 ms / 11 | 3006 ms / 20 |

All three show 0 at load=0: no library's own drag handling blocks a frame
past LoAF's 50ms threshold during ordinary use. The loaded columns are
near-identical across decks -- the injected busy loop's own cost, not a
library difference (see "Method notes").

## Results: quiet run, against the real package (#245)

Same method, same 5-reps-per-cell convention, median (min-max, n=5). Loads
checked before starting, not just recorded (see "Quiet re-run" above: every
run started at or under 1.0). drawerdeck's rows are now the real
`@drawerdeck/react` + `@drawerdeck/core`, not ported mechanics.

### 1. Touch drag half -> full -> back: longest stall (ms)

| Deck       | load=0        | load=100      | load=200      |
| ---------- | ------------- | ------------- | ------------- |
| drawerdeck | 500 (500-517) | 567 (567-600) | 583 (567-767) |
| vaul       | 167 (167-167) | 167 (167-167) | 217 (217-417) |
| baseui     | 450 (450-450) | 483 (450-500) | 517 (483-517) |

### 1. Touch drag half -> full -> back: dropped frames (%)

| Deck       | load=0  | load=100  | load=200   |
| ---------- | ------- | --------- | ---------- |
| drawerdeck | 9 (6-11) | 20 (14-26) | 49 (42-54) |
| vaul       | 0 (0-3)  | 29 (12-38) | 23 (10-45) |
| baseui     | 4 (2-4)  | 20 (17-24) | 57 (54-58) |

At load=200, vaul is now the least-dropped of the three (23%), not
drawerdeck: the first run's "drawerdeck degrades least steeply" reading
does not hold up quiet (see "Where drawerdeck loses" and #243, below).

### 2. Touch flick down from half: settle time (ms)

| Deck       | load=0         | load=100         | load=200         |
| ---------- | -------------- | ---------------- | ---------------- |
| drawerdeck | 766 (757-1444) | 1134 (1123-1741)  | 1579 (1108-1607) |
| vaul       | 1186 (1154-1219) | 1405 (1352-1432) | 1745 (1736-2006) |
| baseui     | 865 (844-899)  | 918 (912-1053)    | 1408 (1183-1435) |

### 2. Touch flick down from half: ended closed? (px still open, 0 = closed)

| Deck       | load=0  | load=100  | load=200      |
| ---------- | ------- | --------- | ------------- |
| drawerdeck | 0 (0-0) | 0 (0-0)   | 0 (0-0)       |
| vaul       | 0 (0-0) | 0 (0-0)   | 0 (0-380)     |
| baseui     | 0 (0-0) | 380 (0-380) | 380 (380-380) |

Exact fail counts (reps that did not end at 0px, of 5): drawerdeck 0/0/0
(load=0/100/200); vaul 0/0/1; baseui 0/3/5. drawerdeck is now the only
deck that closed on every rep at every load; vaul lost one rep at
load=200 that it did not lose in the first run.

### 3. Mouse drag and release, upward throw: settle time (ms)

| Deck       | load=0        | load=100      | load=200         |
| ---------- | ------------- | ------------- | ---------------- |
| drawerdeck | 672 (657-692) | 827 (743-878) | 859 (848-1096)    |
| vaul       | 997 (992-1004) | 1393 (1290-1406) | 1746 (1744-1762) |
| baseui     | 629 (628-647) | 642 (630-662) | 925 (899-935)     |

### 4. Open to settled half: settle time (ms)

| Deck       | load=0        | load=100      | load=200         |
| ---------- | ------------- | ------------- | ---------------- |
| drawerdeck | 959 (953-990) | 938 (926-957) | 1169 (1158-1171)  |
| vaul       | 1066 (1049-1075) | 1193 (1185-1203) | 1418 (1412-1419) |
| baseui     | 576 (567-596) | 632 (630-638) | 918 (915-919)     |

### 5. Cost: bundle size (min+gzip)

| Deck                  | Size     | Notes                                                                |
| --------------------- | -------- | --------------------------------------------------------------------- |
| drawerdeck            | 5.05 KB  | `@drawerdeck/react` + `@drawerdeck/core`, same externals as the rivals |
| vaul 1.1.2            | 22.48 KB | `react`/`react-dom`/`react-dom/client`/`react/jsx-runtime` external    |
| Base UI Drawer 1.9.0  | 30.47 KB | same externals                                                         |

Measured by `bench/bundle-size.mjs` against the real packed packages (the
same tarballs installed into this bench, built from `origin/main`), not
drawerdeck's old ported mechanics. This replaces the first run's "no React
wrapper" figure outright: it is now the same kind of number as vaul's and
Base UI's.

### 5. Cost: script time per frame during scenario 1 (LoAF total blocking, ms / count of 5-rep median)

| Deck       | load=0   | load=100    | load=200     |
| ---------- | -------- | ----------- | ------------ |
| drawerdeck | 0 ms / 0 | 654 ms / 13 | 3167 ms / 21 |
| vaul       | 0 ms / 0 | 567 ms / 11 | 2705 ms / 18 |
| baseui     | 0 ms / 0 | 557 ms / 11 | 3005 ms / 20 |

Same reading as the first run: all three show 0 at load=0, and the loaded
columns track the injected load, not a library difference.

### Quiet run: what moved against the first run

- **The real package settles touch-flick-dismiss and the mouse-drag throw
  noticeably faster than the first run's ported mechanics did** (flick
  dismiss at load=0: 766ms here against 1151ms in the first run; mouse
  throw: 672ms against 1053ms). drawerdeck's real settle logic is not the
  same code the first run benched -- #245 existed because the port was a
  stand-in, and the real package turns out to differ, not just to be
  measured more fairly.
- **drawerdeck now wins touch-flick-dismiss's settle time outright at
  load=0** (766ms, against baseui's 865ms and vaul's 1186ms), where the
  first run had it slowest of the three in that scenario's longer
  (half<->full) drag variant.
- **drawerdeck is now the only deck with perfect dismiss reliability at
  every load**: vaul dropped one of five reps at load=200 that it did not
  drop in the first run; baseui's failure pattern is essentially
  unchanged.
- **The dropped-frames story at load=200 reverses.** The first run read
  "drawerdeck degrades least steeply and ends up least-dropped at
  load=200" (49% against vaul's 68% and baseui's 58%). Quiet, vaul drops
  to 23% at load=200 -- now the lowest of the three -- while drawerdeck
  (49%) and baseui (57%) stay close to their first-run figures. That
  reading was an artifact of the busy machine specifically hurting vaul's
  numbers, not a property of drawerdeck's own frame scheduling under
  load; see #243 for the related stall question.
- **The longest-stall figure for the half<->full drag barely moved**
  (517ms to 500ms at load=0): the quiet machine does not explain
  drawerdeck's stall there. See #243, below.
- **Bundle size is now a fair, like-for-like comparison.** drawerdeck's
  React wrapper plus core (5.05 KB) is still the smallest of the three by
  a wide margin, not a different kind of number any more.

## #243: is the touch-drag stall real, or the scenario's own pause?

**No traces were kept from this run, so this cannot be answered with
frame timestamps against input timestamps -- the evidence #243 asked
for.** `bench/bench.spec.ts` captures each run's CDP trace in memory
(`captureTrace`), reduces it immediately with `analyzeMotion` into the
summary fields that land in `chromium.jsonl`, and never writes the raw
`TraceEvent[]` to disk. `bench/results/artifacts/` holds only
`.last-run.json`, Playwright's own pass/fail summary, not trace data.
That was already true of the first run, and still true of this one: no
run of this bench has ever kept a trace file.

What this run does settle, from the recorded numbers rather than a
trace: **it is not the busy machine.** Hypothesis 1 in #243's own
comment -- "the run wasn't fair" -- is answered no. drawerdeck's
longest-stall figure for the half<->full drag barely moved between the
busy run and this quiet one (517ms to 500ms at load=0, where the machine's
own load went from 5-6 down to under 1.0). Whatever is producing that gap
is not contention from other work on the machine.

Between hypotheses 2 (non-composited scrolling) and 3 (the scenario's
own idle pause), this run cannot distinguish them either, for the same
reason: both would need frame-level trace data this run didn't keep.
What can be said from reading the bench's own code, not a trace: scenario
1's `run()` (`bench/scenarios.ts`) calls `settle(page)` *between* the two
drags -- a `waitForTimeout(100)` plus a wait for `idleFor() > 400`ms --
and that call sits inside the same `captureTrace` window as both drags
(`bench.spec.ts`: `await scenario.run(page, g); await settle(page);`,
and `run()` itself calls `settle` again mid-way through). That structural
pause is identical for every deck, which is why the first run's own
"Method notes" already flagged it as a reason `longestStallMs` is not a
pure stall figure. It does not, on its own, explain why the three decks'
stalls differ by deck and load the way they do (a shared, fixed-length
pause would show up roughly the same for all three; it doesn't): there is
a real, per-deck difference here, underneath whatever the shared pause
contributes, that this run has no way to isolate.

**This stays open.** A future run should keep the trace: either write
`captureTrace`'s raw `events` array to `results/artifacts/<name>.json`
per rep, or switch to Playwright's own `--trace on` and keep the
`.zip`s, then read `PipelineReporter`/`EventLatency` entries against the
CDP touch input timestamps directly. Hypothesis 2 (DevTools' "Scrolling
performance issues" / `main_thread_scrolling_reasons`) has not been
checked at all in either run.

## Where drawerdeck wins

- **Dismiss reliability under load.** `touch-flick-dismiss` closed on
  every one of drawerdeck's and vaul's 15 reps (0px open, every load).
  Base UI's own gesture-driven dismiss did not: at load=200 it settled
  back to half (380px, still open) on every rep, and on one of five reps
  at load=100. Native touch scrolling (drawerdeck) and vaul's own
  touch/pointer handling both stayed reliable here; Base UI's did not,
  under this bench's heaviest load.
- **Dropped-frame resistance to load, relative to its own baseline.**
  drawerdeck's dropped-frame percentage during the half<->full drag rises
  from 6% (load=0) to 49% (load=200), a ~8x increase; vaul's rises from 0%
  to 68% (an enormous relative jump, and ends up worse in absolute terms
  at load=200); Base UI's rises from 2% to 58%. drawerdeck is not the
  smoothest unloaded, but degrades the least steeply and ends up the
  least-dropped of the three once the main thread is busy -- the
  direction #137's and #230's research predicted for native,
  compositor-driven touch against JS-driven rivals, though the margin at
  load=200 (49% vs 58%/68%) is not large and this run's machine was not
  quiet (see caveats).

## Where drawerdeck loses

- **Longest stall during the half<->full drag, at every load.** vaul is
  roughly 3x shorter (167-217ms vs drawerdeck's 517-583ms) and Base UI
  also beats drawerdeck here (450-500ms). drawerdeck does not win this
  metric at any load level.
- **Settle time for a mouse-drag throw and for opening to half.** Base UI
  is markedly faster at both -- roughly 1.5x on the mouse throw (690ms vs
  drawerdeck's 1053ms at load=0) and on opening (592ms vs 931ms at
  load=0) -- at every load tested. vaul is slower than drawerdeck at both
  of these, so this is specifically a Base UI win, not a two-rivals-beat-
  drawerdeck pattern.
- **Settle time for the touch-flick dismiss.** Base UI is fastest here
  too (889ms vs drawerdeck's 1151ms at load=0) -- though see "wins" above:
  Base UI's dismiss stopped landing reliably at higher load, so its speed
  advantage here comes with a reliability cost drawerdeck and vaul do not
  have.
- **Bundle size, on its own terms.** drawerdeck's 2.34 KB has no React
  wrapper at all, so it is not a fair comparison to vaul's 22.48 KB or
  Base UI's 30.47 KB as shipped React components -- noted as a difference
  in kind, not scored as a drawerdeck win here.

## Numbers that cannot be trusted, and why

- **This machine was not quiet for the first run** (see "Machine"): load
  averaged 2.2-6.1 across it. Absolute ms figures are that run's own;
  within-row comparisons (same scenario, same load, across decks) are
  more trustworthy than any single number. #219's and #245's own standing
  ask for a quiet re-run is done -- see "Quiet re-run, against the real
  package (#245)" and "Results: quiet run" above -- but no run of this
  bench has ever kept a trace file, so #243's stall question is still
  open (see that section).
- **`longestStallMs` for scenario 1 includes a mid-gesture settle wait**,
  so it is not a pure "stall during motion" figure (see "Method notes"
  and #243, above).
- **Input-to-first-moved-frame is not reported.** This bench never arms a
  `bench-input` performance mark (not needed for any of #233's asked-for
  metrics), so `trace.ts`'s `inputToFirstMovedMs` is always `null` here --
  not measured, not a zero.
- **Blank/seam-frame counts are not measured** for any deck (no seam in a
  drawer; see "Method notes").
- **Headless Chromium paces frames with a timer**
  (`DelayBasedBeginFrameSource`), not a real display's vsync (#137):
  absolute ms figures are comparative within this run, not a device's
  real frame budget.
- **Script-time-per-frame (LoAF) at load=100/200 is dominated by the
  injected load**, not by a library's own cost (see "Method notes" and
  the Cost table); the load=0 column is the real, comparable figure.
- **No iPhone, WebKit or Firefox pass.** This bench is Chromium-only
  (CDP's trusted touch, used by three of its four scenarios, is Chromium-
  only in Playwright); nothing here says anything about Safari, iOS or
  Firefox.

## Exact commands to re-run

```sh
# Pack the real drawerdeck packages first (#245; .pack/ is gitignored,
# regenerate it before installing). From a worktree of origin/main:
pnpm install --frozen-lockfile
pnpm --dir decks/drawerdeck build
pnpm --dir decks/drawerdeck/packages/core pack --pack-destination <this bench>/.pack
pnpm --dir decks/drawerdeck/packages/react pack --pack-destination <this bench>/.pack
# then rename the two tarballs to drawerdeck-core-0.0.0.tgz and
# drawerdeck-react-0.0.0.tgz (package.json's file: deps name them exactly)

# From decks/carouseldeck/prototypes/drawer-bench/
pnpm install   # once, from the repo root: installs vaul, @base-ui/react and the two packed tarballs here
pnpm build
pnpm exec playwright install chromium   # once

# Check the load before any timing run:
uptime

# Smoothness: Chromium-only, every deck/scenario/load, 5 reps each,
# sharded per deck+scenario to stay well under this bench's own per-test
# timeout (found necessary during this run -- see "Method notes"):
pnpm exec playwright test -c bench/playwright.config.ts \
  --grep '\[drawerdeck\] touch-drag-half-full-back' bench/bench.spec.ts
# ...repeat for each of the 3 decks x 4 scenarios (12 runs)

# Cost: bundle size (a Vite build, no browser)
node bench/bundle-size.mjs

# Turn results/chromium.jsonl into this file's tables
python3 ../scroll-snap/bench/analyze.py bench/results   # medians only
python3 bench/report.py bench/results                   # median + spread, markdown

# Sanity check (not part of the recorded results): every deck loads and
# opens to ~half
pnpm exec playwright test -c bench/playwright.config.ts bench/smoke.spec.ts
```
