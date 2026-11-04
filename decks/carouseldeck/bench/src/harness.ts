// The gesture bench's own probe (#340, ported from
// decks/drawerdeck/bench/src/harness.ts, #266), attached the same way on
// every carousel: carouseldeck's, Embla's, Keen's, Swiper's and Splide's.
// Reads a position from the DOM, not a library's internals (the convention
// drawerdeck's own header comment names), and injects load the same way on
// every deck.
//
// "Position" is a `trackSelector` element's `getBoundingClientRect().left`:
// whichever element each adapter names as the one that visibly carries the
// slides (a `translate3d` track for Embla/Keen/Swiper/Splide, or carouseldeck's
// first slide, moved by native scroll). A child's bounding rect is in
// viewport coordinates either way, so it shifts the same way whether the
// library moves it with a transform or lets the browser scroll it -- see
// each adapter's own header comment for its selector and why.
//
// "Published" is a `dotsSelector` element's `data-count` attribute: every
// adapter renders a dots bar driven by that library's own reported slide
// count (carouseldeck's real `Deck.Dots`, bearing its own
// `data-carouseldeck-dots` marker and `data-count`; every rival's own
// bench-owned equivalent, `[data-bench-dots]`, driven only by that library's
// own API). `published()` is true once that count matches `SLIDE_COUNT` --
// the "Dots count" signal #333's mount fix measured against, generalised to
// every deck here (#340's mount lessons: "for carouseldeck, the Dots count;
// for each rival, its own API's equivalent").
//
// Stalls and the longest stall come from a Chromium trace (../trace.ts);
// this probe is the main-thread-only view (frames, biggest per-frame step,
// signed travel, reversals), the load injection (`jank`), the cost signals
// (`loaf`, `heap`, `initDuration`) and the idle-time settle detector every
// scenario in scenarios.ts waits on (`idleFor`).

export interface CarouselBenchMetrics {
  frames: number;
  /** Largest per-frame movement, in px of the track's position. */
  maxStep: number;
  /** Signed px travelled. */
  travel: number;
  /** Sign changes of the per-frame movement: a re-snap or overshoot. */
  reversals: number;
}

export interface CarouselBenchProbe {
  m: CarouselBenchMetrics;
  reset(): void;
  /** px of the track selector's left edge, in viewport coordinates. */
  position(): number;
  idleFor(): number;
  /** Turns the busy-loop jank timer on (ms per ~250ms tick) or off (0). */
  jank(ms: number): void;
  /** Chromium only: `long-animation-frame` entries since the last reset. */
  loaf(): { count: number; totalBlocking: number } | null;
  /** Chromium only: `performance.memory.usedJSHeapSize`. */
  heap(): number | null;
  /** `bench-init`'s duration, once `markInitEnd` has run. */
  initDuration(): number | null;
  /** Marks the start of one gesture's active window: `scenarios.ts` calls
   * this right before dispatching a gesture's first input event. Captured
   * by the trace in the same clock as `PipelineReporter`, so `trace.ts` can
   * bound stall scoring to it (the same convention drawerdeck's bench
   * uses, #266 rule 10). */
  markWindowStart(): void;
  /** Marks the end of one gesture's active window: `settle()` calls this
   * once the carousel has been quiet for its threshold (or it hits its own
   * timeout), pairing with the `markWindowStart()` that opened the
   * gesture. */
  markWindowEnd(): void;
  /** Whether every rendered dots bar on the page reports the full slide
   * count (#340's mount lessons, generalised to the gesture bench too so
   * `smoke.spec.ts` can wait on it the same way): `dotsSelector`'s own
   * `data-count` attribute, read from the DOM, never a library's internals. */
  published(): boolean;
  /** The current index, as the dots bar's own `data-index` attribute
   * reports it (each adapter's own React state, read from that library's
   * index-changed callback, renders it there); `null` before the first
   * report. */
  index(): number | null;
}

declare global {
  interface Window {
    __bench: CarouselBenchProbe;
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

export function attachHarness(opts: {
  trackSelector: string;
  dotsSelector: string;
  slideCount: number;
}): void {
  const { trackSelector, dotsSelector, slideCount } = opts;
  const m: CarouselBenchMetrics = {
    frames: 0,
    maxStep: 0,
    travel: 0,
    reversals: 0
  };

  function position(): number {
    const el = document.querySelector<HTMLElement>(trackSelector);
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return 0; // unmounted/hidden
    return r.left;
  }

  let last = position();
  let lastStep = 0;
  let lastChangeAt = performance.now();
  let raf: number;

  function tick() {
    const now = position();
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
  // the same mechanism drawerdeck's harness uses, so every load level means
  // the same thing on every deck here and there.
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

  function published(): boolean {
    const el = document.querySelector<HTMLElement>(dotsSelector);
    return el?.getAttribute('data-count') === String(slideCount);
  }

  function index(): number | null {
    const el = document.querySelector<HTMLElement>(dotsSelector);
    const raw = el?.getAttribute('data-index');
    return raw === null || raw === undefined ? null : Number(raw);
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
    position,
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
    markWindowEnd: () => performance.mark('bench-window-end'),
    published,
    index
  };

  // Not used by this module, but keeps `raf`'s only write from being
  // reported dead by a linter that does not see this never cancels it: the
  // page never tears the carousel down.
  void raf;
}
