/** Pregação das ligações entre paredes (S39, `rules/nailing.ts`, hipótese P48): só texto da folha. */

import { describe, expect, it } from 'vitest';
import { DEFAULT_NAILING, resolveNailing } from '../../src/rules/nailing';

describe('resolveNailing', () => {
  it('sem config: os valores da prancha (3× 3" nails or screws @ 12" OC)', () => {
    expect(DEFAULT_NAILING.wallJoint).toEqual({ count: 3, fastener: '3" nails or screws', spacing: 12 });
    expect(resolveNailing(undefined)).toEqual({ wallJoint: { count: 3, fastener: '3" nails or screws', spacing: 12 } });
    expect(resolveNailing({})).toEqual(resolveNailing(undefined));
  });

  it('o projeto troca campo a campo', () => {
    expect(resolveNailing({ wallJoint: { spacing: 8 } }).wallJoint).toEqual({ count: 3, fastener: '3" nails or screws', spacing: 8 });
    expect(resolveNailing({ wallJoint: { count: 2, fastener: '16d nails', spacing: 16 } }).wallJoint).toEqual({
      count: 2,
      fastener: '16d nails',
      spacing: 16,
    });
  });

  it('não altera o default', () => {
    const r = resolveNailing({ wallJoint: { count: 9 } });
    r.wallJoint.count = 1;
    expect(DEFAULT_NAILING.wallJoint.count).toBe(3);
  });
});
