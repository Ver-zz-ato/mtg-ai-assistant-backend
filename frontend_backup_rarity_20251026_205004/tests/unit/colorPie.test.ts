import { describe, it, expect } from 'vitest';
import { computeColorIdentityCounts } from '@/lib/deck/colors';

describe('computeColorIdentityCounts', () => {
  it('sums quantities per unique color identity', () => {
    const cards = [
      { name: 'Island', qty: 10, colors: ['U'] },
      { name: 'Azorius Signet', qty: 2, colors: ['W','U'] },
      { name: 'Ornithopter', qty: 4, colors: [] },
      { name: 'Rakdos Guildgate', qty: 1, colors: ['B','R','R'] },
    ];
    const out = computeColorIdentityCounts(cards as any);
    expect(out).toEqual({ W: 2, U: 12, B: 1, R: 1, G: 0 });
  });
});