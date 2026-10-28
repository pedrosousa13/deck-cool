import { describe, expect, it } from 'vitest';
import { version } from '../src/index';

describe('@drawerdeck/react', () => {
  it('exports its placeholder version', () => {
    expect(version).toBe('0.0.0');
  });
});
