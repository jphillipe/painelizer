import { describe, expect, it } from 'vitest';
import { http, ServiceError, toServiceError } from './http';

describe('http (ky)', () => {
  it('erro HTTP vira ServiceError com status e corpo', async () => {
    const fetchMock: typeof fetch = async () => new Response(JSON.stringify({ error: 'nope' }), { status: 418, headers: { 'content-type': 'application/json' } });
    const client = http.extend({ fetch: fetchMock, retry: 0 });
    const err = await client.get('https://example.test/x').json().catch((e: unknown) => e);
    const se = toServiceError(err);
    expect(se).toBeInstanceOf(ServiceError);
    expect(se?.status).toBe(418);
    expect(se?.body).toEqual({ error: 'nope' });
    expect(se?.message).toContain('HTTP 418 GET https://example.test/x');
  });

  it('erro que não é do ky passa adiante', () => {
    expect(toServiceError(new RangeError('x'))).toBeUndefined();
    expect(toServiceError(new ServiceError('y', 500))?.status).toBe(500);
  });
});
