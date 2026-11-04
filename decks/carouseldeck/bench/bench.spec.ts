// The carousel bench's own run (#340, ported from
// decks/drawerdeck/bench/bench.spec.ts, #266/#283): every scenario, every
// load level, every loop setting, every deck, >=1 rep. Chromium CDP traces
// every run (./trace.ts, carried from drawerdeck's own copy of
// carouseldeck's prototype scroll-snap bench); two of the five scenarios
// need CDP's trusted touch (`scenarios.ts`'s `chromiumOnly`), and this bench
// runs one Chromium project either way. One JSON line per run, appended to
// results/chromium.jsonl.
//
// Interleaved (#266): for each (scenario, load, loop), every rep shuffles
// the five decks' run order fresh, from one seed recorded for the whole run
// (results/seed.txt, and the `seed` field on every row) -- never all reps
// of one library in a row, and the whole sequence is reproducible from
// that seed. `SHARD_ID` (set by the GitHub Actions matrix, `local` outside
// it) tags every row and trace file, so a multi-shard run's files never
// collide and the report job can read "which shard" straight off a row.
//
// Loop (#340): `scenarios.ts`'s `LOOPS` adds a second axis alongside
// `LOADS` -- every (scenario, load) cell also runs with the carousel's own
// `loop` option off and on (`decks.ts`'s `urlFor`, a `?loop=1` query string
// on the same page, not a second Vite entry). Scoped together with load
// everywhere a cell is computed (see aggregate.py/report.py), never pooled
// across either.
//
// Traces (#266, for #243): each rep's raw CDP trace is gzipped to
// results/traces/, and the per-frame timeline `analyzeMotion` reduces into
// this row's summary is saved beside it, so a stall can be checked against
// frame and input timestamps directly, after the fact, without re-running
// anything.
//
// Filter a run with Playwright's own `--grep`, e.g. `--grep '\[embla\]'`
// for one deck, or `--grep 'touch-swipe'` for one scenario.
//
// Warm-up, discarded (#266's fairness rule 6): Playwright gives every test
// here its own fresh page (test-level context isolation), so there is no
// later, already-warm rep on the *same* page load to serve as the
// baseline the rule describes -- every rep is already its own page load.
// Instead, `runPass` runs once, unscored, right after that fresh load (its
// row goes to the jsonl with `warmup: true`, so cold caches and JIT don't
// penalize one library), then the page reloads before the real, scored
// pass. The reload -- rather than reusing the warmed-up DOM in place --
// matters here too: every scenario moves forward from slide 0, and there is
// no deck-agnostic way to put all five carousels back at slide 0 between
// passes without a fresh load. The reload still reuses Chromium's own HTTP
// and V8 code caches for this origin, the way a real second visit would.
// `aggregate.py` and `report.py` both drop `warmup: true` rows before
// computing anything.
//
// There is no `dismiss`/`closed` concept here (#340): a carousel has no
// open/close state, so unlike drawerdeck's bench, no row tracks whether a
// gesture "closed" anything. `indexAfter` is recorded instead, straight off
// `window.__bench.index()`, as an end-state sanity field only -- it feeds no
// fairness rule.

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { test } from '@playwright/test';
import { DECKS, urlFor } from './decks';
import {
  LOADS,
  LOOPS,
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

// A carousel that never moves still finishes `settle()` at its own timeout,
// so "settle time" alone cannot tell "fastest" from "never moved" (fairness
// rule 11, carried from drawerdeck's bench). `maxStep` is the right signal:
// the harness's own per-frame probe, not the net `travel`, which is the
// right choice here too in case a future scenario ever nets near-zero
// travel on genuine motion. 2px is comfortably above the sub-pixel jitter
// `harness.ts`'s own `tick()` can report on an otherwise-still carousel.
const RESPONSE_THRESHOLD_PX = 2;

function responded(raf: PassResult['raf']): boolean {
  return Math.abs(raf.maxStep) > RESPONSE_THRESHOLD_PX;
}

interface PassResult {
  settleMs: number;
  indexAfter: number | null;
  raf: { frames: number; maxStep: number; travel: number; reversals: number };
  loaf: { count: number; totalBlocking: number } | null;
  trace: MotionAnalysis | null;
  events: TraceEvent[] | null;
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
  const g = await geometry(page);
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
  const settleMs = Date.now() - began;
  await page.evaluate(() => window.__bench.jank(0));

  const raf = await page.evaluate(() => ({ ...window.__bench.m }));
  const loaf = await page.evaluate(() => window.__bench.loaf());
  const indexAfter = await page.evaluate(() => window.__bench.index());

  return { settleMs, indexAfter, raf, loaf, trace, events };
}

for (const scenario of scenarios) {
  for (const load of LOADS) {
    for (const loop of LOOPS) {
      for (let rep = 0; rep < REPS; rep++) {
        // A fresh shuffle per (scenario, load, loop, rep): the five decks
        // never run back to back as a block, and this exact order is
        // reproducible from `SEED` plus this loop's own order (#266).
        const order = shuffle(DECKS, rng);
        for (const deck of order) {
          test(`[${deck.key}] ${scenario.name} load=${load} loop=${loop} rep=${rep}`, async ({
            page
          }) => {
            await page.goto(urlFor(deck, loop));
            await page.waitForFunction(
              () => window.__bench !== undefined,
              null,
              {
                timeout: 15_000
              }
            );

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
              loop,
              rep,
              warmup: true,
              settleMs: warmup.settleMs,
              indexAfter: warmup.indexAfter,
              responded: responded(warmup.raf),
              raf: { ...warmup.raf },
              loaf: warmup.loaf,
              trace: warmup.trace
            });

            await page.goto(urlFor(deck, loop));
            await page.waitForFunction(
              () => window.__bench !== undefined,
              null,
              {
                timeout: 15_000
              }
            );
            const initDurationMs = await page.evaluate(() =>
              window.__bench.initDuration()
            );

            const scored = await runPass(page, scenario, load, true);

            const fileBase = `${deck.key}__${scenario.name}__load${load}__loop${loop}__rep${rep}__${SHARD_ID}`;
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
              loop,
              rep,
              warmup: false,
              initDurationMs,
              settleMs: scored.settleMs,
              indexAfter: scored.indexAfter,
              responded: responded(scored.raf),
              raf: { ...scored.raf },
              loaf: scored.loaf,
              trace: scored.trace
            });
          });
        }
      }
    }
  }
}
