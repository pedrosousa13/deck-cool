import { describe, expect, it } from 'vitest';
import { version } from '@accordiondeck/react';

describe('@accordiondeck/react', () => {
  it('exports its placeholder version', () => {
    expect(version).toBe('0.0.0');
  });
});
