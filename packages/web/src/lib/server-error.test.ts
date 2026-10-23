import { describe, expect, it } from 'vitest';
import { ServiceError } from './http';
import { describeServerError } from './server-error';

class ExtractError extends Error {
  constructor(m: string) {
    super(m);
    this.name = 'ExtractError';
  }
}

describe('describeServerError', () => {
  it('erros de domínio e de serviço voltam com a própria mensagem', () => {
    expect(describeServerError(new ExtractError('A resposta não é JSON.'))).toBe('A resposta não é JSON.');
    expect(describeServerError(new ServiceError('HTTP 502 GET x', 502))).toBe('HTTP 502 GET x');
  });

  it('erro genérico leva nome e texto, curtos, para quem viu a falha relatar', () => {
    expect(describeServerError(new TypeError('fetch failed'))).toBe('Something went wrong on the server (TypeError: fetch failed).');
    const long = new Error('x'.repeat(500));
    const msg = describeServerError(long);
    expect(msg.length).toBeLessThan(300);
    expect(msg.endsWith('…).')).toBe(true);
    expect(describeServerError('string')).toBe('Something went wrong on the server.');
  });
});
