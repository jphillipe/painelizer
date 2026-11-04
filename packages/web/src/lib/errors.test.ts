import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('Error dá a mensagem; o resto vira texto', () => {
    expect(errorMessage(new RangeError('fora'))).toBe('fora');
    expect(errorMessage('x')).toBe('x');
    expect(errorMessage(42)).toBe('42');
  });
});
