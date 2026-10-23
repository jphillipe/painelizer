import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));

const { currentUser, isAuthConfigured, requireUser, signIn, signOut, SignedOutError } = await import('./auth.service');
type AuthApi = import('./auth.service').AuthApi;
type AuthDeps = import('./auth.service').AuthDeps;

const alice = { id: 'u1', email: 'alice@example.com' };

function fakeAuth(over: Partial<AuthApi> = {}): AuthApi {
  return {
    signInWithPassword: async () => ({ data: { user: alice }, error: null }),
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: { user: alice }, error: null }),
    ...over,
  };
}
const deps = (auth: AuthApi | undefined, configured = auth !== undefined): AuthDeps => ({ auth: async () => auth, configured: () => configured });

describe('auth.service (S22.0)', () => {
  it('sem Supabase: ninguém está logado, nada exige login, sair não faz nada', async () => {
    const d = deps(undefined);
    expect(isAuthConfigured(d)).toBe(false);
    expect(await currentUser(d)).toBeUndefined();
    expect(await requireUser(d)).toBeUndefined();
    await expect(signOut(d)).resolves.toBeUndefined();
    expect(await signIn('a@b.c', 'x', d)).toEqual({ ok: false, message: 'Sign-in is not set up on this server.' });
  });

  it('com sessão devolve id e e-mail; sem sessão, requireUser lança SignedOutError', async () => {
    expect(await currentUser(deps(fakeAuth()))).toEqual(alice);
    expect(await requireUser(deps(fakeAuth()))).toEqual(alice);
    const out = deps(fakeAuth({ getUser: async () => ({ data: { user: null }, error: null }) }));
    expect(await currentUser(out)).toBeUndefined();
    await expect(requireUser(out)).rejects.toBeInstanceOf(SignedOutError);
    const broken = deps(fakeAuth({ getUser: async () => ({ data: { user: null }, error: { message: 'JWT expired', status: 401 } }) }));
    expect(await currentUser(broken)).toBeUndefined();
    const down = deps(fakeAuth({ getUser: async () => { throw new TypeError('fetch failed'); } }));
    expect(await currentUser(down)).toBeUndefined();
  });

  it('login: sucesso, credenciais erradas por código ou por status 400, limite de tentativas, serviço fora', async () => {
    const calls: { email: string; password: string }[] = [];
    const ok = deps(fakeAuth({ signInWithPassword: async (c) => { calls.push(c); return { data: { user: alice }, error: null }; } }));
    expect(await signIn('alice@example.com', 'secret', ok)).toEqual({ ok: true, user: alice });
    expect(calls).toEqual([{ email: 'alice@example.com', password: 'secret' }]);

    const wrong = deps(fakeAuth({ signInWithPassword: async () => ({ data: { user: null }, error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 } }) }));
    expect(await signIn('a', 'b', wrong)).toEqual({ ok: false, message: 'Email or password is incorrect.' });
    const wrong400 = deps(fakeAuth({ signInWithPassword: async () => ({ data: { user: null }, error: { message: 'Invalid login credentials', status: 400 } }) }));
    expect(await signIn('a', 'b', wrong400)).toEqual({ ok: false, message: 'Email or password is incorrect.' });
    const limited = deps(fakeAuth({ signInWithPassword: async () => ({ data: { user: null }, error: { message: 'Request rate limit reached', code: 'over_request_rate_limit', status: 429 } }) }));
    expect((await signIn('a', 'b', limited)) as { message?: string }).toMatchObject({ ok: false, message: expect.stringContaining('Too many attempts') });
    const other = deps(fakeAuth({ signInWithPassword: async () => ({ data: { user: null }, error: { message: 'Database error', code: 'unexpected_failure', status: 500 } }) }));
    expect(await signIn('a', 'b', other)).toEqual({ ok: false, message: 'Could not sign in: Database error' });
    const down = deps(fakeAuth({ signInWithPassword: async () => { throw new TypeError('fetch failed'); } }));
    expect((await signIn('a', 'b', down)) as { message?: string }).toMatchObject({ ok: false, message: expect.stringContaining('Could not reach') });
    // O cliente real não lança: devolve o erro de rede com status 0.
    const down0 = deps(fakeAuth({ signInWithPassword: async () => ({ data: { user: null }, error: { message: 'fetch failed', status: 0 } }) }));
    expect((await signIn('a', 'b', down0)) as { message?: string }).toMatchObject({ ok: false, message: expect.stringContaining('Could not reach') });
  });

  it('sair chama o Supabase e não lança se ele falhar', async () => {
    let out = 0;
    await signOut(deps(fakeAuth({ signOut: async () => { out += 1; return { error: null }; } })));
    expect(out).toBe(1);
    await expect(signOut(deps(fakeAuth({ signOut: async () => { throw new Error('boom'); } })))).resolves.toBeUndefined();
  });
});
