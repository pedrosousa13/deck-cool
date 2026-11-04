// Unit tests for the scorer (#266 rule 10, from #243's trace diagnosis):
// synthetic CDP-trace-shaped timelines, no browser or Playwright involved.
// Run with `node --test trace.test.ts` (Node 24 strips the type-only
// syntax natively; this bench has no vitest config of its own to add
// these to -- see RESULTS.md's "Local smoke check").

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMotion, type TraceEvent } from './trace.ts';

const US_PER_MS = 1000;

let nextAutoId = 0;

/** A `PipelineReporter`'s begin/end pair (#345): a begin at `beginMs`
 * carrying the frame's state, and an end at `presentMs` -- when the frame
 * is shown, for a presented one. `presentMs` defaults to `beginMs`, the
 * normal case where a frame shows the same vsync it starts in. `id2`
 * scopes the pair the way Chromium's own id reuse needs: pass the same
 * `id2` to two calls to build a forked pair that ends (shows) together.
 * `opts.pid`/`opts.tid`/`opts.layerTreeHostId` default to `1`/`1`/unset,
 * and only need overriding to test the dedupe's own scoping (#345
 * follow-up). */
function frame(
  beginMs: number,
  state:
    | 'STATE_PRESENTED_ALL'
    | 'STATE_PRESENTED_PARTIAL'
    | 'STATE_DROPPED'
    | 'STATE_NO_UPDATE_DESIRED',
  presentMs: number = beginMs,
  id2: string = `auto-${nextAutoId++}`,
  opts: { pid?: number; tid?: number; layerTreeHostId?: number } = {}
): TraceEvent[] {
  const { pid = 1, tid = 1, layerTreeHostId } = opts;
  const base = {
    name: 'PipelineReporter',
    cat: 'cc,benchmark,disabled-by-default-devtools.timeline.frame',
    pid,
    tid,
    id2: { local: id2 }
  };
  return [
    {
      ...base,
      ph: 'b',
      ts: beginMs * US_PER_MS,
      args: {
        frame_reporter: {
          state,
          ...(layerTreeHostId === undefined
            ? {}
            : { layer_tree_host_id: layerTreeHostId })
        }
      }
    },
    { ...base, ph: 'e', ts: presentMs * US_PER_MS }
  ];
}

function windowStart(tsMs: number): TraceEvent {
  return {
    name: 'bench-window-start',
    ph: 'R',
    ts: tsMs * US_PER_MS,
    cat: 'blink.user_timing',
    pid: 1,
    tid: 1
  };
}

function windowEnd(tsMs: number): TraceEvent {
  return {
    name: 'bench-window-end',
    ph: 'R',
    ts: tsMs * US_PER_MS,
    cat: 'blink.user_timing',
    pid: 1,
    tid: 1
  };
}

/** Presented frames at a fixed cadence from `startMs` up to (and
 * including) `endMs`. */
function presentedRun(
  startMs: number,
  endMs: number,
  cadenceMs = 16
): TraceEvent[] {
  const out: TraceEvent[] = [];
  for (let t = startMs; t <= endMs; t += cadenceMs) {
    out.push(...frame(t, 'STATE_PRESENTED_ALL'));
  }
  return out;
}

