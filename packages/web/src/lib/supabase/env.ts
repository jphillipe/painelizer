/**
 * Chaves do Supabase (S22.0), lidas do ambiente. Sem elas o app roda sem login (desenvolvimento, testes, CLI);
 * em produção sem elas, `/app` é bloqueado (lib/auth/routes.ts). Puro: recebe o ambiente, para testar.
 * A chave publicável é pública por desenho (vai ao browser); a *secret* nunca entra no app.
 */

export interface SupabaseEnv {
  url: string;
  key: string;
}

export const SUPABASE_URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL';
export const SUPABASE_KEY_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
/** Nome antigo da chave pública (projetos criados antes das chaves `sb_publishable_…`). */
export const SUPABASE_LEGACY_KEY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';

export function supabaseEnv(env: Record<string, string | undefined> = process.env): SupabaseEnv | undefined {
  const url = (env[SUPABASE_URL_VAR] ?? '').trim();
  const key = (env[SUPABASE_KEY_VAR] ?? env[SUPABASE_LEGACY_KEY_VAR] ?? '').trim();
  if (url === '' || key === '') return undefined;
  return { url, key };
}

export function hasSupabase(env: Record<string, string | undefined> = process.env): boolean {
  return supabaseEnv(env) !== undefined;
}
