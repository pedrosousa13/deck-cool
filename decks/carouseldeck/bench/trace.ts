// Copied from decks/drawerdeck/bench/trace.ts (#340: a cross-deck import
// would couple this bench to drawerdeck's, so it keeps its own copy, the
// same choice drawerdeck's own header comment made when it copied this file
// from carouseldeck's prototype scroll-snap bench). `analyzeMotion` and the
// `TraceEvent`/`captureTrace`/`frameTimeline` plumbing are unchanged;
// `analyzeMount` is new here, for the mount scenario's own scoring (#340's
// mount lessons, see its own header comment below).
//
// Chromium-only frame timing from a CDP trace: the one scripted method
// research #137 (carouseldeck) found is not fooled by a main-thread long
// task. `PipelineReporter` (categories `cc,benchmark,disabled-by-default-
// devtools.timeline.frame`) gives one begin/end pair per frame, with
// `args.frame_reporter.state` (`STATE_PRESENTED_ALL`/`PARTIAL`/`DROPPED`/
// `NO_UPDATE_DESIRED`) and whether a compositor or main-thread animation
// produced it. A `performance.mark('bench-input')` in the real input
// listener lands in the same trace, in category `blink.user_timing`, and
// its `ts` is in the same clock as every other event, so it anchors "input
// to first moved frame" without needing `EventLatency`.

import type { CDPSession } from '@playwright/test';

export const CATEGORIES = [
  'disabled-by-default-devtools.timeline.frame',
  // Top-level `RunTask` events (`analyzeMount`'s `mountTaskMs`): this is a
  // *separate* category from `devtools.timeline` below, found the hard way
  // when a first mount-trace run scored every deck's main-thread busy time
  // as exactly 0.
  'disabled-by-default-devtools.timeline',
  'benchmark',
  'cc',
  'input',
  'latencyInfo',
  'blink.animations',
  'devtools.timeline',
  'blink.user_timing'
].join(',');

const VSYNC_MS = 1000 / 60;

export interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  cat?: string;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}

export async function captureTrace(
  cdp: CDPSession,
  run: () => Promise<void>
): Promise<TraceEvent[]> {
  const events: TraceEvent[] = [];
  // Playwright's own `CDPSession.on('Tracing.dataCollected', ...)` overload
  // types `value` generically (`{[key: string]: string}[]`), not as this
  // module's own `TraceEvent[]` shape; widen the listener's parameter type
  // so it structurally accepts that overload, then narrow back down.
  const onData = (e: { value: Record<string, unknown>[] }): void => {
    events.push(...(e.value as unknown as TraceEvent[]));
  };
  cdp.on('Tracing.dataCollected', onData);
  await cdp.send('Tracing.start', {
    categories: CATEGORIES,
    transferMode: 'ReportEvents'
  });
  await run();
  const complete = new Promise<void>((resolve) =>
    cdp.once('Tracing.tracingComplete', () => resolve())
  );
  await cdp.send('Tracing.end');
  await complete;
  cdp.off('Tracing.dataCollected', onData);
  return events;
}

interface FrameReporter {
  state:
    | 'STATE_PRESENTED_ALL'
    | 'STATE_PRESENTED_PARTIAL'
    | 'STATE_DROPPED'
    | 'STATE_NO_UPDATE_DESIRED';
  has_compositor_animation?: boolean;
  has_main_animation?: boolean;
  checkerboarded_needs_raster?: boolean;
  checkerboarded_needs_record?: boolean;
  has_missing_content?: boolean;
}

/** One gesture's active window: from `scenarios.ts`'s `markWindowStart()`,
 * at the gesture's first input event, to `settle()`'s `markWindowEnd()`,
 * once the carousel has been quiet for the settle detector's threshold (or
 * it hits its own timeout). `ts`, like a frame's, is in the trace's own
 * clock (microseconds). */
export interface ActiveWindow {
  startTs: number;
  endTs: number;
}

export interface MotionAnalysis {
  frameCount: number;
  droppedCount: number;
  droppedPct: number;
  longestStallMs: number;
  hitchRatioMsPerS: number;
  /** null when no `bench-input` mark was captured. */
  inputToFirstMovedMs: number | null;
  /** Frames flagged by the compositor itself as checkerboarded or missing
   * content: a trace-based cross-check on the in-page blank-frame count. */
  checkerboardedFrames: number;
  windowMs: number;
  /** This pass's active windows, one per gesture. */
  activeWindows: ActiveWindow[];
}