test('a fast finisher that settles at 150ms then idles does not score a worse stall than a slow finisher that animates until 450ms', () => {
  // Scenario 1's own shape: a drag up, a forced mid-gesture pause (the
  // scenario's own `settle()` wait), then a drag down -- two windows, with
  // real idle time between them. drawerdeck-like: the first gesture's
  // drawer stops moving at 150ms, then sits still until the window closes
  // at 550ms (the settle detector's quiet-period tail). vaul-like: the
  // first gesture keeps presenting its own release animation until 450ms,
  // with only a short quiet tail before the window closes at 500ms.
  const fastEvents: TraceEvent[] = [
    windowStart(0),
    ...presentedRun(0, 150),
    windowEnd(550),
    windowStart(900),
    ...presentedRun(900, 1050),
    windowEnd(1400)
  ];
  const slowEvents: TraceEvent[] = [
    windowStart(0),
    ...presentedRun(0, 450),
    windowEnd(500),
    windowStart(900),
    ...presentedRun(900, 1350),
    windowEnd(1400)
  ];

  const fast = analyzeMotion(fastEvents);
  const slow = analyzeMotion(slowEvents);

  assert.ok(
    fast.longestStallMs <= slow.longestStallMs + 1,
    `fast finisher's stall (${fast.longestStallMs}ms) scored worse than the slow finisher's (${slow.longestStallMs}ms)`
  );
  // Both are just the ~16ms presented cadence: neither the fast finisher's
  // long idle tail inside its own window, nor the ~350ms gap between the
  // two windows, should show up as the longest stall.
  assert.ok(fast.longestStallMs < 20, `fast: ${fast.longestStallMs}ms`);
  assert.ok(slow.longestStallMs < 20, `slow: ${slow.longestStallMs}ms`);

  // The bug this fixes, made visible: scored the old way (one window
  // spanning the whole trace), the fast finisher's idle tail and the gap
  // between windows both collapse into one big gap, well past the real
  // ~16ms cadence -- and the fast finisher scores *worse* than the slow
  // one, for finishing sooner.
  assert.ok(
    fast.legacy.longestStallMs > 300,
    `fast legacy: ${fast.legacy.longestStallMs}ms`
  );
  assert.ok(
    fast.legacy.longestStallMs > slow.legacy.longestStallMs,
    'expected the pre-fix (legacy) numbers to reproduce the unfairness this fix removes'
  );
});

test('a real 200ms gap mid-gesture, while the drawer still has to move, scores as a 200ms stall', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL'),
    ...frame(16, 'STATE_PRESENTED_ALL'),
    ...frame(100, 'STATE_PRESENTED_ALL'), // the main thread stalls here
    ...frame(300, 'STATE_PRESENTED_ALL'), // ...for exactly 200ms
    ...frame(316, 'STATE_PRESENTED_ALL'),
    ...frame(332, 'STATE_PRESENTED_ALL'), // still well inside the window
    windowEnd(450)
  ];

  const result = analyzeMotion(events);

  assert.strictEqual(result.longestStallMs, 200);
});

test('idle time between windows is ignored', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...presentedRun(0, 100),
    windowEnd(150),
    // A long idle gap with no frames at all: the scenario's own pause
    // between two gestures.
    windowStart(2000),
    ...presentedRun(2000, 2100),
    windowEnd(2150)
  ];

  const result = analyzeMotion(events);

  // Scored per window, the longest stall is the ~16ms presented cadence,
  // nowhere near the ~1850ms gap between the windows.
  assert.ok(result.longestStallMs < 20, `${result.longestStallMs}ms`);
  assert.strictEqual(result.activeWindows.length, 2);
});

test('a frame the main thread holds back scores the stall from when it is shown, not when it started (#345)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL'), // shows immediately
    // Begins right on schedule, but a busy main thread holds it back 200ms
    // before it commits and shows.
    ...frame(16, 'STATE_PRESENTED_ALL', 216),
    ...frame(220, 'STATE_PRESENTED_ALL'), // back to normal cadence
    windowEnd(300)
  ];

  const result = analyzeMotion(events);

  // The real stall is the 216ms the screen stayed still (0 to 216), not
  // the 204ms gap between when the held-back frame started (16) and when
  // the next one started (220): scoring begin times puts the stall in the
  // wrong place and under-reports it.
  assert.strictEqual(result.longestStallMs, 216);
});

test('two reporters that end at the same presentation time count as one shown frame (#345)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL'),
    // A main-thread update misses its vsync and forks: the original
    // reporter (begun at 16) and the forked one that carries it to the
    // next vsync (begun at 216) both end -- present -- at 232.
    ...frame(16, 'STATE_PRESENTED_ALL', 232, 'fork-original'),
    ...frame(216, 'STATE_PRESENTED_ALL', 232, 'fork-continuation'),
    ...frame(248, 'STATE_PRESENTED_ALL'),
    windowEnd(350)
  ];

  const result = analyzeMotion(events);

  // One shown frame at 232, not two: the real stall is the 232ms gap from
  // the frame shown at 0 to the one shown at 232, and the next gap, to
  // 248, is a normal 16ms frame -- not a second, phantom 0ms gap between
  // the fork's two reporters.
  assert.strictEqual(result.longestStallMs, 232);
  assert.strictEqual(result.frameCount, 3);
});

