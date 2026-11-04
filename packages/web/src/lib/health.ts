/**
 * Relatório de saúde do servidor (`GET /api/health`), para conferir um deploy sem entrar no app: se a chave da
 * Anthropic e o Supabase chegaram ao processo, e qual revisão responde (Cloud Run põe `K_SERVICE`/`K_REVISION`
 * no ambiente). Só booleanos e nomes; nunca o valor de uma chave. Com `?deep=1` e login (S32), a rota acrescenta
 * as consultas de `services/health.service.ts`.
 */
export interface HealthReport {
  ok: true;
  /** `ANTHROPIC_API_KEY` presente: a leitura da IA está ligada. */
  ai: boolean;
  /** URL e chave pública do Supabase presentes: login ligado. */
  auth: boolean;
  /** S32: chave secret do Supabase presente — convidar conta nova por e-mail ligado. */
  invites: boolean;
  service: string | null;
  revision: string | null;
}

const present = (value: string | undefined): boolean => (value ?? '').trim() !== '';

export function healthReport(env: Record<string, string | undefined>): HealthReport {
  return {
    ok: true,
    ai: present(env['ANTHROPIC_API_KEY']),
    auth: present(env['NEXT_PUBLIC_SUPABASE_URL']) && present(env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']),
    // Os nomes de lib/supabase/admin.ts (que é server-only; aqui só se olha se a variável existe).
    invites: present(env['SUPABASE_SECRET_KEY']) || present(env['SUPABASE_SERVICE_ROLE_KEY']),
    service: env['K_SERVICE'] ?? null,
    revision: env['K_REVISION'] ?? null,
  };
}
