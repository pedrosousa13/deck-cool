// Unit tests for the scorer (#266 rule 10, from #243's trace diagnosis):
// synthetic CDP-trace-shaped timelines, no browser or Playwright involved.
// Run with `node --test trace.test.ts` (Node 24 strips the type-only
// syntax natively; this bench has no vitest config of its own to add
// these to -- see RESULTS.md's "Local smoke check").

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMotion, type TraceEvent } from './trace.ts';

const US_PER_MS = 1000;

function frame(
  tsMs: number,
  state: 'STATE_PRESENTED_ALL' | 'STATE_DROPPED' | 'STATE_NO_UPDATE_DESIRED'
): TraceEvent {
  return {
    name: 'PipelineReporter',
    ph: 'b',
    ts: tsMs * US_PER_MS,
    cat: 'cc,benchmark,disabled-by-default-devtools.timeline.frame',
    pid: 1,
    tid: 1,
    args: { frame_reporter: { state } }
  };
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
    out.push(frame(t, 'STATE_PRESENTED_ALL'));
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
    frame(0, 'STATE_PRESENTED_ALL'),
    frame(16, 'STATE_PRESENTED_ALL'),
    frame(100, 'STATE_PRESENTED_ALL'), // the main thread stalls here
    frame(300, 'STATE_PRESENTED_ALL'), // ...for exactly 200ms
    frame(316, 'STATE_PRESENTED_ALL'),
    frame(332, 'STATE_PRESENTED_ALL'), // still well inside the window
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
