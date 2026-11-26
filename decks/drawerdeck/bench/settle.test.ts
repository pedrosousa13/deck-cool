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
    lastInputAt: 1200,
    closedAt: null
  });

  assert.strictEqual(result.settleMs, 1200);
});

test('motionAfterReleaseMs is the last input event to the last moving frame', () => {
  const result = computeSettle({
    windowStart: 100,
    settledAt: 1300,
    lastInputAt: 1200,
    closedAt: null
  });

  assert.strictEqual(result.motionAfterReleaseMs, 100);
});

test('motionAfterReleaseMs is null when no input event was captured', () => {
  const result = computeSettle({
    windowStart: 100,
    settledAt: 1300,
    lastInputAt: null,
    closedAt: null
  });

  assert.strictEqual(result.motionAfterReleaseMs, null);
});

test('both metrics clamp to 0 for a deck that never moved after the gesture started', () => {
  // `settledAt` can predate the gesture entirely when the drawer never
  // responds: the last real movement was the setup's own, before
  // `markWindowStart()` ran.
  const result = computeSettle({
    windowStart: 1000,
    settledAt: 50,
    lastInputAt: 900,
    closedAt: null
  });

  assert.strictEqual(result.settleMs, 0);
  assert.strictEqual(result.motionAfterReleaseMs, 0);
});

test('a dismiss ends at the later of the last moving frame and the library reporting closed', () => {
  const result = computeSettle({
    windowStart: 100,
    settledAt: 1300,
    lastInputAt: 1200,
    closedAt: 1500
  });

  assert.strictEqual(result.settleMs, 1400);
  assert.strictEqual(result.motionAfterReleaseMs, 300);
});

test('a close reported before the last moving frame does not shorten the settle', () => {
  const result = computeSettle({
    windowStart: 100,
    settledAt: 1300,
    lastInputAt: 1200,
    closedAt: 1150
  });

  assert.strictEqual(result.settleMs, 1200);
  assert.strictEqual(result.motionAfterReleaseMs, 100);
});
