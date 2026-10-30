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

Every number this bench reports is checked against the maintainer's twelve
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
   quickstart requires; "Entrance animation audit" below covers each one's
   documented entrance/exit CSS and backdrop setup, and the guard that now
   checks for it (#304).
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
11. **A drawer that does not respond to a gesture cannot win it.** (#294)
    `aggregate.py` and `report.py` mark a deck "not supported" for a
    scenario it never responded to, and drop it from that scenario's
    winners and ties. See "Not supported" below.
12. **A dismiss counts only when the library reports it closed.** (#311)
    `aggregate.py` and `report.py` mark a deck "did not close" for a
    dismiss scenario it never reported itself closed for, and drop it
    from that scenario's winners and ties, the same treatment rule 11
    gives "not supported". See "React Aria's Sheet never closed on a
    flick" and "Did not close" below.

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
  original prototype except for `Scenario.dismiss` (#311, "Did not close"
  below), set on `touch-flick-dismiss` only.
- `trace.ts` -- copied from `decks/carouseldeck/prototypes/scroll-snap/bench/trace.ts`
  (a cross-deck import would couple this deck's bench to carouseldeck's;
  copying it in means it can diverge, which it already has: `frameTimeline`
  is new here, for #243 below, and so is the active-window scoring, for
  "Active windows" below).
- `trace.test.ts` -- unit tests for `trace.ts`'s scorer, against synthetic
  trace timelines (`node --test trace.test.ts`, or `pnpm test` in this
  package; not part of `pnpm --dir decks/drawerdeck verify`, see this
  deck's own `AGENTS.md`).
- `aggregate_test.py` -- unit tests for `aggregate.py`'s "not supported"
  rule (#294, #266 rule 11) and its "did not close" rule (#311, #266 rule
  12), against a tiny synthetic jsonl (`python3 aggregate_test.py`); not
  part of `pnpm --dir decks/drawerdeck verify` either.
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
- `animates.spec.ts` -- the entrance-animation guard (#304, "Entrance
  animation audit" above): every deck's panel must move across several
  real frames on open, not snap.
- `closes.spec.ts` -- the dismiss-closes guard (#311, "Did not close"
  above): drawerdeck, vaul and Base UI must report
  `window.__bench.isOpen() === false` within 2s of the
  `touch-flick-dismiss` gesture; React Aria's Sheet is a documented
  exception, asserted the other way (see "Did not close", "Guard" above).
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
  be checked and recorded here. Because of this, React Aria reports "not
  supported" for `mouse-drag-throw` rather than a winning settle time --
  see "Not supported" below (#294, #266 rule 11).
- **A flick never closed it, in this bench's environment (#311, fairness
  rule 12).** `SheetOverlay`'s own swipe-to-dismiss detection -- an
  `IntersectionObserver` on `[data-sheet-content]`, in the package's own
  `dist/private/Sheet.mjs` -- never re-fired after its first, mount-time
  notification once a native scroll (not a `scrollTo()` call) carried the
  sheet off-screen, so `state.close()`/`onOpenChange(false)` never ran for
  a swipe dismiss here. `src/reactaria-app.tsx` drives `SheetTrigger` as
  controlled (`isOpen`/`onOpenChange`, both documented props) only to read
  that state back out; nothing in this bench closes the sheet itself. See
  "React Aria's Sheet never closed on a flick" below for the full finding.

## React Aria's Sheet never closed on a flick (#311, #266 rule 12)

**Symptom.** `touch-flick-dismiss` visibly scrolled React Aria's Sheet
out of view (`window.__bench.openness()` reached 0, same as every other
deck), and the bench recorded a fast "settle" -- but the Sheet itself
stayed mounted and open: `#panel` never left the DOM, unlike drawerdeck's
real `<dialog>` close for the same gesture.

**Root cause.** `SheetOverlay`'s own swipe-to-dismiss detection (its `ref`
callback, `dist/private/Sheet.mjs`) is an `IntersectionObserver` on
`[data-sheet-content]`, thresholds `[0, 1]`: it sets a `hasEntered` flag
once the content's intersection ratio is above 0, then calls
`state.close()` once the ratio drops back to 0 or below. Confirmed with a
local probe (`IntersectionObserver.prototype.observe`/`takeRecords`,
monkey-patched in a throwaway script, against the built
`bench-reactaria.html`): that observer's callback fires exactly once per
mount -- the initial, synchronous notification every
`IntersectionObserver.observe()` call delivers, reporting the sheet's
still-exited rest position from before any scroll -- and never again,
with or without `snapPoints`. Even a slow, ~1.8s hand-drag that visibly
moves the sheet from fully open (`openness()` 760) to fully closed
(`openness()` 0) produces no further notification once the touch
sequence's native momentum/snap-settling scroll takes over (a programmatic
`scroller.scrollTo({behavior: 'smooth'})`, by contrast, does get a second
notification once it completes -- confirmed by watching the open
animation separately). So `hasEntered` never sets, and
`state.close()`/`onOpenChange(false)` never run for a swipe dismiss in
this bench's environment. Every CSS/structural variant tried against the
built page -- `.panel`'s `height: 100dvh` vs. the starter's own
`height: auto; max-height: ...`, `overflow: clip` vs. `hidden` on
`.react-aria-SheetOverlay`, disabling the `view-timeline` CSS property
`SheetContent` sets on the same element, `Sheet`'s own `overscrollPadding`
prop, one `snapPoints` value vs. two vs. none, a forced reflow after the
gesture -- left the same single-notification behavior unchanged; only
dropping `snapPoints` entirely (not an option here: fairness rule 4 needs
the same half/full task every deck gets) let the _open_ animation's two
endpoints (ratio 0, then ratio 1) both register, and even then a
following flick-dismiss got only one more notification before going
silent again.

**This is not treated as a React Aria bug, and is not patched around.**
Rule 3 (fairness) sets up every rival the way its own docs say; React
Aria's docs describe no poll of the sheet's own DOM position to detect a
swipe close, so adding one here would be this bench patching a rival with
its own code, not reviewing React Aria "as documented." An earlier version
of `src/reactaria-app.tsx` did add such a poll (a `requestAnimationFrame`
loop reading `[data-sheet-content]`'s `getBoundingClientRect()` every
frame and calling the controlled `onOpenChange(false)` once the content
had entered view and then left it) -- reverted, both for rule 3 above and
because it ran JS on every frame inside React Aria's page, inflating React
Aria's own dropped-frame numbers on every drag scenario, not just the
dismiss one.

**Left as-is.** `src/reactaria-app.tsx` drives `SheetTrigger` as a
controlled component (`isOpen`/`onOpenChange`, both documented
`SheetTriggerProps`, inherited from `DialogTriggerProps`) so it can report
that state to `window.__bench.isOpen()`; nothing in this adapter calls
`setIsOpen(false)` itself. A flick dismiss on React Aria's Sheet is scored
as "did not close" (rule 12, "Did not close" below) -- excluded from
`touch-flick-dismiss`'s winners and ties rather than given a fast settle
time on scroll motion alone.

**This may be specific to this bench's environment.** Headless Chromium,
CDP's synthetic touch and a native (not `scrollTo()`-driven) scroll are
not how every real user dismisses a sheet; this finding has not been
checked against a real device or a real touchscreen, and a different
environment may give React Aria's `IntersectionObserver` the notification
it needs. `closes.spec.ts` (below) keeps a documented, checked-in
assertion that React Aria still does not report closed here, so this
write-up and the guard both go stale together if that ever changes.

**Sources.** `react-aria-components@1.22.1`'s own
`dist/private/Sheet.mjs`/`dist/types/src/Sheet.d.ts` (shipped source, read
directly -- the IntersectionObserver logic above is not in the public
docs); https://react-aria.adobe.com/Sheet (the "Example" and "Snap
points" sections: `SheetTrigger` > `SheetOverlay` > `SheetBackdrop` +
`Sheet` > `SheetContent`, matching this adapter's structure, and
`isOpen`/`onOpenChange` as `SheetTrigger`'s documented controlled props);
the react-spectrum repo's `starters/docs/src/Sheet.tsx`/`Sheet.css` (the
package's own starter this doc page is built from: `overscrollPadding`,
`height: auto; max-height: calc(100% - 32px)`, `[data-expanded]`-gated
content overflow -- each tried against the bug above, with no effect).

## Entrance animation audit (#304, #266 rule 3)

A trace found `src/baseui.css` gave Base UI's Drawer no `transition` and no
`[data-starting-style]`/`[data-ending-style]` rules at all, so it snapped
open and settled instantly while drawerdeck ran its own documented 300ms
entrance -- unfair on the `open-to-half` and mouse-throw comparisons. Fixed,
and the other two rivals' own docs re-audited the same way (rule 3):

- **Base UI.** Missing a `transition` on the popup, the
  `[data-starting-style]`/`[data-ending-style]` transforms, the release
  duration scaled by `--drawer-swipe-strength`, and the whole backdrop --
  `Drawer.Backdrop` was never rendered, so the dim CSS its docs give it had
  nothing to apply to. All copied from the packaged doc's "Snap points" CSS
  Modules recipe (`node_modules/@base-ui/react/docs/react/components/
drawer.md`, the one matching this bench's own `snapPoints` usage); see
  `src/baseui.css`'s own header comment for the exact lines.
- **vaul.** Missing `Drawer.Overlay` entirely (the getting-started
  quickstart's own anatomy: `<Drawer.Overlay className="fixed inset-0
bg-black/40" />`, before `Drawer.Content`), so vaul's own shipped fade
  CSS (`vaul-vendor.css`'s `[data-vaul-overlay]` rules, already vendored
  and untouched) had no element to drive. Added the element
  (`src/vaul-app.tsx`) and its required position/dim CSS (`src/vaul.css`),
  the same category of fix `Drawer.Content` already needed.
- **React Aria's Sheet.** The panel itself needed no CSS fix -- its
  entrance is a native smooth scroll the engine drives, not a CSS
  transition (`src/reactaria-app.tsx`'s own header comment) -- but
  `SheetBackdrop` was rendered with no `swipeAnimation`, so it painted
  nothing: no background, no fade. Given the package's own starter
  example's props and CSS (react-aria.adobe.com/Sheet's "Example", built
  from the react-spectrum repo's `starters/docs/src/Sheet.tsx`/`Sheet.css`):
  `swipeAnimation="sheet-backdrop"`, `swipeAnimationRange={{start: 1}}`
  (fade in only past the last snap point, the same default vaul's
  `fadeFromIndex` uses), a `rgb(0 0 0 / 0.4)` background and the
  `sheet-backdrop` keyframes (`src/reactaria.css`).
- **drawerdeck.** Checked against its own guides
  (`decks/drawerdeck/packages/docs/guides/animate-the-drawer.md` and
  "Style the backdrop") line for line: `src/drawerdeck.css` already matches
  the documented recipe exactly, and already explains (its own header
  comment) why it renders no `Drawer.Backdrop` -- no scenario here exercises
  one.

**Guard.** `animates.spec.ts` loads each bench page, clicks `#trigger`, and
samples `window.__bench.openness()` every frame for 900ms right after, in
one `page.evaluate` call so the click and the first sampled frame land in
the same task. It asserts the panel's position changes (>0.5px) across at
least 3 of those frames, for every deck -- a real multi-frame entrance,
not a snap. Reverting the Base UI fix locally and re-running it reproduces
the bug this was written for: 0 changed frames, where every other deck
clears the bar comfortably. `pnpm --dir decks/drawerdeck/bench animates`
runs it (not part of `pnpm --dir decks/drawerdeck verify`, the same as
`smoke.spec.ts` and `bench.spec.ts`; see this deck's own `AGENTS.md`).

## Not supported (#294, #266 rule 11)

A drawer that never responds to a scenario's own gesture still finishes
`settle()`, at that function's own timeout, so "settle time" alone cannot
tell "fastest" from "never moved" -- which is how React Aria's Sheet, never
moving a pixel for `mouse-drag-throw` (see "Mouse drag does not work"
above), was crowned that scenario's winner before this rule existed.

`bench.spec.ts` records whether a gesture actually moved the drawer as
`responded: true|false` on every row, from the same per-frame probe
`harness.ts` already tracks (`raf.maxStep`, in `window.__bench.m`): a
drawer that moves by more than 2px in any single frame during the gesture
and its settle responded; one that never clears that threshold did not.
`maxStep`, not `travel` (the signed, cumulative px moved), is the right
signal here -- `touch-drag-half-full-back` drags a drawer up and then back
down to where it started, so a drawer that genuinely moved still nets
close to 0 `travel`, while its `maxStep` still shows the drag's own
per-frame motion.

`aggregate.py` and `report.py` mark a deck "not supported" for a scenario
when `responded` is `false` in most (more than half) of its scored reps for
that scenario, pooled across every load: one rep timing out for an
unrelated reason never flips this, but a deck that consistently ignores the
gesture does. A "not supported" deck's row in that scenario's tables reads
"not supported" instead of a number, it never enters `winner_of`'s
candidates (so it can neither win nor force a tie), and a "Not supported"
note under the table lists it. `aggregate_test.py` unit-tests the majority
rule and the winner exclusion against a tiny synthetic jsonl
(`python3 aggregate_test.py`).

## Did not close (#311, #266 rule 12)

"Not supported" (above) catches a drawer that never moves for a gesture;
it does not catch one that moves -- scrolls or animates fully out of
view, so `window.__bench.openness()` reads 0 and `settle()` finishes fast
-- while the library underneath never actually reports itself closed. That
is how React Aria's Sheet was crowned a fast `touch-flick-dismiss` winner
before this rule existed: it visibly scrolled off-screen, but its own
`onOpenChange` never ran, so it stayed mounted and open. See "React Aria's
Sheet never closed on a flick" below for the root cause.

Every adapter now exposes the library's own open state to the harness,
`window.__bench.isOpen()` (`src/harness.ts`), driven only by that deck's
own `onOpenChange` callback or controlled `open`/`isOpen` prop (each
adapter's own header comment says where) -- never by reading `#panel`'s
position. `scenarios.ts`'s `Scenario.dismiss` flag (set on
`touch-flick-dismiss` only, today) tells `bench.spec.ts` which scenarios
to check this for: after motion settles, it waits up to `CLOSE_WAIT_MS`
(2s) for `isOpen()` to go `false`, and records the result as `closed` on
the row. `settleMs` for a `dismiss` scenario is the _later_ of motion
settling and the library reporting closed -- a deck that closes slowly but
for real should not look faster than one that never closes at all.

`aggregate.py` and `report.py` mark a deck "did not close" for a dismiss
scenario when `closed` is `false` in most (more than half) of its scored
reps for that scenario, pooled across every load -- the same majority rule
"not supported" uses. A "did not close" deck's row reads "did not close"
instead of a number, it never enters `winner_of`'s candidates, and a "Did
not close" note under the table lists it; `excluded_decks` unions this
with "not supported" wherever a cell's winner is computed, so a deck
caught by either rule is excluded the same way. `aggregate_test.py`
unit-tests the majority rule and the winner exclusion, including both
rules combining on the same cell, against a tiny synthetic jsonl.

**Guard.** `closes.spec.ts` drives `scenarios.ts`'s own
`touch-flick-dismiss` gesture against every deck. For drawerdeck, vaul and
Base UI it asserts `window.__bench.isOpen() === false` within
`CLOSE_WAIT_MS` (2s) -- reverting any one of their `onOpenChange` wiring
locally and re-running it reproduces the bug this was written for: that
deck times out waiting for `isOpen()`, where the others clear it in a
couple of seconds. For React Aria, `KNOWN_NEVER_CLOSES` (the spec file's
own constant, linking back to "React Aria's Sheet never closed on a
flick" above) asserts the opposite, documented outcome instead:
`isOpen()` is still `true` after the same wait. A future React Aria
release that starts reporting closed for this gesture flips that
assertion red, which is the point where this exception needs revisiting,
not a silent pass. `pnpm --dir decks/drawerdeck/bench exec playwright test
-c playwright.config.ts closes.spec.ts` runs it (not part of
`pnpm --dir decks/drawerdeck verify`, the same as `smoke.spec.ts`,
`animates.spec.ts` and `bench.spec.ts`; see this deck's own `AGENTS.md`).

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
  on the viewport. Its entrance/exit CSS and `Drawer.Backdrop` were missing
  until #304 -- see "Entrance animation audit" above.
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
