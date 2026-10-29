// Copied from decks/carouseldeck/prototypes/scroll-snap/bench/trace.ts
// (#266: this bench moved out of carouseldeck's prototypes, so it keeps its
// own copy instead of importing across decks). Chromium-only frame timing
// from a CDP trace: the one scripted method research #137 (carouseldeck)
// found is not fooled by a main-thread long task (Probe 1: the trace saw 18
// presented frames with a compositor animation inside a 411ms rAF gap that
// never ran). `PipelineReporter` (categories
// `cc,benchmark,disabled-by-default-devtools.timeline.frame`) gives one
// begin/end pair per frame, with `args.frame_reporter.state`
// (`STATE_PRESENTED_ALL`/`PARTIAL`/`DROPPED`/`NO_UPDATE_DESIRED`) and whether
// a compositor or main-thread animation produced it. A
// `performance.mark('bench-input')` in the real input listener (armed by
// `window.__bench.armInputMark()`) lands in the same trace, in category
// `blink.user_timing`, and its `ts` is in the same clock as every other
// event, so it anchors "input to first moved frame" without needing
// `EventLatency`.

import type { CDPSession } from '@playwright/test';

export const CATEGORIES = [
  'disabled-by-default-devtools.timeline.frame',
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

/** One gesture's active window (#266 rule 10): from `scenarios.ts`'s
 * `markWindowStart()`, at the gesture's first input event, to `settle()`'s
 * `markWindowEnd()`, once the drawer has been quiet for the settle
 * detector's threshold (or it hits its own timeout). `ts`, like a frame's,
 * is in the trace's own clock (microseconds). */
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
  /** This pass's active windows, one per gesture (#266 rule 10). */
  activeWindows: ActiveWindow[];
  /** The same metrics as this object's own top level, scored the old way:
   * across the whole trace, idle time between gestures included. Kept so a
   * report can show both side by side (#266 rule 10) rather than silently
   * swapping numbers. */
  legacy: {
    droppedCount: number;
    droppedPct: number;
    longestStallMs: number;
    hitchRatioMsPerS: number;
  };
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
 * mark, in trace order (#266 rule 10): `scenarios.ts` always opens one
 * before dispatching a gesture's first input event, and closes it from
 * `settle()`, so the i-th start and the i-th end belong to the same
 * gesture. Unmatched marks (an odd count, from a run this instrumentation
 * predates) are dropped rather than guessed at. */
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
 * `frames` -- restricted to the given windows (#266 rule 10). A frame
 * outside every window is not "expected", and the gap between two
 * presented frames is only a stall when both sit inside the *same* window:
 * idle time between windows (the scenario's own mid-gesture pause, say) is
 * never scored, and neither is the quiet tail after a gesture's last real
 * move, since nothing presents there -- there is no later presented frame
 * left inside the window to gap against. Passing one window spanning the
 * whole trace reproduces the pre-#266-rule-10 (legacy) numbers.
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

/**
 * The per-frame timeline the scorer (`analyzeMotion`) reduces into its
 * summary numbers, exposed on its own (#266: #243 needs frame timestamps
 * against input timestamps, which the summary alone throws away). One entry
 * per `PipelineReporter` frame, in trace order, with its raw clock (`ts`,
 * microseconds, same clock as every other trace event including a
 * `bench-input` mark) and the fields `analyzeMotion` itself reads.
 */
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
 * Reads every `PipelineReporter` begin event with a `frame_reporter`
 * (one per frame that was expected to update), the `bench-input` mark, if
 * present, and this pass's `bench-window-start`/`bench-window-end` marks
 * (#266 rule 10), and scores the motion between the first and last frame.
 *
 * "Expected" frames: Chromium's own `affects_smoothness` flag was false
 * for a programmatic scroll in the research probe, so the bench decides
 * this itself (research #137, "frames expected"): every tick that is not
 * explicitly "nothing to update" is one visually relevant to this motion
 * window, dropped or not. The longest visual stall and the hitch ratio are
 * about what the screen showed: the gap between two frames that actually
 * presented, not between two expected ticks (a run of dropped ticks
 * between them still ticks every ~16.7ms, which would otherwise hide the
 * real stall) -- see `scoreFrames` for how a window bounds this.
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
      activeWindows: [],
      legacy: {
        droppedCount: 0,
        droppedPct: 0,
        longestStallMs: 0,
        hitchRatioMsPerS: 0
      }
    };
  }

  const first = frames[0]!.ts;
  const last = frames[frames.length - 1]!.ts;

  // No active-window marks on this trace (a run from before #266 rule 10):
  // fall back to the whole trace as one window, rather than reporting
  // every scoped number as zero.
  const windows = activeWindows(events);
  const scoredWindows =
    windows.length > 0 ? windows : [{ startTs: first, endTs: last }];
  const legacyWindow: ActiveWindow[] = [{ startTs: first, endTs: last }];

  const scored = scoreFrames(frames, scoredWindows);
  const legacy = scoreFrames(frames, legacyWindow);
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
    activeWindows: windows,
    legacy: {
      droppedCount: legacy.droppedCount,
      droppedPct: legacy.droppedPct,
      longestStallMs: legacy.longestStallMs,
      hitchRatioMsPerS: legacy.hitchRatioMsPerS
    }
  };
}
