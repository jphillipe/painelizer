import { describe, expect, it } from 'vitest';
import { healthReport } from './health';

describe('healthReport', () => {
  it('diz o que chegou ao processo, sem valores', () => {
    const report = healthReport({
      ANTHROPIC_API_KEY: 'sk-ant-x',
      NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      K_SERVICE: 'panelizer',
      K_REVISION: 'panelizer-00003-abc',
    });
    expect(report).toEqual({ ok: true, ai: true, auth: true, invites: false, service: 'panelizer', revision: 'panelizer-00003-abc' });
    expect(JSON.stringify(report)).not.toContain('sk-ant');
  });

  it('chave vazia ou só espaços conta como ausente; fora do Cloud Run não há revisão', () => {
    expect(healthReport({ ANTHROPIC_API_KEY: '  ', NEXT_PUBLIC_SUPABASE_URL: 'u' })).toEqual({
      ok: true, ai: false, auth: false, invites: false, service: null, revision: null,
    });
    expect(healthReport({})).toMatchObject({ ai: false, auth: false, invites: false });
    expect(healthReport({ SUPABASE_SECRET_KEY: 'sb_secret_x' })).toMatchObject({ invites: true });
    expect(JSON.stringify(healthReport({ SUPABASE_SECRET_KEY: 'sb_secret_x' }))).not.toContain('sb_secret');
  });
});
