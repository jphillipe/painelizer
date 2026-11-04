/**
 * As tabelas `teams`/`team_members` (S32) por uma interface estreita, como `ProjectsTable`: o service fala com isto
 * e os testes a falsificam com arrays. A RLS faz a autorização (membro lê, admin muda); aqui só a sintaxe do
 * cliente do Supabase e a tradução dos erros que a tela precisa distinguir.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AddTeamMemberResult, Database, TeamMemberRow, TeamRole } from '@/types/database';

export interface Membership {
  teamId: string;
  teamName: string;
  role: TeamRole;
}

export interface TeamTable {
  /** Os times de uma pessoa, do mais antigo para o mais novo (o primeiro é o do app, como `private.default_team_id`). */
  memberships(userId: string): Promise<Membership[]>;
  members(teamId: string): Promise<TeamMemberRow[]>;
  /** `public.add_team_member`: acha a conta pelo e-mail; não convida. */
  addMember(teamId: string, email: string, role: TeamRole): Promise<AddTeamMemberResult>;
  /** `false` se nenhuma linha mudou (não é admin, ou a pessoa não está no time). */
  setRole(teamId: string, userId: string, role: TeamRole): Promise<boolean>;
  remove(teamId: string, userId: string): Promise<boolean>;
}

export type TeamTableErrorCode = 'LAST_ADMIN' | 'MISSING' | 'DB_ERROR';

export class TeamTableError extends Error {
  readonly code: TeamTableErrorCode;
  constructor(message: string, code: TeamTableErrorCode = 'DB_ERROR') {
    super(message);
    this.name = 'TeamTableError';
    this.code = code;
  }
}

/**
 * Erro do PostgREST → código: o trigger do último admin (`LAST_ADMIN: …`) e tabela/função que não existe (migração
 * da S32 não aplicada: `PGRST205`/`PGRST202` no PostgREST, `42P01`/`42883` no Postgres).
 */
export function teamError(error: { code?: string; message: string }): TeamTableError {
  if (/LAST_ADMIN/.test(error.message)) return new TeamTableError(error.message, 'LAST_ADMIN');
  if (error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01' || error.code === '42883') return new TeamTableError(error.message, 'MISSING');
  return new TeamTableError(error.message);
}

export function supabaseTeamTable(client: SupabaseClient<Database>): TeamTable {
  return {
    async memberships(userId) {
      const { data, error } = await client.from('team_members').select('team_id, role, created_at').eq('user_id', userId).order('created_at', { ascending: true });
      if (error !== null) throw teamError(error);
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const { data: teams, error: teamsError } = await client
        .from('teams')
        .select('id, name')
        .in(
          'id',
          rows.map((r) => r.team_id),
        );
      if (teamsError !== null) throw teamError(teamsError);
      const names = new Map((teams ?? []).map((t) => [t.id, t.name]));
      return rows.map((r) => ({ teamId: r.team_id, teamName: names.get(r.team_id) ?? 'Team', role: r.role }));
    },
    async members(teamId) {
      const { data, error } = await client.from('team_members').select('*').eq('team_id', teamId).order('created_at', { ascending: true });
      if (error !== null) throw teamError(error);
      return data ?? [];
    },
    async addMember(teamId, email, role) {
      const { data, error } = await client.rpc('add_team_member', { team: teamId, member_email: email, member_role: role });
      if (error !== null) throw teamError(error);
      return data;
    },
    async setRole(teamId, userId, role) {
      const { data, error } = await client.from('team_members').update({ role }).eq('team_id', teamId).eq('user_id', userId).select('user_id');
      if (error !== null) throw teamError(error);
      return (data?.length ?? 0) > 0;
    },
    async remove(teamId, userId) {
      const { data, error } = await client.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId).select('user_id');
      if (error !== null) throw teamError(error);
      return (data?.length ?? 0) > 0;
    },
  };
}
