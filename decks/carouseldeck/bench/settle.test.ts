// Unit tests for settle.ts's pure arithmetic: no browser or Playwright
// involved. Run with `node --test settle.test.ts` (see trace.test.ts's own
// header comment for why this bench runs tests this way).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeSettle } from './settle.ts';

test('settleMs is the gesture start to the last moving frame, not the raw gap', () => {
  const result = computeSettle({
    windowStart: 100,
    settledAt: 1300,
    lastInputAt: 1200
  });

  assert.strictEqual(result.settleMs, 1200);
});

test('motionAfterReleaseMs is the last input event to the last moving frame', () => {
  const result = computeSettle({
    windowStart: 100,
    settledAt: 1300,
    lastInputAt: 1200
  });

  assert.strictEqual(result.motionAfterReleaseMs, 100);
});

test('motionAfterReleaseMs is null when no input event was captured', () => {
  const result = computeSettle({
    windowStart: 100,
    settledAt: 1300,
    lastInputAt: null
  });

  assert.strictEqual(result.motionAfterReleaseMs, null);
});

test('both metrics clamp to 0 for a deck that never moved after the gesture started', () => {
  // `settledAt` (the probe's own `lastChangeAt`) can predate the gesture
  // entirely when the carousel never responds: the last real movement was
  // page-load jitter, before `markWindowStart()` ran.
  const result = computeSettle({
    windowStart: 1000,
    settledAt: 50,
    lastInputAt: 900
  });

  assert.strictEqual(result.settleMs, 0);
  assert.strictEqual(result.motionAfterReleaseMs, 0);
});
