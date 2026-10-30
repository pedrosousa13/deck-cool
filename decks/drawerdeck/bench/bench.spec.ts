// The drawer bench's own run (#266, originally #233): every scenario,
// every load level, every deck, >=1 rep. Chromium CDP traces every run
// (./trace.ts, copied from carouseldeck's scroll-snap bench); this bench is
// Chromium-only (a drawer's touch scenarios need CDP's trusted touch either
// way). One JSON line per run, appended to results/chromium.jsonl.
//
// Interleaved (#266): for each (scenario, load), every rep shuffles the
// four decks' run order fresh, from one seed recorded for the whole run
// (results/seed.txt, and the `seed` field on every row) -- never all reps
// of one library in a row, and the whole sequence is reproducible from
// that seed. `SHARD_ID` (set by the GitHub Actions matrix, `local` outside
// it) tags every row and trace file, so a multi-shard run's files never
// collide and the report job can read "which shard" straight off a row.
//
// Traces (#266, for #243): each rep's raw CDP trace is gzipped to
// results/traces/, and the per-frame timeline `analyzeMotion` reduces into
// this row's summary is saved beside it, so a stall can be checked against
// frame and input timestamps directly, after the fact, without re-running
// anything.
//
// Filter a run with Playwright's own `--grep`, e.g. `--grep '\[vaul\]'` for
// one deck, or `--grep 'touch-drag'` for one scenario.
//
// Warm-up, discarded (#266's fairness rule 6): Playwright gives every test
// here its own fresh page (test-level context isolation), so there is no
// later, already-warm rep on the *same* page load to serve as the
// baseline the rule describes -- every rep is already its own page load.
// Instead, `runPass` runs once, unscored, right after that fresh load (its
// row goes to the jsonl with `warmup: true`, so cold caches and JIT don't
// penalize one library), then the page reloads before the real, scored
// pass. The reload -- rather than reusing the warmed-up DOM in place --
// matters for drawerdeck specifically: its dismiss is drag-past-the-
// lowest-snap-point only (src/drawerdeck-app.tsx's own comment: "not a
// close button or Escape"), so there's no deck-agnostic way to put all
// four drawers back at a scenario's starting snap point without a fresh
// load. The reload still reuses Chromium's own HTTP and V8 code caches for
// this origin, the way a real second visit would. `aggregate.py` and
// `report.py` both drop `warmup: true` rows before computing anything.
//
// A dismiss counts only when the library reports it closed (#266 fairness
// rule 12, #311): every `Scenario` marked `dismiss: true` (today, only
// `touch-flick-dismiss`) gets a `closed` field on its row, from
// `window.__bench.isOpen()` -- the library's own `onOpenChange`/`open`,
// never this bench's own reading of the drawer's on-screen position (see
// `scenarios.ts` and each deck's own `src/*-app.tsx`). `settleMs` for a
// `dismiss` scenario is the later of motion settling and the library
// reporting closed; `closed: false` means it never did, within
// `CLOSE_WAIT_MS`, and `aggregate.py`/`report.py` score that row "did not
// close" for that scenario (excluded from winners and ties, the same
// treatment rule 11 gives "not supported").

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { test } from '@playwright/test';
import { DECKS } from './decks';
import {
  LOADS,
  REPS,
  geometry,
  scenarios,
  settle,
  type Scenario
} from './scenarios';
import { makeRng, resolveSeed, shuffle } from './seed';
import {
  analyzeMotion,
  captureTrace,
  frameTimeline,
  type MotionAnalysis,
  type TraceEvent
} from './trace';
import type {} from './src/harness';

const OUT = fileURLToPath(new URL('./results/', import.meta.url));
const TRACE_DIR = fileURLToPath(new URL('./results/traces/', import.meta.url));
mkdirSync(OUT, { recursive: true });
mkdirSync(TRACE_DIR, { recursive: true });

const SHARD_ID = process.env.SHARD_ID ?? 'local';
const SEED = resolveSeed();
writeFileSync(`${OUT}seed.txt`, `${SEED}\n`);
const rng = makeRng(SEED);

function record(row: Record<string, unknown>): void {
  appendFileSync(`${OUT}chromium.jsonl`, `${JSON.stringify(row)}\n`);
}

// A drawer that never moves still finishes `settle()` at its own timeout, so
// "settle time" alone cannot tell "fastest" from "never moved" (#294, #266
// rule 11). `maxStep` -- not `travel` -- is the right signal: a scenario
// that drags a drawer up and back down nets ~0 `travel` on a drawer that
// genuinely moved, but `maxStep` still shows the drag's own per-frame
// motion. 2px is comfortably above the sub-pixel jitter `harness.ts`'s own
// `tick()` can report on an otherwise-still drawer.
const RESPONSE_THRESHOLD_PX = 2;

function responded(raf: PassResult['raf']): boolean {
  return Math.abs(raf.maxStep) > RESPONSE_THRESHOLD_PX;
}

// How long a dismiss scenario's extra wait for `window.__bench.isOpen()`
// may run past motion settling (fairness rule 12, #311): long enough for
// a library's own close animation/teardown to finish, short enough that a
// deck that never closes doesn't meaningfully lengthen the run.
// `closes.spec.ts`'s guard uses the same bound.
const CLOSE_WAIT_MS = 2_000;