interface Frame {
  ts: number;
  reporter: FrameReporter;
}

function pipelineFrames(events: TraceEvent[]): Frame[] {
  return events
    .filter(
      (e) =>
        e.name === 'PipelineReporter' &&
        e.ph === 'b' &&
        (e.args as { frame_reporter?: FrameReporter } | undefined)
          ?.frame_reporter
    )
    .map((e) => ({
      ts: e.ts,
      reporter: (e.args as { frame_reporter: FrameReporter }).frame_reporter
    }))
    .sort((a, b) => a.ts - b.ts);
}

/** Pairs every `bench-window-start` mark with the next `bench-window-end`
 * mark, in trace order: `scenarios.ts` always opens one before dispatching
 * a gesture's first input event, and closes it from `settle()`, so the i-th
 * start and the i-th end belong to the same gesture. Unmatched marks (an
 * odd count) are dropped rather than guessed at. */
function activeWindows(events: TraceEvent[]): ActiveWindow[] {
  const starts = events
    .filter(
      (e) => e.name === 'bench-window-start' && e.cat === 'blink.user_timing'
    )
    .map((e) => e.ts)
    .sort((a, b) => a - b);
  const ends = events
    .filter(
      (e) => e.name === 'bench-window-end' && e.cat === 'blink.user_timing'
    )
    .map((e) => e.ts)
    .sort((a, b) => a - b);
  const windows: ActiveWindow[] = [];
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    const startTs = starts[i]!;
    const endTs = ends[i]!;
    if (endTs > startTs) windows.push({ startTs, endTs });
  }
  return windows;
}

/**
 * Dropped frames, the longest stall and the hitch ratio, scored from
 * `frames` -- restricted to the given windows. A frame outside every
 * window is not "expected", and the gap between two presented frames is
 * only a stall when both sit inside the *same* window: idle time between
 * windows is never scored, and neither is the quiet tail after a gesture's
 * last real move.
 */
function scoreFrames(
  frames: Frame[],
  windows: ActiveWindow[]
): {
  frameCount: number;
  droppedCount: number;
  droppedPct: number;
  longestStallMs: number;
  hitchRatioMsPerS: number;
  checkerboardedFrames: number;
} {
  const inAWindow = (ts: number) =>
    windows.some((w) => ts >= w.startTs && ts <= w.endTs);
  const expected = frames.filter(
    (f) => f.reporter.state !== 'STATE_NO_UPDATE_DESIRED' && inAWindow(f.ts)
  );
  const droppedCount = expected.filter(
    (f) => f.reporter.state === 'STATE_DROPPED'
  ).length;
  const checkerboardedFrames = expected.filter(
    (f) =>
      f.reporter.checkerboarded_needs_raster || f.reporter.has_missing_content
  ).length;

  let longestStallUs = 0;
  let hitchUs = 0;
  for (const w of windows) {
    const presented = expected.filter(
      (f) =>
        f.ts >= w.startTs &&
        f.ts <= w.endTs &&
        (f.reporter.state === 'STATE_PRESENTED_ALL' ||
          f.reporter.state === 'STATE_PRESENTED_PARTIAL')
    );
    for (let i = 1; i < presented.length; i++) {
      const gap = presented[i]!.ts - presented[i - 1]!.ts;
      longestStallUs = Math.max(longestStallUs, gap);
      const excess = gap / 1000 - VSYNC_MS;
      if (excess > 0) hitchUs += excess * 1000;
    }
  }
  const activeMs = windows.reduce(
    (sum, w) => sum + (w.endTs - w.startTs) / 1000,
    0
  );

  return {
    frameCount: expected.length,
    droppedCount,
    droppedPct:
      expected.length > 0 ? (droppedCount / expected.length) * 100 : 0,
    longestStallMs: longestStallUs / 1000,
    hitchRatioMsPerS: activeMs > 0 ? hitchUs / 1000 / activeMs : 0,
    checkerboardedFrames
  };
}

export interface FrameTimelineEntry {
  ts: number;
  state: FrameReporter['state'];
  hasCompositorAnimation: boolean;
  hasMainAnimation: boolean;
}

export function frameTimeline(events: TraceEvent[]): FrameTimelineEntry[] {
  return pipelineFrames(events).map((f) => ({
    ts: f.ts,
    state: f.reporter.state,
    hasCompositorAnimation: !!f.reporter.has_compositor_animation,
    hasMainAnimation: !!f.reporter.has_main_animation
  }));
}

