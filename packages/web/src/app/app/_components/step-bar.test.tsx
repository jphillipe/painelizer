import { describe, expect, it } from 'vitest';
import { doneSteps } from './step-bar';

describe('doneSteps (M2)', () => {
  it('sem projeto nada está feito; com projeto o editor fica alcançável; com resultado, os painéis', () => {
    expect(doneSteps(false, false)).toEqual([]);
    expect(doneSteps(true, false)).toEqual([1, 2]);
    expect(doneSteps(true, true)).toEqual([1, 2, 3]);
  });
});
