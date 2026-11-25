// What only the React 18 build does: the react package's own tests cover
// the rest, run again on React 18 and 19 by vitest.react-18.config.ts and
// vitest.react-19.config.ts.
import { version as reactVersion } from 'react';
import { expect, test } from 'vitest';
import { version } from '@accordiondeck/react';

test('the built package exports its placeholder version', () => {
  expect(version).toBe('0.0.0');
});

test('runs on React 18', () => {
  expect(reactVersion).toMatch(/^18\./);
});

// Excluded from the React 18 run: the sanity check above already covers it.
test('runs on React 19', () => {
  expect(reactVersion).toMatch(/^19\./);
});
