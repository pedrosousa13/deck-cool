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

interface PassResult {
  settleMs: number;
  opennessAfter: number;
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
  const settleMs = Date.now() - began;
  await page.evaluate(() => window.__bench.jank(0));

  const raf = await page.evaluate(() => ({ ...window.__bench.m }));
  const loaf = await page.evaluate(() => window.__bench.loaf());
  const opennessAfter = await page.evaluate(() => window.__bench.openness());

  return { settleMs, opennessAfter, raf, loaf, trace, events };
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
            raf: { ...scored.raf, blankFrames: 0 },
            loaf: scored.loaf,
            trace: scored.trace
          });
        });
      }
    }
  }
}
