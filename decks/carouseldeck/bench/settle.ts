// Settle-time arithmetic (#348, fixing #340/#346's own bench), split out of
// bench.spec.ts so it can be unit tested without a browser (settle.test.ts).
// `windowStart`, `settledAt` and `lastInputAt` are all `performance.now()`
// timestamps read off one page (src/harness.ts), so subtracting them needs
// no clock conversion, unlike trace.ts's microsecond CDP timestamps.

export interface SettleTiming {
  /** The gesture's first input event (`markWindowStart()`). */
  windowStart: number;
  /** The last rAF frame in which the carousel visibly moved. */
  settledAt: number;
  /** The gesture's own last input event (touchend/pointerup/wheel/click),
   * or `null` when none was captured. */
  lastInputAt: number | null;
}

export interface SettleResult {
  /** `settledAt - windowStart`: the gesture's first input to its last
   * moving frame. Still includes the scripted gesture's own duration
   * (the same for every deck in a given scenario), unlike the old
   * `Date.now()` measure, this no longer includes `settle()`'s quiet
   * window, its polling latency or any round trip. Clamped to 0: a deck
   * that never responds can have its last recorded movement predate the
   * gesture, which would otherwise read as negative. */
  settleMs: number;
  /** `settledAt - lastInputAt`: the gesture's own last input event to the
   * last moving frame -- the part of settle time the library itself
   * controls, excluding the scripted gesture's duration. `null` when no
   * qualifying input event was captured. Clamped to 0, for the same
   * never-responded case `settleMs` clamps. */
  motionAfterReleaseMs: number | null;
}

export function computeSettle(t: SettleTiming): SettleResult {
  return {
    settleMs: Math.max(0, t.settledAt - t.windowStart),
    motionAfterReleaseMs:
      t.lastInputAt === null ? null : Math.max(0, t.settledAt - t.lastInputAt)
  };
}
