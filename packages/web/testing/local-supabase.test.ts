/**
 * A trava dos testes contra o Supabase (S33): só endereço da máquina, e as três chaves juntas. Roda no `pnpm test`
 * (sem banco): é ela que impede um `TEST_SUPABASE_URL` copiado do `.env.local` de apagar dados do projeto real.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertLocalUrl, localSupabaseEnv, TEST_KEY_VAR, TEST_SECRET_VAR, TEST_URL_VAR } from './local-supabase';

const keys = { [TEST_KEY_VAR]: 'sb_publishable_x', [TEST_SECRET_VAR]: 'sb_secret_y' };

describe('localSupabaseEnv', () => {
  it('sem as três variáveis: undefined (os testes do banco são pulados)', () => {
    expect(localSupabaseEnv({})).toBeUndefined();
    expect(localSupabaseEnv({ [TEST_URL_VAR]: 'http://127.0.0.1:54321', [TEST_KEY_VAR]: 'k' })).toBeUndefined();
    expect(localSupabaseEnv({ [TEST_URL_VAR]: ' ', ...keys })).toBeUndefined();
  });

  it('com o Supabase local: as chaves', () => {
    expect(localSupabaseEnv({ [TEST_URL_VAR]: 'http://127.0.0.1:54321', ...keys })).toEqual({
      url: 'http://127.0.0.1:54321',
      key: 'sb_publishable_x',
      secretKey: 'sb_secret_y',
    });
    expect(localSupabaseEnv({ [TEST_URL_VAR]: 'http://localhost:54321', ...keys })?.url).toBe('http://localhost:54321');
  });

  it('URL de projeto hospedado: lança, nunca roda', () => {
    expect(() => localSupabaseEnv({ [TEST_URL_VAR]: 'https://sulbendliqbfibvmzcpz.supabase.co', ...keys })).toThrow(
      /Supabase local/,
    );
    expect(() => assertLocalUrl('https://127.0.0.1.example.com')).toThrow();
    expect(() => assertLocalUrl('not a url')).toThrow(/não é uma URL/);
    expect(() => assertLocalUrl('http://[::1]:54321')).not.toThrow();
  });
});

describe('supabase-env.mjs', () => {
  const script = fileURLToPath(new URL('./supabase-env.mjs', import.meta.url));
  const run = (input: string, ...args: string[]) =>
    execFileSync(process.execPath, [script, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

  it('lê `supabase status -o env`, preferindo as chaves novas', () => {
    const out = run(
      'API_URL="http://127.0.0.1:54321"\nANON_KEY="eyJ.anon"\nSERVICE_ROLE_KEY="eyJ.svc"\nPUBLISHABLE_KEY="sb_publishable_a"\nSECRET_KEY="sb_secret_b"\n',
    );
    expect(out.trim().split('\n')).toEqual([
      'TEST_SUPABASE_URL=http://127.0.0.1:54321',
      'TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_a',
      'TEST_SUPABASE_SECRET_KEY=sb_secret_b',
    ]);
  });

  it('lê JSON em qualquer nível e os nomes antigos; --export para o shell', () => {
    const out = run(
      JSON.stringify({ result: { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's' } }),
      '--export',
    );
    expect(out).toContain('export TEST_SUPABASE_PUBLISHABLE_KEY=a');
    expect(out).toContain('export TEST_SUPABASE_SECRET_KEY=s');
  });

  it('falta chave: sai com erro e não imprime nada na saída', () => {
    expect(() => run('API_URL=http://127.0.0.1:54321\n')).toThrow();
  });
});