interface PassResult {
  settleMs: number;
  opennessAfter: number;
  raf: { frames: number; maxStep: number; travel: number; reversals: number };
  loaf: { count: number; totalBlocking: number } | null;
  trace: MotionAnalysis | null;
  events: TraceEvent[] | null;
  /** Whether the library itself reported the drawer closed (fairness rule
   * 12): `null` for a scenario that isn't `dismiss` (nothing to report). */
  closed: boolean | null;
}

/** One pass of a scenario: setup, inject load, run, settle, read the
 * metrics back off `window.__bench`. `captureTraceEvents` is false for the
 * warm-up pass (rule 6): no CDP trace session, since its numbers are
 * discarded either way. */
async function runPass(
  page: Page,
  scenario: Scenario,
  load: number,
  captureTraceEvents: boolean
): Promise<PassResult> {
  await scenario.setup(page);
  const g = scenario.needsGeometry === false ? null : await geometry(page);
  await page.evaluate(() => window.__bench.reset());
  await page.evaluate((ms) => window.__bench.jank(ms), load);

  const began = Date.now();
  let events: TraceEvent[] | null = null;
  let trace: MotionAnalysis | null = null;
  if (captureTraceEvents) {
    const traceCdp = await page.context().newCDPSession(page);
    events = await captureTrace(traceCdp, async () => {
      await scenario.run(page, g);
      await settle(page);
    });
    await traceCdp.detach();
    trace = analyzeMotion(events);
  } else {
    await scenario.run(page, g);
    await settle(page);
  }
  const motionSettledMs = Date.now() - began;
  await page.evaluate(() => window.__bench.jank(0));

  // Fairness rule 12 (#311): a dismiss only counts once the library itself
  // reports closed (`window.__bench.isOpen() === false`), not from this
  // bench's own reading of the drawer's on-screen position -- motion
  // settling (above) is necessary but not sufficient. The settle time for
  // a `dismiss` scenario is the later of the two.
  let closed: boolean | null = null;
  let settleMs = motionSettledMs;
  if (scenario.dismiss) {
    closed = await page.evaluate(() => window.__bench.isOpen() === false);
    if (!closed) {
      try {
        await page.waitForFunction(
          () => window.__bench.isOpen() === false,
          null,
          {
            timeout: CLOSE_WAIT_MS
          }
        );
        closed = true;
      } catch {
        closed = false;
      }
    }
    const closedMs = Date.now() - began;
    settleMs = closed ? Math.max(motionSettledMs, closedMs) : motionSettledMs;
  }

  const raf = await page.evaluate(() => ({ ...window.__bench.m }));
  const loaf = await page.evaluate(() => window.__bench.loaf());
  const opennessAfter = await page.evaluate(() => window.__bench.openness());

  return { settleMs, opennessAfter, raf, loaf, trace, events, closed };
}

for (const scenario of scenarios) {
  for (const load of LOADS) {
    for (let rep = 0; rep < REPS; rep++) {
      // A fresh shuffle per (scenario, load, rep): the four decks never run
      // back to back as a block, and this exact order is reproducible from
      // `SEED` plus this loop's own order (#266).
      const order = shuffle(DECKS, rng);
      for (const deck of order) {
        test(`[${deck.key}] ${scenario.name} load=${load} rep=${rep}`, async ({
          page
        }) => {
          await page.goto(deck.url);
          await page.waitForFunction(() => window.__bench !== undefined, null, {
            timeout: 15_000
          });

          // Warm-up, discarded (rule 6 -- see this file's own header
          // comment for why this is a second pass on a reloaded page,
          // rather than a reused first rep).
          const warmup = await runPass(page, scenario, load, false);
          record({
            shard: SHARD_ID,
            seed: SEED,
            deck: deck.key,
            scenario: scenario.name,
            load,
            rep,
            warmup: true,
            settleMs: warmup.settleMs,
            opennessAfter: warmup.opennessAfter,
            responded: responded(warmup.raf),
            closed: warmup.closed,
            raf: { ...warmup.raf, blankFrames: 0 },
            loaf: warmup.loaf,
            trace: warmup.trace
          });

          await page.goto(deck.url);
          await page.waitForFunction(() => window.__bench !== undefined, null, {
            timeout: 15_000
          });
          const initDurationMs = await page.evaluate(() =>
            window.__bench.initDuration()
          );

          const scored = await runPass(page, scenario, load, true);

          const fileBase = `${deck.key}__${scenario.name}__load${load}__rep${rep}__${SHARD_ID}`;
          writeFileSync(
            `${TRACE_DIR}${fileBase}.trace.json.gz`,
            gzipSync(Buffer.from(JSON.stringify(scored.events)))
          );
          writeFileSync(
            `${TRACE_DIR}${fileBase}.frames.json`,
            JSON.stringify(frameTimeline(scored.events!))
          );

          record({
            shard: SHARD_ID,
            seed: SEED,
            deck: deck.key,
            scenario: scenario.name,
            load,
            rep,
            warmup: false,
            initDurationMs,
            settleMs: scored.settleMs,
            opennessAfter: scored.opennessAfter,
            responded: responded(scored.raf),
            closed: scored.closed,
            raf: { ...scored.raf, blankFrames: 0 },
            loaf: scored.loaf,
            trace: scored.trace
          });
        });
      }
    }
  }
}
