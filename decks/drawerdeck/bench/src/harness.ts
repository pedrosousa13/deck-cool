// The bench's own probe (#266, originally #233), attached the same way on
// every drawer -- drawerdeck's, vaul's, Base UI's and React Aria's React
// components -- modelled on carouseldeck's own bench harness: read a
// position from the DOM, not a library's internals, and inject load the
// same way on every deck.
//
// "Openness" is how much of the drawer's own panel is visible from the
// bottom of the viewport (`window.innerHeight - panel.getBoundingClientRect().top`),
// which reads the same number whether a library moves the panel with
// native scroll (drawerdeck, React Aria) or a per-frame transform/CSS
// custom property (vaul, Base UI): all four report "half" at ~50% of the
// viewport height and "full" at ~92%, the two snap points every deck was
// given (content.ts). Each deck's own entry gives the panel an explicit
// `id="panel"` (the bench's own marker, not a library-specific one).
//
// Stalls and the longest stall come from a Chromium trace (../trace.ts);
// this probe is the main-thread-only view (frames, biggest per-frame step,
// signed travel, reversals), the load injection (`jank`), the cost signals
// (`loaf`, `heap`, `initDuration`) and the idle-time settle detector every
// scenario in scenarios.ts waits on (`idleFor`).

export interface DrawerBenchMetrics {
  frames: number;
  /** Largest per-frame movement, in px of openness. */
  maxStep: number;
  /** Signed px travelled. */
  travel: number;
  /** Sign changes of the per-frame movement: a re-snap or overshoot. */
  reversals: number;
}

export interface DrawerBenchProbe {
  m: DrawerBenchMetrics;
  reset(): void;
  /** px of the panel visible from the bottom of the viewport. */
  openness(): number;
  idleFor(): number;
  /** Turns the busy-loop jank timer on (ms per ~250ms tick) or off (0). */
  jank(ms: number): void;
  /** Chromium only: `long-animation-frame` entries since the last reset. */
  loaf(): { count: number; totalBlocking: number } | null;
  /** Chromium only: `performance.memory.usedJSHeapSize`. */
  heap(): number | null;
  /** `bench-init`'s duration, once `markInitEnd` has run. */
  initDuration(): number | null;
  /** Marks the start of one gesture's active window (#266 rule 10):
   * `scenarios.ts` calls this right before dispatching a gesture's first
   * input event. Captured by the trace in the same clock as
   * `PipelineReporter`, so `trace.ts` can bound stall scoring to it. */
  markWindowStart(): void;
  /** Marks the end of one gesture's active window (#266 rule 10):
   * `settle()` calls this once the drawer has been quiet for its threshold
   * (or it hits its own timeout), pairing with the `markWindowStart()` that
   * opened the gesture. */
  markWindowEnd(): void;
}

declare global {
  interface Window {
    __bench: DrawerBenchProbe;
  }
  interface Performance {
    // Chromium only; absent elsewhere.
    memory?: { usedJSHeapSize: number };
  }
}

export function markInitStart(): void {
  performance.mark('bench-init-start');
}

export function markInitEnd(): void {
  performance.mark('bench-init-end');
  try {
    performance.measure('bench-init', 'bench-init-start', 'bench-init-end');
  } catch {
    // The start mark is missing: leave initDuration() reporting null.
  }
}

export function attachHarness(opts: { panelSelector: string }): void {
  const { panelSelector } = opts;
  const m: DrawerBenchMetrics = {
    frames: 0,
    maxStep: 0,
    travel: 0,
    reversals: 0
  };

  function openness(): number {
    const el = document.querySelector<HTMLElement>(panelSelector);
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return 0; // unmounted/hidden
    return Math.max(0, window.innerHeight - r.top);
  }

  let last = openness();
  let lastStep = 0;
  let lastChangeAt = performance.now();
  let raf: number;

  function tick() {
    const now = openness();
    const step = now - last;
    if (Math.abs(step) > 0.5) lastChangeAt = performance.now();
    m.frames++;
    m.travel += step;
    m.maxStep = Math.max(m.maxStep, Math.abs(step));
    if (
      Math.sign(step) !== 0 &&
      Math.sign(lastStep) !== 0 &&
      Math.sign(step) !== Math.sign(lastStep)
    ) {
      m.reversals++;
    }
    if (Math.abs(step) > 0.5) lastStep = step;
    last = now;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // Jank: a main-thread busy loop, at most once per ~250ms, while armed --
  // the same mechanism carouseldeck's harness uses, so every load level
  // means the same thing on every deck here and there.
  let jankMs = 0;
  setInterval(() => {
    if (jankMs <= 0) return;
    const end = performance.now() + jankMs;
    while (performance.now() < end) {
      // busy
    }
  }, 250);

  let loafCount = 0;
  let loafBlocking = 0;
  if (
    'PerformanceObserver' in window &&
    PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
  ) {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[] &
        { blockingDuration?: number }[]) {
        loafCount++;
        loafBlocking +=
          (entry as { blockingDuration?: number }).blockingDuration ?? 0;
      }
    });
    obs.observe({ type: 'long-animation-frame', buffered: true });
  }

  window.__bench = {
    m,
    reset() {
      m.frames = 0;
      m.maxStep = 0;
      m.travel = 0;
      m.reversals = 0;
      lastStep = 0;
      loafCount = 0;
      loafBlocking = 0;
    },
    openness,
    idleFor: () => performance.now() - lastChangeAt,
    jank: (ms) => {
      jankMs = ms;
    },
    loaf: () =>
      'PerformanceObserver' in window &&
      PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
        ? { count: loafCount, totalBlocking: loafBlocking }
        : null,
    heap: () => performance.memory?.usedJSHeapSize ?? null,
    initDuration: () => {
      const [entry] = performance.getEntriesByName('bench-init', 'measure');
      return entry ? entry.duration : null;
    },
    markWindowStart: () => performance.mark('bench-window-start'),
    markWindowEnd: () => performance.mark('bench-window-end')
  };

  // Not used by this module, but keeps `raf`'s only write from being
  // reported dead by a linter that does not see this never cancels it: the
  // page never tears the drawer down.
  void raf;
}
