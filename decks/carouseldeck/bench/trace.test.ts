// Unit tests for trace.ts's two scorers: synthetic CDP-trace-shaped
// timelines, no browser or Playwright involved. Run with
// `node --test trace.test.ts` (Node 24 strips the type-only syntax
// natively; this bench has no vitest config of its own to add these to --
// see RESULTS.md's "Local smoke check").

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMotion, analyzeMount, type TraceEvent } from './trace.ts';

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

function mark(name: string, tsMs: number): TraceEvent {
  return {
    name,
    ph: 'R',
    ts: tsMs * US_PER_MS,
    cat: 'blink.user_timing',
    pid: 1,
    tid: 1
  };
}

function complete(name: string, startMs: number, durMs: number): TraceEvent {
  return {
    name,
    ph: 'X',
    ts: startMs * US_PER_MS,
    dur: durMs * US_PER_MS,
    cat: 'devtools.timeline,disabled-by-default-devtools.timeline',
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

test('a real 200ms gap mid-gesture scores as a 200ms stall', () => {
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
    // between two reps, or between setup and run.
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

test('analyzeMount returns null without both marks', () => {
  assert.strictEqual(analyzeMount([mark('bench-mount-start', 0)]), null);
  assert.strictEqual(analyzeMount([mark('bench-mount-published', 10)]), null);
  assert.strictEqual(analyzeMount([]), null);
});

test('analyzeMount sums Layout/UpdateLayoutTree/RunTask in the window, and scores the last presented frame at or after start', () => {
  const events: TraceEvent[] = [
    mark('bench-mount-start', 10),
    complete('RunTask', 8, 5), // starts before the mark, ends after it
    complete('RunTask', 20, 3), // fully inside the window
    complete('Layout', 12, 1),
    complete('Layout', 18, 0.5),
    complete('UpdateLayoutTree', 11, 0.2),
    mark('bench-mount-published', 25),
    frame(26, 'STATE_PRESENTED_ALL')
  ];

  const result = analyzeMount(events)!;

  // The task that contains the start mark (8-13ms) counts its *whole*
  // 5ms duration, not just the 10-13ms part after the mark (#340's own
  // mount lessons): 5 + 3 = 8.
  assert.strictEqual(result.mountTaskMs, 8);
  assert.strictEqual(result.layoutCount, 2);
  assert.ok(Math.abs(result.layoutMs - 1.5) < 1e-9, `${result.layoutMs}`);
  assert.strictEqual(result.styleRecalcCount, 1);
  assert.strictEqual(result.timeToPublishedFrameMs, 16); // 26 - 10
});

test('analyzeMount scores 0, not a negative number, when the published state was already there before mount started', () => {
  // The SSR natural-rest case (#333/#337): the only presented frame is the
  // server's own first paint, before `bench-mount-start` runs at all.
  const events: TraceEvent[] = [
    frame(0, 'STATE_PRESENTED_ALL'),
    mark('bench-mount-start', 10),
    mark('bench-mount-published', 10.5)
  ];

  const result = analyzeMount(events)!;

  assert.strictEqual(result.timeToPublishedFrameMs, 0);
});
