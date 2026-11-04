import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));

const { deepHealth, MIGRATION_OF } = await import('./health.service');
type DeepDeps = import('./health.service').DeepDeps;

const user = { id: 'u1', email: 'a@x.com' };
const team = { ok: true as const, team: { id: 't1', name: 'National Lumber', role: 'admin' as const, members: [] } };

function deps(over: Partial<DeepDeps> = {}): DeepDeps {
  let t = 0;
  return {
    configured: () => true,
    user: async () => user,
    probes: async () => ({ projects: async () => {}, teams: async () => {} }),
    team: async () => team,
    now: () => (t += 5),
    ...over,
  };
}

describe('deepHealth (S32)', () => {
  it('sem Supabase: relatório ok sem consultas; com Supabase e sem login: signed_out', async () => {
    expect(await deepHealth(deps({ configured: () => false }))).toEqual({ kind: 'report', ok: true, supabase: 'unconfigured' });
    expect(await deepHealth(deps({ user: async () => undefined }))).toEqual({ kind: 'signed_out' });
  });

  it('tudo responde: ok, tempo de cada consulta, quem pediu e o time', async () => {
    expect(await deepHealth(deps())).toEqual({
      kind: 'report',
      ok: true,
      supabase: 'ok',
      user: 'a@x.com',
      team: { name: 'National Lumber', role: 'admin' },
      // As consultas rodam juntas: o relógio falso intercala começos e fins.
      checks: { projects: { ok: true, ms: 10 }, teams: { ok: true, ms: 10 } },
    });
  });

  it('tabela que falta aponta a migração; outro erro só a mensagem; sem time, team null', async () => {
    const missing = Object.assign(new Error('Could not find the table public.teams in the schema cache'), { code: 'PGRST205' });
    const report = await deepHealth(
      deps({
        probes: async () => ({
          projects: async () => {
            throw new Error('timeout');
          },
          teams: async () => {
            throw missing;
          },
        }),
        team: async () => ({ ok: true, team: undefined }),
      }),
    );
    expect(report).toMatchObject({
      kind: 'report',
      ok: false,
      supabase: 'error',
      team: null,
      checks: { projects: { ok: false, error: 'timeout' }, teams: { ok: false, migration: MIGRATION_OF['teams'] } },
    });
    expect(report.kind === 'report' && 'checks' in report && report.checks['projects']).not.toHaveProperty('migration');
  });
});
