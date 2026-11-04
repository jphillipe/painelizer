/**
 * Time e papéis (S32). Cada pessoa está num time (`team_members`), como `admin` ou `editor`; os projetos são do
 * time (RLS em `supabase/migrations/20261104000300_projects_team.sql`). Este service lê o time de quem está logado
 * e, para admins, adiciona, convida, troca papel e tira pessoas. Autorização de verdade é a RLS; aqui ficam só as
 * frases e a ordem dos passos (adicionar quem já tem conta, senão convidar por e-mail com a chave secret).
 *
 * Um time por pessoa no app: o primeiro em que entrou (o mesmo que o default de `projects.team_id`). Sem Supabase,
 * `unconfigured`; sem as migrações da S32, `missing` (a tela diz para aplicá-las).
 */

import 'server-only';

import { errorMessage } from '@/lib/errors';
import type { AdminInvites } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseTeamTable, TeamTableError, type TeamTable } from '@/lib/supabase/team-table';
import type { TeamRole } from '@/types/database';
import type { SessionUser } from './auth.service';

export interface TeamDeps {
  table: () => Promise<TeamTable | undefined>;
  /** Só a action de convite passa (chave secret); sem ela, convidar conta nova fica desligado. */
  invites?: AdminInvites | undefined;
}

export const defaultDeps: TeamDeps = {
  table: async () => {
    const client = await supabaseServer();
    return client === undefined ? undefined : supabaseTeamTable(client);
  },
};

