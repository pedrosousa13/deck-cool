import { describe, expect, it } from 'vitest';
import nav from '../nav.json';
import index from '../index.md?raw';

describe('@accordiondeck/docs', () => {
  it('lists its one placeholder page', () => {
    expect(nav).toEqual([{ label: 'Getting started', pages: ['index.md'] }]);
    expect(index).toMatch(/^# accordiondeck/);
  });
});
