/**
 * Relatório de saúde do servidor (`GET /api/health`), para conferir um deploy sem entrar no app: se a chave da
 * Anthropic e o Supabase chegaram ao processo, e qual revisão responde (Cloud Run põe `K_SERVICE`/`K_REVISION`
 * no ambiente). Só booleanos e nomes; nunca o valor de uma chave.
 */
export interface HealthReport {
  ok: true;
  /** `ANTHROPIC_API_KEY` presente: a leitura da IA está ligada. */
  ai: boolean;
  /** URL e chave pública do Supabase presentes: login ligado. */
  auth: boolean;
  service: string | null;
  revision: string | null;
}

const present = (value: string | undefined): boolean => (value ?? '').trim() !== '';

export function healthReport(env: Record<string, string | undefined>): HealthReport {
  return {
    ok: true,
    ai: present(env['ANTHROPIC_API_KEY']),
    auth: present(env['NEXT_PUBLIC_SUPABASE_URL']) && present(env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']),
    service: env['K_SERVICE'] ?? null,
    revision: env['K_REVISION'] ?? null,
  };
}
