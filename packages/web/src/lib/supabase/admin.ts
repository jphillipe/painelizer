import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database, TeamInviteRow, TeamMemberInsert } from '@/types/database';
import { supabaseEnv } from './env';
import { teamError } from './team-table';

/**
 * A chave *secret* do Supabase (S32; S41 para gerir contas), isolada aqui: só as actions de conta
 * (`app/app/account/_actions/*`) e a de aceitar convite (`app/invite/[token]/_actions/accept-invite.ts`) importam
 * este arquivo. Ele faz o que a chave publicável não faz: criar a conta de quem aceita o convite, gerar link de nova
 * senha, desativar (ban) e apagar contas, e ler/gravar o que a RLS esconde do cliente (o convite pelo hash, as
 * outras equipes de uma conta, `team_members.disabled_at`). Quem chama confere antes, pela sessão e pela RLS, que
 * a pessoa logada é admin do time e que o alvo é do time (`services/team.service.ts`).
 *
 * `SUPABASE_SECRET_KEY` (`sb_secret_…`, Settings › API Keys › Secret keys); `SUPABASE_SERVICE_ROLE_KEY` é o nome
 * antigo (JWT `service_role`). Nunca `NEXT_PUBLIC_`: não pode ir ao navegador. Sem a variável, convite por link,
 * link de senha, desativar e apagar ficam desligados (adicionar quem já tem conta, trocar papel e nome, não).
 */

export const SUPABASE_SECRET_VAR = 'SUPABASE_SECRET_KEY';
export const SUPABASE_LEGACY_SECRET_VAR = 'SUPABASE_SERVICE_ROLE_KEY';

export interface AdminError {
  message: string;
  code?: string | undefined;
  status?: number | undefined;
}

/** O que os services usam com a chave secret (os testes passam um objeto em memória). */
export interface AdminApi {
  /** Conta nova já confirmada (quem aceita o convite escolhe a senha na hora). */
  createUser(input: { email: string; password: string; name: string | null }): Promise<{ userId: string } | { error: AdminError }>;
  deleteUser(userId: string): Promise<AdminError | null>;
  /** Ban sem prazo (desativar) ou fim do ban (reativar). */
  setBanned(userId: string, banned: boolean): Promise<AdminError | null>;
  /** `hashed_token` de um link de recuperação (não manda e-mail). */
  recoveryTokenHash(email: string): Promise<{ tokenHash: string } | { error: AdminError }>;
  /** Os times de uma conta, sem RLS. */
  teamsOf(userId: string): Promise<string[]>;
  setDisabledAt(teamId: string, userId: string, at: string | null): Promise<void>;
  /** O convite pelo hash do token, em qualquer estado. */
  findInvite(tokenHash: string): Promise<TeamInviteRow | undefined>;
  /** Marca como aceito se ainda está pendente e no prazo; `undefined` se não estava (corrida ou link velho). */
  claimInvite(tokenHash: string, now: string): Promise<TeamInviteRow | undefined>;
  /** Desfaz o `claimInvite` (a conta não pôde ser criada). */
  releaseInvite(id: string): Promise<void>;
  completeInvite(id: string, userId: string): Promise<void>;
  addMember(row: TeamMemberInsert): Promise<void>;
  teamName(teamId: string): Promise<string | undefined>;
}

export function secretKey(env: Record<string, string | undefined> = process.env): string | undefined {
  const key = (env[SUPABASE_SECRET_VAR] ?? env[SUPABASE_LEGACY_SECRET_VAR] ?? '').trim();
  return key === '' ? undefined : key;
}

/** Ban "para sempre" do Supabase Auth (100 anos); `none` tira. */
export const BAN_FOREVER = '876000h';

/** `undefined` sem URL do Supabase ou sem a chave secret. Um cliente por chamada, sem sessão gravada. */
export function supabaseAdmin(env: Record<string, string | undefined> = process.env): AdminApi | undefined {
  const base = supabaseEnv(env);
  const key = secretKey(env);
  if (base === undefined || key === undefined) return undefined;
  const client = createClient<Database>(base.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    async createUser({ email, password, name }) {
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: name === null ? {} : { name } });
      if (error !== null) return { error };
      if (data.user === null) return { error: { message: 'no user returned' } };
      return { userId: data.user.id };
    },
    async deleteUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId);
      return error;
    },
    async setBanned(userId, banned) {
      const { error } = await client.auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_FOREVER : 'none' });
      return error;
    },
    async recoveryTokenHash(email) {
      const { data, error } = await client.auth.admin.generateLink({ type: 'recovery', email });
      if (error !== null) return { error };
      const tokenHash = data.properties?.hashed_token;
      return tokenHash === undefined || tokenHash === '' ? { error: { message: 'no token returned' } } : { tokenHash };
    },
    async teamsOf(userId) {
      const { data, error } = await client.from('team_members').select('team_id').eq('user_id', userId);
      if (error !== null) throw teamError(error);
      return (data ?? []).map((r) => r.team_id);
    },
    async setDisabledAt(teamId, userId, at) {
      const { error } = await client.from('team_members').update({ disabled_at: at }).eq('team_id', teamId).eq('user_id', userId);
      if (error !== null) throw teamError(error);
    },
    async findInvite(tokenHash) {
      const { data, error } = await client.from('team_invites').select('*').eq('token_hash', tokenHash).maybeSingle();
      if (error !== null) throw teamError(error);
      return data ?? undefined;
    },
    async claimInvite(tokenHash, now) {
      const { data, error } = await client
        .from('team_invites')
        .update({ accepted_at: now })
        .eq('token_hash', tokenHash)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', now)
        .select('*');
      if (error !== null) throw teamError(error);
      return data?.[0];
    },
    async releaseInvite(id) {
      const { error } = await client.from('team_invites').update({ accepted_at: null, accepted_by: null }).eq('id', id);
      if (error !== null) throw teamError(error);
    },
    async completeInvite(id, userId) {
      const { error } = await client.from('team_invites').update({ accepted_by: userId }).eq('id', id);
      if (error !== null) throw teamError(error);
    },
    async addMember(row) {
      const { error } = await client.from('team_members').insert(row);
      if (error !== null) throw teamError(error);
    },
    async teamName(teamId) {
      const { data, error } = await client.from('teams').select('name').eq('id', teamId).maybeSingle();
      if (error !== null) throw teamError(error);
      return data?.name ?? undefined;
    },
  };
}
