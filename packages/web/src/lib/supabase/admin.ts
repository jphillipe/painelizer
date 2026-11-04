import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

/**
 * A chave *secret* do Supabase (S32), isolada aqui: só a action de convite (`app/app/account/_actions/invite-member.ts`)
 * importa este arquivo, e só para `inviteUserByEmail` — a única coisa que a chave publicável não faz. Todo o resto
 * do app continua com a sessão do usuário e a RLS. Sem a variável, convidar conta nova fica desligado (adicionar
 * quem já tem conta funciona sem ela, pela função `add_team_member`).
 *
 * `SUPABASE_SECRET_KEY` (`sb_secret_…`, Settings › API Keys › Secret keys); `SUPABASE_SERVICE_ROLE_KEY` é o nome
 * antigo (JWT `service_role`). Nunca `NEXT_PUBLIC_`: não pode ir ao navegador.
 */

export const SUPABASE_SECRET_VAR = 'SUPABASE_SECRET_KEY';
export const SUPABASE_LEGACY_SECRET_VAR = 'SUPABASE_SERVICE_ROLE_KEY';

/** O que o convite usa do `auth.admin` (estruturalmente compatível com o cliente real). */
export interface AdminInvites {
  inviteUserByEmail(email: string, options: { redirectTo: string; data?: Record<string, unknown> }): Promise<{ data: { user: { id: string } | null }; error: { message: string; code?: string | undefined; status?: number | undefined } | null }>;
}

export function secretKey(env: Record<string, string | undefined> = process.env): string | undefined {
  const key = (env[SUPABASE_SECRET_VAR] ?? env[SUPABASE_LEGACY_SECRET_VAR] ?? '').trim();
  return key === '' ? undefined : key;
}

/** `undefined` sem URL do Supabase ou sem a chave secret. Um cliente por chamada, sem sessão gravada. */
export function supabaseAdminInvites(env: Record<string, string | undefined> = process.env): AdminInvites | undefined {
  const base = supabaseEnv(env);
  const key = secretKey(env);
  if (base === undefined || key === undefined) return undefined;
  const client = createClient(base.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { inviteUserByEmail: (email, options) => client.auth.admin.inviteUserByEmail(email, options) };
}
