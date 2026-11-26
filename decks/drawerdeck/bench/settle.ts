// Settle-time arithmetic (#350, porting carouseldeck's #349), split out of
// bench.spec.ts so it can be unit tested without a browser (settle.test.ts).
// Every field is a `performance.now()` timestamp read off one page
// (src/harness.ts), so subtracting them needs no clock conversion, unlike
// trace.ts's microsecond CDP timestamps.

export interface SettleTiming {
  /** The gesture's first input event (`markWindowStart()`). */
  windowStart: number;
  /** The last rAF frame in which the drawer visibly moved. */
  settledAt: number;
  /** The gesture's own last input event (touchend/pointerup/click), or
   * `null` when none was captured. */
  lastInputAt: number | null;
  /** A `dismiss` scenario only (fairness rule 12): when the library itself
   * last reported the drawer closed (`reportOpen(false)`). `null` for every
   * other scenario, and for a dismiss the library never closed. */
  closedAt: number | null;
}

export interface SettleResult {
  /** Gesture start to the end of the drawer's motion (the later of its last
   * moving frame and `closedAt`), clamped to 0: a drawer that never responds
   * can have its last recorded movement predate the gesture. Still includes
   * the scripted gesture's own duration, but no longer `settle()`'s quiet
   * window, its polling latency or any round trip. */
  settleMs: number;
  /** The gesture's last input event to that same end: the part of settle
   * time the library itself controls. `null` when no qualifying input event
   * was captured. Clamped to 0 for the same reason. */
  motionAfterReleaseMs: number | null;
}

export function computeSettle(t: SettleTiming): SettleResult {
  const endedAt =
    t.closedAt === null ? t.settledAt : Math.max(t.settledAt, t.closedAt);
  return {
    settleMs: Math.max(0, endedAt - t.windowStart),
    // An input before the window opened (a setup click left over from an
    // earlier step) is not this gesture's input.
    motionAfterReleaseMs:
      t.lastInputAt === null || t.lastInputAt < t.windowStart
        ? null
        : Math.max(0, endedAt - t.lastInputAt)
  };
}
