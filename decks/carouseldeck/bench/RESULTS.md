# Carousel bench (#340)

Benches `@carouseldeck/react` against pinned versions of Embla, Keen, Swiper
and Splide, on motion (stalls, settle times) and mount cost (main-thread busy
time, layout/style-recalc work, time to a correct first frame). Ported from
`decks/drawerdeck/bench` (#266/#283), the same way that bench was itself
moved out of a throwaway prototype branch: a private workspace package, so
`@carouseldeck/react` is always a `workspace:*` dependency and the bench
always measures the commit under test, never a packed tarball from some
other checkout.

**This file does not hold timing numbers.** A real run only means something
on a quiet, dedicated CI runner (the same finding #219/#245 made for
drawerdeck's own prototype: a shared machine biases results), interleaved
across all five decks so no library's reps land disproportionately on a
busier or quieter stretch of the run. `.github/workflows/carousel-bench.yml`
runs the bench on dedicated `ubuntu-latest` shards, on `workflow_dispatch`
and weekly; its `report` job pools every shard's rows into medians, spread
and n per cell, plus a per-shard winner table, and uploads the result as the
`carousel-bench-report` artifact — read that artifact from the workflow's
run page for real numbers, not this file. **The first real run has not
happened yet.** The issue (#340) asks for it to land on `main` before #339's
perf work, so it is the baseline that work is measured against; this PR
builds the bench and proves the pipeline end to end with a local pass (below),
and does not put any numbers on `packages/react/README.md` or
`packages/docs/compare.md` — that is a follow-up, once a named CI run exists
to cite.

## The decks

Five carousels, each a static page (`bench-<deck>.html`) sharing
`window.__bench` (`src/harness.ts`) and a `#viewport`/`#next`/`#prev` set of
markers:

- **carouseldeck** — `@carouseldeck/react`, `workspace:*`.
- **Embla** — `embla-carousel-react`.
- **Keen** — `keen-slider`.
- **Swiper** — `swiper`.
- **Splide** — `@splidejs/react-splide` + `@splidejs/splide`.

## Fairness

Every number this bench reports is checked against eleven of drawerdeck's
own twelve fairness rules (#266's "Fairness rules" comment) before it goes on
a comparison page. Rule 12 ("a dismiss counts only when the library reports
it closed") does not apply here: a carousel has no open/closed state, so
there is nothing to carry over.

1. **Same runner, interleaved.** One Playwright worker, in the foreground
   (`playwright.config.ts`: `workers: 1`, `fullyParallel: false`); within
   that, every rep shuffles all five decks' run order fresh — see
   "Interleaving" below.
2. **Production builds for everyone.** `vite build` (never dev mode) for
   every deck's bench entry and every mount-scenario entry, from one
   `vite.config.ts`; one pinned React/react-dom version shared by all five;
   no `<StrictMode>` anywhere.
3. **Each rival configured the way its own docs recommend.** Every rival
   adapter (`src/embla-app.tsx`, `src/keen-app.tsx`, `src/swiper-app.tsx`,
   `src/splide-app.tsx`) links the doc page or shipped type it follows at its
   own top, and lists every option it sets that isn't that library's own
   default, with why.
4. **The same task.** Ten slides (`src/content.ts`'s `SLIDE_COUNT`), one per
   view, horizontal, no loop by default. A second variant with the carousel's
   own `loop` option on, for every deck (all five support it) — a `?loop=1`
   query string on the same page (`decks.ts`'s `urlFor`), not a second Vite
   entry or HTML page. One viewport (`playwright.config.ts`'s 800x600,
   matching carouseldeck's own prototype scroll-snap measure bench's choice:
   a carousel is not a mobile-only pattern the way a drawer is, so this
   bench does not reuse drawerdeck's 390x760 phone viewport).
5. **Latest stable versions, pinned, with release dates.** See "Versions"
   below.
6. **A warm-up rep, discarded.** Every rep already gets its own fresh page
   (Playwright's test-level context isolation); `bench.spec.ts`'s `runPass`
   runs the whole scenario once, right after the fresh `page.goto`, discarded
   (recorded with `warmup: true`, excluded from every median/spread/winner),
   then the page reloads before the real, scored pass. The reload matters
   here too: every scenario moves forward from slide 0, and there is no
   deck-agnostic way to put all five carousels back at slide 0 in between
   without a fresh load.
7. **Ties are ties.** `aggregate.py`'s `cell_winner` only names a winner when
   every shard's own pooled winner agrees _and_ the gap between the best and
   second-best pooled medians beats the winning deck's own spread across
   shards; otherwise the cell reports `tie`. `aggregate-mount.py`'s own
   `cell_winner` does the same for the mount scenario's cells.
8. **Reproducible and reviewable.** Every adapter here is checked into the
   repo; raw results, the pooled `aggregate.jsonl`/`mount-aggregate.jsonl`
   and every rep's gzipped trace are the artifacts
   `.github/workflows/carousel-bench.yml` uploads.
9. **Losses stay visible.** `aggregate.py`'s `render_tables` prints every
   metric in `METRICS` for every deck, win or lose; `aggregate-mount.py`'s
   `render_tables` does the same for the mount scenario.
10. **Stalls score motion, not a scripted pause.** Dropped frames, the
    longest stall and the hitch ratio are scored only from a gesture's own
    active window (`scenarios.ts`'s `markWindowStart()`/`settle()`'s
    `markWindowEnd()`, read by `trace.ts`'s `analyzeMotion`) — the same
    mechanism drawerdeck's bench uses (its own #266 rule 10), carried over
    unchanged. Unlike drawerdeck's own touch-drag scenario, no scenario here
    has a mid-gesture pause, so there is no "legacy (unscoped)" column to
    keep: every window here already covers its whole gesture.
11. **A carousel that does not respond to a gesture cannot win it.** A
    carousel that never moves still finishes `settle()`, at that function's
    own timeout, so "settle time" alone cannot tell "fastest" from "never
    moved." `bench.spec.ts` records `responded: true|false` from the same
    per-frame probe `harness.ts` tracks (`raf.maxStep`, >2px in any single
    frame during the gesture and its settle). `aggregate.py`/`report.py`
    mark a deck "not supported" for a `(scenario, load, loop)` cell when
    `responded` is `false` in most of its scored reps there, and exclude it
    from that cell's winners and ties. See "Not supported" below for which
    decks that is, for `wheel-scroll-next`.

## Versions, with release dates (rule 5)

| Deck                     | Version                                 | Released   |
| ------------------------ | --------------------------------------- | ---------- |
| `@carouseldeck/react`    | this commit (`workspace:*`, unreleased) | -          |
| `embla-carousel-react`   | 8.6.0                                   | 2025-04-04 |
| `keen-slider`            | 6.8.6                                   | 2023-07-05 |
| `swiper`                 | 14.4.0                                  | 2026-10-30 |
| `@splidejs/react-splide` | 0.7.12                                  | 2022-09-30 |
| `@splidejs/splide`       | 4.1.4                                   | 2022-11-09 |

The release dates come from `npm view <pkg> time --json`, read once by hand
and checked into `versions.json` — so neither this file nor a CI run has to
hit npm for them. Embla and Keen's versions match what `tests/compare` (the
comparison-page bundle-size fixture) already pins; Swiper and Splide are new
to this bench, each the latest version at least a day old (pnpm's own
`minimumReleaseAge` hold) as of 2026-11-04.

## What's here

- `decks.ts` — the five decks, each a static page, plus `urlFor` (the
  `?loop=1` toggle).
- `scenarios.ts` — the bench's five gesture scenarios: `touch-swipe-next`
  and `touch-flick-three` (CDP trusted touch, Chromium-only), `mouse-drag-release`,
  `wheel-scroll-next`, `next-button`. Every scenario starts from slide 0 and
  moves forward; `setupAtStart` waits for `window.__bench.published()`
  (below) rather than any "open" action, since a carousel has nothing to
  open.
- `trace.ts` — copied from `decks/drawerdeck/bench/trace.ts` (a cross-deck
  import would couple this bench to drawerdeck's, the same choice drawerdeck
  made copying this file from carouseldeck's own prototype scroll-snap
  bench). `analyzeMotion` is unchanged, minus drawerdeck's own "legacy
  (unscoped)" dual-scoring (rule 10, above). `analyzeMount` is new, for the
  mount scenario's own scoring — see "Method: the mount scenario" below.
- `trace.test.ts` — unit tests for both scorers, against synthetic trace
  timelines (`node --test trace.test.ts`, or `pnpm test` in this package; not
  part of `pnpm --dir decks/carouseldeck verify`).
- `seed.ts` — the interleaving's deterministic shuffle, copied unchanged from
  drawerdeck's.
- `bench.spec.ts` — the gesture bench's real run: one JSON line per run to
  `results/chromium.jsonl`, plus a gzipped trace and frame timeline per
  scored rep under `results/traces/`.
- `mount.spec.ts` — the mount scenario's real run: one JSON line per run to
  `results/mount.jsonl`, plus a gzipped trace and frame timeline per scored
  rep under `results/mount-traces/`. See "Method: the mount scenario" below.
- `smoke.spec.ts` — the local smoke check: every deck's dots bar publishes,
  at slide 0.
- `aggregate.py` / `report.py` — multi-shard (CI) and single-run (local)
  reporting for the gesture bench, ported from drawerdeck's.
- `aggregate-mount.py` / `report-mount.py` — the same two reporting shapes,
  for the mount scenario's own metrics (new here; drawerdeck has no mount
  scenario to port from).
- `src/harness.ts` — the gesture bench's probe (`window.__bench`): position,
  idle/settle detection, load injection, the published/index signals.
- `src/bench-dots.tsx` — this bench's own dots bar, rendered by every rival
  adapter (see "Method: the published/index signal" below).
- `src/<deck>-app.tsx` / `src/main-<deck>.tsx` / `bench-<deck>.html` — each
  deck's gesture-bench adapter, entry and page.
- `src/mount/` — the mount scenario's own harness (`harness.ts`), shared page
  body (`mount-app.tsx`, `dirty-sibling.tsx`) and each deck's client/SSR
  entry pair (`client-entry-<deck>.tsx`, `ssr-entry-<deck>.tsx`).
- `scripts/generate-mount-pages.mjs` — generates every static mount page
  from the SSR bundles, after both Vite builds run; see its own header
  comment.
- `vite.config.ts` / `vite.ssr.config.ts` — the client build (gesture pages
  - mount client entries) and the mount scenario's server-render build.
- `versions.json` — each rival's pinned version and npm release date.

## Method: the published/index signal

Every scenario's `setup`, and the mount scenario's own "correct first frame"
scoring, wait on the same signal: a dots bar whose `data-count` attribute
matches `SLIDE_COUNT`. For carouseldeck, this is its own real `Deck.Dots`
(`data-carouseldeck-dots`, ADR-0004) — the literal "Dots count" signal #333's
mount fix was measured against. For every rival, it is this bench's own
`BenchDots` component (`src/bench-dots.tsx`), driven only by that library's
own index-changed event or instance, starting at `count: 0` until that event
first fires — never pre-filled with `SLIDE_COUNT`, since every rival here
already knows its slide count statically from the JSX alone, and the point of
this signal (carried from #340's own mount lessons, "for each rival, its own
API's equivalent") is to measure genuine not-ready-yet time, not slide
counting. `harness.ts`'s `published()`/`index()` read this off the DOM
(`[data-bench-dots], [data-carouseldeck-dots]`), never a library's internals.

The gesture bench's motion probe (`harness.ts`'s `position()`) reads a
`trackSelector` element's `getBoundingClientRect().left`. Every adapter
marks its first rendered slide `data-bench-slide="0"`; a child element's
bounding rect shifts in viewport coordinates the same way whether the
library moves it with a CSS transform (Embla, Swiper, Splide), moves each
slide's own transform individually (Keen — found by reading
`keen-slider.es.js`'s own render step, not assumed) or lets the browser
scroll it (carouseldeck's native scroll-snap), so one selector convention
works for all five.

## Method: the mount scenario

New here (drawerdeck has no mount scenario to port). 2 and 20 instances of
one deck on a page ("deck" meaning one carousel instance, the overloaded word
`scenarios.ts`'s own header comment and #333's PR evidence table both use —
not five libraries mixed on the same page; every mount page benches one
library, like the gesture bench's own pages), in a production build,
hydrated from server-rendered HTML or rendered client-side, with and without
a sibling component dirtying layout in a layout effect just before each
instance mounts (`src/mount/dirty-sibling.tsx`). 40 cells: 5 decks x 2 n x 2
dirty x 2 mode.

Scored from a Chromium trace (`trace.ts`'s `analyzeMount`), from
`bench-mount-start` (the client entry's first line, before
`createRoot`/`hydrateRoot` runs — the whole task that contains this mark
counts its full duration, including the part that ran before the mark, not
only the part after it) to every instance publishing its state:

- **Main-thread busy time** (`mountTaskMs`): the sum of top-level `RunTask`
  trace events overlapping the window.
- **Layout and style-recalc work** (`layoutCount`/`layoutMs`,
  `styleRecalcCount`/`styleRecalcMs`): every `Layout`/`UpdateLayoutTree`
  trace event in the window, counted and summed. This does not classify a
  layout as "forced" versus one the browser scheduled as part of its own
  rendering lifecycle — a reliable black-box classification across five
  third-party libraries' own compiled code was not available from trace
  events alone (#333's own evidence used a white-box technique,
  `mount-layout.test.tsx`'s wrapped layout-reading APIs, specific to
  carouseldeck's own source). The clean/dirty-sibling pair of variants is
  what makes a forced layout's cost visible instead, by comparison between
  them, not by a label on one number.
- **Time to the first correct frame** (`timeToPublishedFrameMs`): the _last_
  presented frame in the capture at or after `bench-mount-start`, not the
  first one after the published mark. Found the hard way: a page with
  nothing left to animate stops asking the compositor for new frames once
  nothing changes, so there is usually no presented frame strictly _after_
  the published mark (itself written from a second `page.evaluate`
  round-trip, which reliably lands a few ms after the frame that already
  painted the correct state, not before it). 0, not a negative number, when
  the published state was already there at the very first paint (SSR's own
  natural-rest case, #333/#337: nothing for hydration to fix).

`mount.spec.ts` polls `window.__mount.published()` with `page.waitForFunction`
— never a fixed wall-clock window, which a CPU-throttled page (this scenario
runs at 4x CPU throttle, the same rate #333's own evidence used) can starve
to only a frame or two of real progress. Each test warms the page's origin
with an already-built gesture-bench page before attaching the CDP trace
session and navigating to the real mount page a second time: a fresh
Playwright page's first navigation away from `about:blank` can land in a
different renderer process than the one that serves same-origin navigations
after it, and a CDP trace session is bound to one target — found while
debugging a trace that silently carried zero events past that first
navigation.

Two real bugs surfaced building this, both fixed and covered by
`trace.test.ts` or visible in this file's own git history:

- The generated mount pages are static HTML written after both Vite builds
  run, so nothing links a deck's own CSS into them the way Vite's HTML-entry
  rewriting does for `bench-<deck>.html` automatically. Missing Embla's
  positioning CSS specifically collapsed its container to one slide width,
  which made Embla itself report a `scrollSnapList().length` of 1 instead of
  10 and `published()` never resolve. `vite.config.ts` now turns on
  `build.manifest`, and `scripts/generate-mount-pages.mjs` reads it to link
  every CSS file a mount entry pulls in.
- `trace.ts`'s own `CATEGORIES` list carried `devtools.timeline` (for
  `Layout`/`UpdateLayoutTree`) but not the separate
  `disabled-by-default-devtools.timeline` category `RunTask` events live in,
  so every deck's `mountTaskMs` scored as exactly 0 on the first real run.

## Interleaving

Never all reps of one library in a row: for each (scenario, load, loop) cell
in the gesture bench, and each (n, dirty, mode) cell in the mount scenario,
every rep shuffles the five decks' run order fresh (`seed.ts`'s `shuffle`,
one ongoing deterministic stream). The whole sequence is reproducible from
one seed, written to `results/seed.txt`/`results/mount-seed.txt` and to every
row's own `seed` field (`BENCH_SEED`; the CI workflow sets it per shard so
shards differ from each other but each is independently reproducible).

## Not supported

`wheel-scroll-next` dispatches one wheel/trackpad tick. Carouseldeck responds
natively (CSS scroll-snap containers scroll on wheel input with no extra
code); Swiper responds because its own bundled `Mousewheel` module is enabled
(`modules={[Mousewheel]}`, `mousewheel`, its own documented, non-default way
to support this — see `src/swiper-app.tsx`'s header comment). Embla, Keen and
Splide ship no wheel/mousewheel support in their base package (each would
need a separate plugin package, which the issue's own allowed-dependency
list for this bench does not include), so they report "not supported" for
this scenario — the same fairness treatment drawerdeck gave React Aria's
Sheet for `mouse-drag-throw` (rule 11). This was confirmed empirically in
this PR's own local pass: `responded: false` for embla, keen and splide at
`load=0, loop=false`, `responded: true` for carouseldeck and swiper, in every
rep.

## Local smoke check

Not a timing run: proves the pipeline works end to end before trusting a
real CI run.

```sh
# From the repo root, with the workspace installed:
pnpm install
pnpm --dir decks/carouseldeck/packages/core build
pnpm --dir decks/carouseldeck/packages/react build
pnpm exec playwright install chromium   # once

pnpm --dir decks/carouseldeck/bench build

# Smoke: every deck publishes its dots bar at slide 0.
pnpm --dir decks/carouseldeck/bench exec playwright test -c playwright.config.ts smoke.spec.ts

# One rep, one load, one loop setting, every deck/scenario, interleaved:
BENCH_REPS=1 BENCH_SEED=smoke SHARD_ID=local \
  pnpm --dir decks/carouseldeck/bench exec playwright test -c playwright.config.ts bench.spec.ts \
  --grep 'load=0 loop=false'

# The whole mount matrix, one rep:
MOUNT_REPS=1 BENCH_SEED=smoke SHARD_ID=local \
  pnpm --dir decks/carouseldeck/bench exec playwright test -c playwright.config.ts mount.spec.ts

python3 decks/carouseldeck/bench/report.py decks/carouseldeck/bench/results
python3 decks/carouseldeck/bench/report-mount.py decks/carouseldeck/bench/results
```

### This PR's own local pass (not results — read as a smoke run only)

Run on this development machine, shared with other work, 2 reps per cell:
50 gesture rows (one `(scenario, load=0, loop=false)` slice, all five
decks, `BENCH_SEED=local-pass`) and the full 80-row mount matrix
(`BENCH_SEED=local-mount-pass`). Both passed end to end — every scenario
responded as expected (see "Not supported" above), and `aggregate.py` /
`aggregate-mount.py` both ran cleanly against this single-shard data,
confirming the reporting pipeline as well as the bench itself. These numbers
are from one shared, unquiet machine and 2 reps, not six dedicated CI shards
at 3+ reps: they prove the plumbing, not a result. Representative rows, median
of 2:

| Scenario                         | carouseldeck | embla         | keen          | swiper | splide |
| -------------------------------- | ------------ | ------------- | ------------- | ------ | ------ |
| `touch-swipe-next` settle (ms)   | 2016         | 2592          | 1730          | 1614   | 1724   |
| `mouse-drag-release` settle (ms) | 1496         | 2104          | 1580          | 1356   | 1500   |
| `wheel-scroll-next` settle (ms)  | 1038         | not supported | not supported | 1075   | 1047   |

| Mount cell                                       | carouseldeck | embla | keen | swiper | splide |
| ------------------------------------------------ | ------------ | ----- | ---- | ------ | ------ |
| `n=20, clean, ssr`: layout count                 | 0            | 21    | 1    | 20     | 60     |
| `n=20, clean, ssr`: time to published frame (ms) | 0.0          | 101.4 | 24.3 | 122.5  | 85.4   |
| `n=20, dirty, csr`: layout count                 | 1            | 22    | 21   | 21     | 61     |

Carouseldeck's 0 layout reads and 0ms time-to-published-frame at `n=20,
clean, ssr` are exactly what #333/#337's own fix predicts (a natural-rest
mount measures nothing, and SSR's server markup is already the published
state); every rival's own measurement work scales with instance count the
way their own on-mount snap-point computation would be expected to. A real
CI run, not a local pass, is what decides whether any of this is a real win
or a tie — see "Fairness," rule 7.

## Re-running the full bench

`.github/workflows/carousel-bench.yml`, `workflow_dispatch` (inputs
`reps_per_shard` and `mount_reps_per_shard`, both default 3) or weekly. Eight
`bench` shards run the gesture scenarios (5 scenarios x 3 loads x 2 loop
settings x 5 decks, a larger matrix than drawerdeck's 4x3x4 — hence more
shards and a lower default rep count than drawerdeck's 6 shards at 5 reps);
four `mount-bench` shards run the mount scenario (5 decks x 2 n x 2 dirty x 2
mode, at 4x CPU throttle). The `report` job pools every shard's rows for
both and uploads `RESULTS.md`/`aggregate.jsonl` and
`MOUNT-RESULTS.md`/`mount-aggregate.jsonl` as the `carousel-bench-report`
artifact, and writes both at-a-glance tables to the run's job summary.

Building `@carouseldeck/react` in CI runs `pnpm --dir
decks/carouseldeck/packages/core build` then `pnpm --dir
decks/carouseldeck/packages/react build` directly, rather than the deck's
own whole-deck `build` script (drawerdeck's bench workflow's own choice):
the bench only needs these two packages, and the deck's own `build` also
builds `react-18`, `apps/storybook`, `scripts` and `tests/compare`, which
this bench's build does not need and would only slow the job down.

## Scope notes

- `verify.mjs`'s new `RULES` entry for `decks/carouseldeck/bench/` only
  needs `format:check` and `lint` (both glob the whole deck directory from
  package.json's own scripts); the package has no `typecheck` script and is
  not in the deck's own `tsconfig.json` project references or `build`
  filter, the same choice drawerdeck made keeping its own bench out of
  `decks/drawerdeck`'s build/typecheck. Note for whoever reads this next:
  drawerdeck's own `verify.mjs` has no path-based `--changed` gating at all
  (only carouseldeck's does), so there was no existing "how drawerdeck maps
  its bench" precedent to follow here — this rule was designed from reading
  what `format:check`/`lint` actually scan, not copied from one.
- A duplicate `id="viewport"`/`id="next"`/`id="prev"`/`data-bench-slide="0"`
  exists on every instance of a mount page with `n` > 1 (invalid HTML,
  harmless here): the mount scenario only ever queries
  `[data-bench-dots]`/`[data-carouseldeck-dots]` by attribute selector, never
  those ids, and no gesture code runs on a mount page.
- `@splidejs/react-splide@0.7.12`'s `exports` map has no `types` condition,
  so `moduleResolution: "bundler"` cannot see its real `dist/types/index.d.ts`
  through the bare package specifier; `tsconfig.json`'s own `paths` entry and
  `src/ambient.d.ts` (for its `./css` export, which has the same gap) fix
  this for local type-checking only — not a gate here, since this package
  has no `typecheck` script, but worth knowing before adding a fourth
  `@splidejs/*` import expecting it to "just work."