/**
 * Reads every `PipelineReporter` begin event with a `frame_reporter`, the
 * `bench-input` mark, if present, and this pass's
 * `bench-window-start`/`bench-window-end` marks, and scores the motion
 * between the first and last frame. See drawerdeck's RESULTS.md ("Traces,
 * for #243" and "Active windows", #266 rule 10) for why active windows
 * bound this, and for the legacy (unscoped) scoring this bench does not
 * carry forward: every scenario here opens exactly one window per rep (no
 * scenario here has a mid-gesture pause the way drawerdeck's
 * touch-drag-half-full-back did), so there is nothing a legacy column would
 * show differently.
 */
export function analyzeMotion(events: TraceEvent[]): MotionAnalysis {
  const frames = pipelineFrames(events);

  const mark = events.find(
    (e) => e.name === 'bench-input' && e.cat === 'blink.user_timing'
  );

  if (frames.length < 2) {
    return {
      frameCount: frames.length,
      droppedCount: 0,
      droppedPct: 0,
      longestStallMs: 0,
      hitchRatioMsPerS: 0,
      inputToFirstMovedMs: null,
      checkerboardedFrames: 0,
      windowMs: 0,
      activeWindows: []
    };
  }

  const first = frames[0]!.ts;
  const last = frames[frames.length - 1]!.ts;

  const windows = activeWindows(events);
  const scoredWindows =
    windows.length > 0 ? windows : [{ startTs: first, endTs: last }];

  const scored = scoreFrames(frames, scoredWindows);
  const windowMs = scoredWindows.reduce(
    (sum, w) => sum + (w.endTs - w.startTs) / 1000,
    0
  );

  let inputToFirstMovedMs: number | null = null;
  if (mark) {
    const moved = frames.find(
      (f) =>
        f.ts >= mark.ts &&
        (f.reporter.has_compositor_animation || f.reporter.has_main_animation)
    );
    if (moved) inputToFirstMovedMs = (moved.ts - mark.ts) / 1000;
  }

  return {
    frameCount: scored.frameCount,
    droppedCount: scored.droppedCount,
    droppedPct: scored.droppedPct,
    longestStallMs: scored.longestStallMs,
    hitchRatioMsPerS: scored.hitchRatioMsPerS,
    inputToFirstMovedMs,
    checkerboardedFrames: scored.checkerboardedFrames,
    windowMs,
    activeWindows: windows
  };
}

// --- Mount scenario scoring (#340) ---------------------------------------
//
// The mount scenario has no "active window" the way a gesture does: there
// is one window per page load, from the client render or hydration's first
// synchronous line (`bench-mount-start`, in `src/mount/harness.ts`) to the
// first frame after every carousel instance on the page has published its
// state (`bench-mount-published`, written once `mount.spec.ts`'s own
// `page.waitForFunction(() => window.__mount.published())` resolves).
//
// A deck's own mount cost is scored three ways inside that window,
// following #340's own mount lessons (carried from #333's evidence):
//
// - **Main-thread busy time** (`mountTaskMs`): the sum of every top-level
//   `RunTask` event's *own* duration that overlaps the window at all --
//   including the whole duration of the task that contains
//   `bench-mount-start` itself, even the part that ran before the mark.
//   With SSR, the first paint is the server HTML, so a window from
//   hydration start to first paint would close before hydration runs
//   (#340's own lesson); this is why the window's *end* is "first frame
//   after every deck has published," not "first paint."
// - **Layout and style-recalc work** (`layoutCount`/`layoutMs`,
//   `styleRecalcCount`/`styleRecalcMs`): every `Layout` and
//   `UpdateLayoutTree` trace event in the window, counted and summed. This
//   does not distinguish a layout the browser scheduled as part of its own
//   rendering lifecycle from one a script forced synchronously on a dirty
//   tree -- a true black-box "forced reflow" classification across five
//   third-party libraries' own compiled code is not reliable from trace
//   events alone (#333's own evidence used a white-box technique,
//   `mount-layout.test.tsx`'s wrapped layout-reading APIs, which only works
//   for carouseldeck's own source). The clean/dirty-sibling pair of mount
//   variants (below) is what makes a forced layout's cost visible instead:
//   on the clean variant nothing has dirtied the tree before a deck mounts,
//   so a layout read there is close to free; on the dirty variant a sibling
//   already dirtied it in a layout effect run just before, so the same read
//   is forced to recompute. See RESULTS.md's "Method" section.
// - **Time to the first correct frame** (`timeToPublishedFrameMs`): from
//   `bench-mount-start` to the *last* presented `PipelineReporter` frame in
//   the capture, not the first one after `bench-mount-published` -- see
//   `analyzeMount`'s own comment for why "after" usually finds nothing.