export interface TeamMember {
  userId: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export interface MyTeam {
  id: string;
  name: string;
  role: TeamRole;
  members: TeamMember[];
}

type Failure<R extends string> = { ok: false; reason: R; message: string };

export type MyTeamResult = { ok: true; team: MyTeam | undefined } | Failure<'unconfigured' | 'signed_out' | 'missing' | 'failed'>;

export type InviteStatus = 'added' | 'invited' | 'already_member';

export type InviteResult = { ok: true; status: InviteStatus; email: string } | Failure<'unconfigured' | 'signed_out' | 'no_team' | 'forbidden' | 'invites_off' | 'invalid' | 'missing' | 'failed'>;

export type MemberChangeResult = { ok: true } | Failure<'unconfigured' | 'signed_out' | 'no_team' | 'forbidden' | 'not_found' | 'last_admin' | 'missing' | 'failed'>;

const UNCONFIGURED = 'Accounts and teams are not set up on this server.';
const MISSING = 'The team tables are not in the database yet. Apply the S32 migrations (supabase/README.md, “S32 — aplicar”).';
const NO_TEAM = 'Your account is not in a team yet. Ask a team admin to add you.';
const FORBIDDEN = 'Only a team admin can do this.';
const LAST_ADMIN = 'A team needs at least one admin. Make someone else an admin first.';

function caught<R extends string>(e: unknown, what: string): Failure<R | 'missing' | 'failed'> {
  if (e instanceof TeamTableError && e.code === 'MISSING') return { ok: false, reason: 'missing', message: MISSING };
  return { ok: false, reason: 'failed', message: `Could not ${what}: ${errorMessage(e)}` };
}

/** E-mail como a conta do Supabase guarda (minúsculas, sem espaços). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** O time de quem está logado com os membros; `team: undefined` quando a pessoa não está em nenhum. */
export async function myTeam(user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MyTeamResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to see your team.' };
  try {
    const first = (await table.memberships(user.id))[0];
    if (first === undefined) return { ok: true, team: undefined };
    const members = await table.members(first.teamId);
    return {
      ok: true,
      team: {
        id: first.teamId,
        name: first.teamName,
        role: first.role,
        members: members.map((m) => ({ userId: m.user_id, email: m.email, role: m.role, joinedAt: m.created_at })),
      },
    };
  } catch (e) {
    return caught(e, 'load your team');
  }
}

/** O papel de quem está logado (para a tela esconder o que só admin faz). `undefined` sem time ou sem Supabase. */
export async function myRole(user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<TeamRole | undefined> {
  if (user === undefined) return undefined;
  try {
    const table = await deps.table();
    return table === undefined ? undefined : (await table.memberships(user.id))[0]?.role;
  } catch {
    return undefined;
  }
}

/** O time em que quem está logado é admin, ou a falha a devolver. */
async function adminTeam(table: TeamTable, user: SessionUser): Promise<{ ok: true; teamId: string } | Failure<'no_team' | 'forbidden'>> {
  const first = (await table.memberships(user.id))[0];
  if (first === undefined) return { ok: false, reason: 'no_team', message: NO_TEAM };
  if (first.role !== 'admin') return { ok: false, reason: 'forbidden', message: FORBIDDEN };
  return { ok: true, teamId: first.teamId };
}

/**
 * Admin põe alguém no time (S32). Conta que já existe entra direto (`add_team_member`); e-mail sem conta recebe o
 * convite do Supabase Auth (`inviteUserByEmail`, chave secret só nesta chamada) e entra no time logo depois — o
 * link do e-mail leva a `/auth/confirm` e de lá a `/app/account`, onde a pessoa escolhe a senha.
 */
export async function inviteMember(input: { email: string; role: TeamRole; redirectTo: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<InviteResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to invite people.' };
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'invalid', message: 'Enter a valid email address.' };
  try {
    const team = await adminTeam(table, user);
    if (!team.ok) return team;
    const added = await table.addMember(team.teamId, email, input.role);
    if (added === 'forbidden') return { ok: false, reason: 'forbidden', message: FORBIDDEN };
    if (added === 'added' || added === 'already_member') return { ok: true, status: added, email };
    // Sem conta: convite por e-mail.
    if (deps.invites === undefined) {
      return { ok: false, reason: 'invites_off', message: `There is no account for ${email} yet, and this server can’t send invitations (SUPABASE_SECRET_KEY is not set). Create the account in Supabase and add it here again.` };
    }
    const { error } = await deps.invites.inviteUserByEmail(email, { redirectTo: input.redirectTo, data: { invited_to_team: team.teamId } });
    if (error !== null) {
      if (error.code === 'over_email_send_rate_limit') return { ok: false, reason: 'failed', message: 'Too many emails were sent. Wait a few minutes and try again.' };
      return { ok: false, reason: 'failed', message: `Could not send the invitation: ${error.message}` };
    }
    const again = await table.addMember(team.teamId, email, input.role);
    if (again !== 'added' && again !== 'already_member') return { ok: false, reason: 'failed', message: `The invitation was sent, but ${email} could not be added to the team. Add the address again once they accept.` };
    return { ok: true, status: 'invited', email };
  } catch (e) {
    return caught(e, 'invite this person');
  }
}

export async function setMemberRole(input: { userId: string; role: TeamRole }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  return changeMember(user, deps, 'change the role', (table, teamId) => table.setRole(teamId, input.userId, input.role));
}

/** Tira do time (S32). A conta continua existindo no Supabase; sem time, a pessoa não vê nem grava projetos. */
export async function removeMember(input: { userId: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  return changeMember(user, deps, 'remove this person', (table, teamId) => table.remove(teamId, input.userId));
}

async function changeMember(user: SessionUser | undefined, deps: TeamDeps, what: string, run: (table: TeamTable, teamId: string) => Promise<boolean>): Promise<MemberChangeResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to manage the team.' };
  try {
    const team = await adminTeam(table, user);
    if (!team.ok) return team;
    if (!(await run(table, team.teamId))) return { ok: false, reason: 'not_found', message: 'This person is not in the team any more.' };
    return { ok: true };
  } catch (e) {
    if (e instanceof TeamTableError && e.code === 'LAST_ADMIN') return { ok: false, reason: 'last_admin', message: LAST_ADMIN };
    return caught(e, what);
  }
}
