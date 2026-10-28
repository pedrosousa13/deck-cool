import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount every render, and drop containers a test appended itself, so one
// test's drawer never answers another's query.
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});