test('a duplicate group whose first-closed reporter is not presented still counts the presented one (#345 follow-up)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL'),
    // A no-update reporter and a presented reporter both end at 116; in
    // event (and trace) order the no-update one closes first. Run
    // 41798197057's own traces hit this once (vaul, touch-flick-dismiss,
    // load=100): the no-update reporter must never suppress the presented
    // frame it happens to share an end ts with.
    ...frame(16, 'STATE_NO_UPDATE_DESIRED', 116, 'no-update'),
    ...frame(100, 'STATE_PRESENTED_ALL', 116, 'presented'),
    ...frame(132, 'STATE_PRESENTED_ALL'),
    windowEnd(250)
  ];

  const result = analyzeMotion(events);

  // Three presented frames (0, 116, 132): deduping on ts alone, keeping
  // whichever reporter closed first, drops the one at 116 and the stall
  // jumps straight from 0 to 132.
  assert.strictEqual(result.frameCount, 3);
  assert.strictEqual(result.longestStallMs, 116);
});

test('two DROPPED reporters that end at the same ts are not merged into one (#345 follow-up)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL'),
    ...frame(16, 'STATE_DROPPED', 32, 'dropped-a'),
    ...frame(20, 'STATE_DROPPED', 32, 'dropped-b'),
    ...frame(48, 'STATE_PRESENTED_ALL'),
    windowEnd(100)
  ];

  const result = analyzeMotion(events);

  // Each dropped reporter is its own missed tick; only a presented
  // reporter ever merges with another one at the same ts.
  assert.strictEqual(result.droppedCount, 2);
  assert.strictEqual(result.frameCount, 4);
});

test('two presented reporters at the same ts on different layer_tree_host_ids are not merged (#345 follow-up)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL', 0, 'auto', { layerTreeHostId: 1 }),
    // Same end ts as the frame above, but a different compositor: not the
    // same shown frame, so the dedupe must not merge them.
    ...frame(0, 'STATE_PRESENTED_ALL', 0, 'other-host', {
      layerTreeHostId: 2
    }),
    windowEnd(50)
  ];

  const result = analyzeMotion(events);

  assert.strictEqual(result.frameCount, 2);
});

test('two overlapping reporters with different ids pair with their own ends, not each other (#345 follow-up)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL', 0, 'a'),
    // b begins before the previous frame's gap closes, and c begins before
    // b ends: overlapping lifetimes, each with its own distinct end ts.
    ...frame(16, 'STATE_PRESENTED_ALL', 48, 'b'),
    ...frame(32, 'STATE_PRESENTED_ALL', 64, 'c'),
    windowEnd(100)
  ];

  const result = analyzeMotion(events);

  // Three distinct presented frames (0, 48, 64): b's and c's overlapping
  // lifetimes must not get cross-paired with the wrong end.
  assert.strictEqual(result.frameCount, 3);
});

test('a reused id2 pairs each begin with its own end, not a stale one (#345 follow-up)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    ...frame(0, 'STATE_PRESENTED_ALL', 0, '0x1'),
    // Chromium reuses an id2 once its reporter closes (real traces reuse
    // '0x1'): this later begin/end pair must pair with its own end, not
    // the one already consumed above.
    ...frame(100, 'STATE_PRESENTED_ALL', 116, '0x1'),
    windowEnd(200)
  ];

  const result = analyzeMotion(events);

  assert.strictEqual(result.frameCount, 2);
  assert.strictEqual(result.longestStallMs, 116);
});

test('an end with no earlier begin, and a begin with no later end, are both dropped (#345 follow-up)', () => {
  const events: TraceEvent[] = [
    windowStart(0),
    // An end with no matching begin: the trace started mid-reporter.
    {
      name: 'PipelineReporter',
      cat: 'cc,benchmark,disabled-by-default-devtools.timeline.frame',
      pid: 1,
      tid: 1,
      id2: { local: 'orphan-end' },
      ph: 'e',
      ts: 0
    },
    ...frame(16, 'STATE_PRESENTED_ALL'),
    // A begin with no later end: the trace stopped mid-reporter.
    {
      name: 'PipelineReporter',
      cat: 'cc,benchmark,disabled-by-default-devtools.timeline.frame',
      pid: 1,
      tid: 1,
      id2: { local: 'orphan-begin' },
      ph: 'b',
      ts: 200 * US_PER_MS,
      args: { frame_reporter: { state: 'STATE_PRESENTED_ALL' } }
    },
    windowEnd(300)
  ];

  const result = analyzeMotion(events);

  // Only the one well-paired reporter (at 16) becomes a frame.
  assert.strictEqual(result.frameCount, 1);
});
