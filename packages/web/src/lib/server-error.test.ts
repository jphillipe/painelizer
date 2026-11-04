import { describe, expect, it } from 'vitest';
import { ServiceError } from './http';
import { ExtractError } from 'extract';
import { describeServerError } from './server-error';


describe('describeServerError', () => {
  it('erros de domínio dizem a frase do código (S26), nunca o português; serviço volta com a própria mensagem', () => {
    expect(describeServerError(new ExtractError('a resposta não é JSON', undefined, { code: 'RESPONSE_NOT_JSON' }))).toBe('The AI response is not valid JSON. Try again.');
    expect(describeServerError(new ExtractError('algo sem código'))).toMatch(/^The reading failed/);
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