export interface MountAnalysis {
  mountTaskMs: number;
  layoutCount: number;
  layoutMs: number;
  styleRecalcCount: number;
  styleRecalcMs: number;
  timeToPublishedFrameMs: number;
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function analyzeMount(events: TraceEvent[]): MountAnalysis | null {
  const startMark = events.find(
    (e) => e.name === 'bench-mount-start' && e.cat === 'blink.user_timing'
  );
  const publishedMark = events.find(
    (e) => e.name === 'bench-mount-published' && e.cat === 'blink.user_timing'
  );
  if (!startMark || !publishedMark) return null;
  const startTs = startMark.ts;

  // "The first frame with correct controls" (found the hard way, by a
  // first mount-trace run scoring `timeToPublishedFrameMs` as `null` on
  // every deck): a page with no running animation stops asking the
  // compositor for new frames once nothing changes, so there is usually no
  // presented frame *after* `bench-mount-published` at all -- the mark
  // itself, written from a second `page.evaluate` round-trip once
  // `page.waitForFunction` resolves, reliably lands a few ms *after* the
  // frame that actually painted the published state, not before it. The
  // right frame is the *last* one presented in this capture at all: nothing
  // here runs an entrance animation (every adapter's own header comment
  // says so), so nothing paints anything new after the mutation that made
  // `published()` true settles, and `mount.spec.ts`'s own two trailing
  // `requestAnimationFrame` waits exist only to give that last paint a
  // chance to finish before tracing stops, not to find a later one.
  //
  // Bounded to `ts >= startTs`: with SSR, the server HTML can already be
  // the correct, published state (carouseldeck's own natural-rest case,
  // #333/#337 -- nothing for hydration to fix), so the *global* last
  // presented frame can be the pre-hydration first paint, before
  // `bench-mount-start` even runs. A deck with nothing left to publish
  // scores 0ms, not a negative number.
  const frames = pipelineFrames(events);
  const presented = frames.filter(
    (f) =>
      f.ts >= startTs &&
      (f.reporter.state === 'STATE_PRESENTED_ALL' ||
        f.reporter.state === 'STATE_PRESENTED_PARTIAL')
  );
  const publishedFrame =
    presented.length > 0 ? presented[presented.length - 1] : undefined;

  // The window's end, for layout/style-recalc/task scoring, is the later of
  // the published mark and that last presented frame: whichever is later,
  // its own paint/raster work still belongs to the mount's own cost.
  const endTs = Math.max(
    publishedMark.ts,
    publishedFrame?.ts ?? publishedMark.ts
  );

  const complete = events.filter((e) => e.ph === 'X' && e.dur !== undefined);

  const mountTaskMs = complete
    .filter(
      (e) =>
        e.name === 'RunTask' && overlaps(e.ts, e.ts + e.dur!, startTs, endTs)
    )
    .reduce((sum, e) => sum + e.dur! / 1000, 0);

  const layouts = complete.filter(
    (e) => e.name === 'Layout' && overlaps(e.ts, e.ts + e.dur!, startTs, endTs)
  );
  const styleRecalcs = complete.filter(
    (e) =>
      e.name === 'UpdateLayoutTree' &&
      overlaps(e.ts, e.ts + e.dur!, startTs, endTs)
  );

  return {
    mountTaskMs,
    layoutCount: layouts.length,
    layoutMs: layouts.reduce((sum, e) => sum + e.dur! / 1000, 0),
    styleRecalcCount: styleRecalcs.length,
    styleRecalcMs: styleRecalcs.reduce((sum, e) => sum + e.dur! / 1000, 0),
    // 0, not `null`, when no frame at or after `startTs` is found: nothing
    // needed to paint after mount started, so the published state was
    // already there (see this function's own comment above).
    timeToPublishedFrameMs: publishedFrame
      ? (publishedFrame.ts - startTs) / 1000
      : 0
  };
}
