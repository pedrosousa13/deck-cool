# Drawer bench (#266, #283)

Benches `@drawerdeck/react` against pinned versions of vaul, Base UI's
Drawer and React Aria's Sheet, on motion (stalls, settle times) and cost
(bundle size, script time per frame). Moved here from the throwaway
`prototype/drawer-bench` branch (`decks/carouseldeck/prototypes/drawer-bench/`,
#233/#245), as a private workspace package: `@drawerdeck/react` is a
`workspace:*` dependency, so it always measures the commit under test, not a
packed tarball from some other checkout.

**This file does not hold timing numbers.** A real run only means something
on a quiet, dedicated CI runner (#219's and #245's own finding: a shared
4-core machine biased the original prototype's results), interleaved across
all four drawers so no library's reps land disproportionately on a busier
or quieter stretch of the run (#266). `.github/workflows/drawer-bench.yml`
runs the bench on six parallel `ubuntu-latest` shards, on
`workflow_dispatch` and weekly; its `report` job pools every shard's rows
into medians, spread and n per cell, plus a per-shard winner table, and
uploads both as the `drawer-bench-report` artifact (`RESULTS.md`, generated
by `aggregate.py`, and the pooled `aggregate.jsonl`) -- read that artifact
from the workflow's run page for real numbers, not this file.

## Fairness (#266)

Every number this bench reports is checked against the maintainer's ten
fairness rules (#266's own "Fairness rules" comment) before it goes on the
comparison page:

1. **Same runner, interleaved.** One Playwright worker, in the foreground
   (`playwright.config.ts`: `workers: 1`, `fullyParallel: false`); within
   that, every rep shuffles all four decks' run order fresh -- see
   "Interleaving" below.
2. **Production builds for everyone.** `vite build` (never dev mode) for
   every deck's bench entry, from one `vite.config.ts` with one set of
   `rolldownOptions`; one pinned React/react-dom version shared by all four
   (`package.json`); no `<StrictMode>` anywhere in `src/main-*.tsx`.
3. **Each rival configured the way its own docs recommend.** Every rival
   adapter (`src/vaul-app.tsx`, `src/baseui-app.tsx`, `src/reactaria-app.tsx`)
   links the doc page it follows at its own top, and lists every option it
   sets that isn't that library's own default, with why. "Method notes" and
   "React Aria's Sheet" below cover the positioning CSS each one's own
   quickstart requires.
4. **The same task.** `src/content.ts`'s 50 rows and `[0.5, 0.92]` snap
   fractions, passed to every deck in the convention its own `snapPoints`
   expects (see each adapter); React Aria's Sheet is the one exception
   recorded in full under "React Aria's Sheet" below (percentage strings,
   not bare fractions). One viewport (`playwright.config.ts`'s 390x760) and
   one device scale factor (Playwright's `Desktop Chrome` device preset,
   unset by any project here) for every rep, and one shared stylesheet
   convention (`.panel`, `.handle`, `.inner-list`, `.bench-row`) styled
   per-deck only where a library's own docs require positioning CSS.
5. **Latest stable versions, pinned, with release dates.** See "Versions"
   below.
6. **A warm-up rep, discarded.** See "Warm-up rep, discarded" below.
7. **Ties are ties.** `aggregate.py`'s `cell_winner` only names a winner
   when every shard's own pooled winner agrees _and_ the gap between the
   best and second-best pooled medians beats the winning deck's own spread
   across shards; otherwise the cell reports `tie`.
8. **Reproducible and reviewable.** Every adapter here is checked into the
   repo; raw results, the pooled `aggregate.jsonl` and every rep's gzipped
   trace are the artifacts `.github/workflows/drawer-bench.yml` uploads.
   "Re-running the full bench" and "Local smoke check" below say how. The
   comparison page this feeds is expected to invite each rival's own
   maintainers to flag a misconfiguration.
9. **Losses stay visible.** `aggregate.py`'s `render_tables` prints every
   metric in `METRICS` for every deck, win or lose; `render_summary`'s
   at-a-glance table is an index into those full tables, never a
   replacement for them.
10. **Stalls score motion, not a scripted pause.** Dropped frames, the
    longest stall and the hitch ratio are scored only from a gesture's own
    active window, not the scenario's own pauses between gestures. See
    "Active windows" below.

## Versions, with release dates (#266 rule 5)

| Deck                                       | Version                                 | Released   |
| ------------------------------------------ | --------------------------------------- | ---------- |
| `@drawerdeck/react`                        | this commit (`workspace:*`, unreleased) | -          |
| vaul                                       | 1.1.2                                   | 2024-12-14 |
| `@base-ui/react` (Base UI's Drawer)        | 1.9.0                                   | 2026-10-09 |
| react-aria-components (React Aria's Sheet) | 1.22.1                                  | 2026-10-09 |

The release dates come from `npm view <pkg> time --json`, read once by hand
and checked into `versions.json` -- so neither this file nor a CI run has to
hit npm for them. `aggregate.py`'s generated report reads the same file for
its own header. Re-run the `npm view` command and update `versions.json`
whenever a pinned version bumps.

## Warm-up rep, discarded (#266 rule 6)

Every rep here already gets its own fresh page (Playwright's test-level
context isolation, not a context or page shared across reps), so there is
no later, already-warm rep on the _same_ page load to serve as the
unscored baseline the rule describes. Instead, `bench.spec.ts`'s
`runPass` runs the whole scenario once, right after the fresh `page.goto`,
discarded (recorded in the jsonl with `warmup: true`, but excluded from
every median, spread and winner `aggregate.py`/`report.py` compute); the
page then reloads before the real, scored pass runs the same scenario
again.

The reload -- rather than reusing the warmed-up DOM in place for the scored
pass -- is deliberate: drawerdeck's own dismiss is drag-past-the-lowest-
snap-point only (`src/drawerdeck-app.tsx`'s own comment: "not a close
button or Escape"), so there is no deck-agnostic way to put all four
drawers back at a scenario's starting snap point in between without a
fresh load. The reload still reuses Chromium's own HTTP and V8 code caches
for this origin, the way a real second visit to the page would, so the
scored rep isn't the one paying for a cold parse/compile.

## What's here

- `decks.ts` -- the four drawers: `drawerdeck`, `vaul`, `baseui`,
  `reactaria`, each a static page (`bench-<deck>.html`) sharing
  `window.__bench` (`src/harness.ts`) and a `#panel` marker.
- `scenarios.ts` -- the bench's four scenarios (touch drag half<->full<->back,
  touch flick dismiss, mouse drag throw, open to half), unchanged from the
  original prototype.
- `trace.ts` -- copied from `decks/carouseldeck/prototypes/scroll-snap/bench/trace.ts`
  (a cross-deck import would couple this deck's bench to carouseldeck's;
  copying it in means it can diverge, which it already has: `frameTimeline`
  is new here, for #243 below, and so is the active-window scoring, for
  "Active windows" below).
- `trace.test.ts` -- unit tests for `trace.ts`'s scorer, against synthetic
  trace timelines (`node --test trace.test.ts`, or `pnpm test` in this
  package; not part of `pnpm --dir decks/drawerdeck verify`, see this
  deck's own `AGENTS.md`).
- `seed.ts` -- the interleaving's deterministic shuffle (next section).
- `bench.spec.ts` -- the real run: Chromium only (a drawer's touch scenarios
  need CDP's trusted touch), one JSON line per run to
  `results/chromium.jsonl`, plus a gzipped raw trace and a frame timeline
  per rep under `results/traces/`.
- `bundle-size.mjs` -- min+gzip per deck, React external, measured against
  each deck's own bench entry (so React Aria's figure is `Sheet`'s whole
  import cost: Modal, overlays, focus management, everything it pulls in).
- `report.py` -- local single-run tables (`python3 report.py results`), the
  same shape as the original prototype's. `aggregate.py` is the multi-shard
  version the GitHub Actions `report` job runs; see its own header.
- `smoke.spec.ts` -- the local smoke check: every deck opens to ~half.
- `versions.json` -- each rival's pinned version and npm release date
  (#266 rule 5; see "Versions" below), checked in so `aggregate.py` never
  has to call npm.

## Interleaving (#266)

Never all reps of one library in a row: for each (scenario, load), every
rep shuffles the four decks' run order fresh (`seed.ts`'s `shuffle`,
consuming one ongoing deterministic stream), so library A's reps are not
systematically earlier or later in the run than library B's. The whole
sequence is reproducible from one seed, written to `results/seed.txt` and
to every row's own `seed` field (`BENCH_SEED` env var; the workflow sets it
per shard so shards differ from each other but each is independently
reproducible).

## Traces, for #243 (#266)

#245's quiet re-run could not say whether drawerdeck's touch-drag stall is
real or a bench artifact, because no run of the original prototype ever
kept a trace: `captureTrace`'s raw events were reduced into summary numbers
and discarded. This bench keeps both, per rep, gzipped:

- `results/traces/<deck>__<scenario>__load<n>__rep<n>__<shard>.trace.json.gz`
  -- the raw CDP trace (`TraceEvent[]`), including the `input`/`latencyInfo`
  categories.
- `results/traces/<deck>__<scenario>__load<n>__rep<n>__<shard>.frames.json`
  -- `trace.ts`'s new `frameTimeline` export: the same `PipelineReporter`
  frames `analyzeMotion` scores, as a plain list of `{ts, state,
hasCompositorAnimation, hasMainAnimation}`, so a stall can be checked
  against frame timestamps without decompressing and re-parsing the raw
  trace for every pass.

This PR's own smoke run (one shard, one rep, load=0 only; see "Local smoke
check" below) is too small to settle #243 on its own, but a direct look at
drawerdeck's `touch-drag-half-full-back` trace from that run supports
hypothesis 3 (#243's own comment thread) for at least part of the gap: the
500ms longest-stall window (two presented frames ~500ms apart) has _no_
touch `input`-category event inside it at all. The last input activity
before the gap is `InputHandlerProxy::HandleGestureScrollEnd` (the first,
half->full drag ending); the next is the second drag's `touchstart`
(`GestureProvider::OnTouchEvent`), ~400ms later -- matching
`scenarios.ts`'s mid-run `settle()` call almost exactly
(`waitForTimeout(100)` + a wait for `idleFor() > 400`ms). So in this one
rep, the "stall" is genuinely idle time with no input to respond to, not a
frame the browser failed to produce on time. That is one rep at one load,
not the statistical picture #243 needs (whether this holds across loads,
and whether it's the _whole_ gap or only part of it once a real drag is
running under load, needs the full run); it does rule out "a late input
event" as the cause, for this rep.

## Active windows (#266 rule 10)

The trace diagnosis above found a real cause, not a fixable one on the
scenario's own side: `touch-drag-half-full-back` pauses for its own
`settle()` wait between the drag up and the drag down, and a drawer that
finishes moving quickly then sits still through that pause used to be
scored as if the idle time itself were a stall, while a drawer whose
release animation kept drawing frames through the same wall-clock window
scored _better_ for finishing more slowly.

`scenarios.ts` now marks each gesture's own active window: `markWindowStart()`
right before dispatching its first input event (a touch or pointer down,
or a click for `open-to-half`), and `markWindowEnd()` from `settle()`, once
the drawer has been quiet for the settle detector's threshold (or `settle()`
hits its own timeout). `touch-drag-half-full-back` produces two windows,
one per drag, with the scenario's own pause between them outside both.

`trace.ts`'s scorer (`analyzeMotion`) restricts dropped frames, the longest
stall and the hitch ratio to frames inside those windows: a gap between two
presented frames only counts as a stall when both sit inside the _same_
window. That excludes the idle time between gestures by construction (the
two frames bounding that gap belong to different windows), and it excludes
the quiet tail after a gesture settles for the same reason the idle time
between gestures always scored correctly in between-trace comparisons --
nothing presents while the drawer is truly still, so there is no later
presented frame left inside the window to gap against.

The pre-fix numbers (one window spanning the whole trace, exactly what a
run before this fix scored) are still computed and reported, in each
affected table's "unscoped (legacy)" columns (`aggregate.py`'s and
`report.py`'s `legacy_pick`, reading `trace.legacy` off the same row) --
so the change stays visible rather than swapping numbers quietly, and a
reader can see the old, unfair gap directly.

## React Aria's Sheet (#283)

- **Import**: `react-aria-components@1.22.1`'s own `Sheet` subpath export
  (`react-aria-components/Sheet`: `SheetTrigger`, `SheetOverlay`, `Sheet`,
  `SheetBackdrop`, `SheetContent`), confirmed against the package's shipped
  `dist/exports/Sheet.*`, not just its docs page.
- **Snap points**: its `snapPoints` prop reads a bare number as pixels of
  the sheet visible, and a percentage string as "relative to the size of
  the sheet" -- not vaul's/Base UI's bare 0-1 "fraction of the viewport
  height". Passed as `['50%', '92%']` (`src/content.ts`'s
  `HALF_FRACTION_PCT`/`FULL_FRACTION_PCT`), matching the other two decks'
  `[0.5, 0.92]` once `Sheet`'s own box is bounded to the viewport height
  (next point) -- "the size of the sheet" is otherwise its _content's_
  height, not the viewport's.
- **No `position: fixed` needed, but a height bound still is.** React
  Aria's Sheet manages its own fixed/absolute layout and scroll-snap
  internally -- the design the "Scrolling is All You Need" blog post
  describes -- so it needs none of vaul's/Base UI's own
  `position: fixed`/`max-height` positioning CSS (see "Method notes"
  below). It does not, on its own, bound `Sheet`'s box to the viewport
  height, though: found empirically (the same method used for vaul's own
  CSS fix), without a height set, the box sizes to its 50-row content
  (2172px), not 100dvh, which also breaks the snap-point percentages above
  since they are relative to that box. `src/reactaria.css`'s
  `height: 100dvh` fixes this, the same category of fix vaul needs; it also
  gives `SheetContent` a flex column so the handle and the row list stack
  top to bottom inside that now-bounded box.
- **Mouse drag does not work.** The compiled source attaches no
  pointer/touch listener of its own: the sheet is a native
  `overflow-y: auto` scroll container with CSS scroll snap
  (`data-sheet-scroll`), and a generic scrollable `div` does not turn a
  left-button press-move-release into a scroll in Chromium the way touch or
  a trackpad pan does. The smoke run confirms this empirically: React
  Aria's `mouse-drag-throw` scenario leaves the sheet at the same openness
  it started from (vs. the other three decks, which all move). This is a
  real cost of the "scrolling is all you need" design, not a bench bug --
  it was not mentioned in the blog post, which is why #283 asked for it to
  be checked and recorded here.

## Method notes (carried forward from the original prototype)

- **vaul and Base UI are headless: the quickstart examples alone do not
  position the drawer.** vaul's `Drawer.Content` needs `position: fixed;
left: 0; right: 0; bottom: 0` from the consumer; without it every snap
  offset vaul computes lands at the wrong screen position. It further needs
  a bounded height (`max-height: 100dvh; overflow: hidden`, a flex column)
  or the panel renders at its full, unclipped content height. Both fixes
  are in `src/vaul.css`.
- **vaul's own shipped `style.css` is not reachable through its `exports`
  map**, and has one invalid selector (a stray colon) that this project's
  CSS minifier refuses outright; vendored into `src/vaul-vendor.css`,
  copied verbatim except for that one fix.
- **Base UI's Drawer needed its own positioning CSS too** (`src/baseui.css`),
  from its own quickstart: `height`/`transform` driven by the CSS custom
  properties it sets, and `position: fixed; inset: 0; pointer-events: none`
  on the viewport.
- **`geometry()` on a closed vaul, Base UI or React Aria drawer would poll
  for ~30s per rep** if called: none of the three render `#panel` while
  closed (drawerdeck always renders it, hidden inside a closed
  `<dialog>`), and Playwright's locator actions wait out their default
  actionability timeout for an element that doesn't exist yet. Fixed with
  `needsGeometry: false` on the one scenario that starts closed
  (`open-to-half`).
- **`longestStallMs` for `touch-drag-half-full-back` is scored per gesture,
  not across the scenario's own mid-gesture `settle()` wait** (#266 rule
  10, above): the drag up and the drag down are two active windows, and
  the idle time between them is never scored as a stall. The "unscoped
  (legacy)" columns show what the same trace would have scored before that
  fix, for comparison. See "Traces, for #243" above for how to check a
  stall against frame and input timestamps directly.
- **LoAF during scenario 1 is dominated by the injected load, not by a
  library's own cost.** All four show zero LoAF entries at load=0 in every
  prior run; the loaded columns are the busy-loop's own cost.
- **`blankFrames` is not measured for any deck.** A drawer has no seam (the
  carousel-specific reason this signal existed), so it always reports 0.
- **No iPhone, WebKit or Firefox pass.** This bench is Chromium-only (CDP's
  trusted touch is Chromium-only in Playwright, and three of four scenarios
  need it); nothing here says anything about Safari, iOS or Firefox.

## Local smoke check

Not a timing run: one shard, one rep, one load, all four drawers, to prove
the plumbing works end to end before trusting a real CI run.

```sh
# From the repo root, with the workspace installed and drawerdeck built:
pnpm install --frozen-lockfile
pnpm --dir decks/drawerdeck build
pnpm --dir decks/drawerdeck/bench build
pnpm exec playwright install chromium   # once

# Smoke: every deck opens and closes.
pnpm --dir decks/drawerdeck/bench exec playwright test -c playwright.config.ts smoke.spec.ts

# One rep, one load, every deck/scenario, interleaved:
BENCH_REPS=1 BENCH_SEED=smoke SHARD_ID=local \
  pnpm --dir decks/drawerdeck/bench exec playwright test -c playwright.config.ts bench.spec.ts \
  --grep 'load=0 '

python3 decks/drawerdeck/bench/report.py decks/drawerdeck/bench/results
```

## Re-running the full bench

`.github/workflows/drawer-bench.yml`, `workflow_dispatch` (input
`reps_per_shard`, default 5) or the weekly schedule. Six parallel
`ubuntu-latest` shards each run the complete interleaved bench; the
`report` job pools every shard's rows and uploads `RESULTS.md` plus the
pooled `aggregate.jsonl` as the `drawer-bench-report` artifact, and writes
the at-a-glance table to the run's job summary.
