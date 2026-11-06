/**
 * Time, papéis e contas (S32; S41). Cada pessoa está num time (`team_members`), como `admin` ou `editor`; os projetos
 * são do time (RLS em `supabase/migrations/20261104000300_projects_team.sql`). Este service lê o time de quem está
 * logado e, para admins:
 *   - adiciona quem já tem conta (`add_team_member`) ou gera um **convite por link** para quem não tem (S41: o link
 *     `<origem>/invite/<token>` aparece uma vez, o banco guarda só o hash; quem abre escolhe a senha e entra);
 *   - troca papel e nome, tira do time;
 *   - com a chave secret (`lib/supabase/admin.ts`): gera link de nova senha, desativa/reativa e apaga a conta.
 * Autorização de verdade é a RLS; o que usa a chave secret passa antes pela guarda `manageable` (quem chama é admin
 * ativo do time pela própria sessão, o alvo é do time e só dele, e não é quem chama).
 *
 * Um time por pessoa no app: o primeiro em que entrou (o mesmo que o default de `projects.team_id`). Sem Supabase,
 * `unconfigured`; sem as migrações, `missing` (a tela diz para aplicá-las).
 */

import 'server-only';

import { recoveryLink } from '@/lib/auth/routes';
import { errorMessage } from '@/lib/errors';
import { hashInviteToken, inviteUrl, isInviteToken, newInviteToken } from '@/lib/invite-token';
import type { AdminApi } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseTeamTable, TeamTableError, type TeamTable } from '@/lib/supabase/team-table';
import type { TeamInviteRow, TeamMemberRow, TeamRole } from '@/types/database';
import type { SessionUser } from './auth.service';

export interface TeamDeps {
  table: () => Promise<TeamTable | undefined>;
  /** Chave secret (só as actions de conta passam); sem ela, convite por link e gestão de contas ficam desligados. */
  admin?: AdminApi | undefined;
  now?: () => Date;
  newToken?: () => string;
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
  name: string | undefined;
  role: TeamRole;
  joinedAt: string;
  disabled: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  name: string | undefined;
  role: TeamRole;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  invitedBy: string | undefined;
}

export interface MyTeam {
  id: string;
  name: string;
  role: TeamRole;
  /** O nome de quem está logado neste time. */
  myName: string | undefined;
  members: TeamMember[];
  /** Só para admins (a RLS não deixa editor ler); vazio para editor. */
  invites: PendingInvite[];
}

type Failure<R extends string> = { ok: false; reason: R; message: string };

export type MyTeamResult = { ok: true; team: MyTeam | undefined } | Failure<'unconfigured' | 'signed_out' | 'missing' | 'failed'>;

type Common = 'unconfigured' | 'signed_out' | 'no_team' | 'forbidden' | 'missing' | 'failed';

export type InviteResult =
  | { ok: true; status: 'added' | 'already_member'; email: string }
  | { ok: true; status: 'invite_link'; email: string; url: string; expiresAt: string }
  | Failure<Common | 'needs_secret_key' | 'invalid'>;

export type InviteLinkResult = { ok: true; email: string; url: string; expiresAt: string } | Failure<Common | 'needs_secret_key' | 'not_found'>;

export type MemberChangeResult = { ok: true } | Failure<Common | 'not_found' | 'last_admin' | 'invalid' | 'self' | 'other_team' | 'needs_secret_key'>;

export type ResetLinkResult = { ok: true; email: string; url: string } | Failure<Common | 'not_found' | 'self' | 'other_team' | 'needs_secret_key' | 'disabled'>;

const UNCONFIGURED = 'Accounts and teams are not set up on this server.';
const MISSING = 'The team tables are not up to date in the database. Apply the migrations (supabase/README.md, “S32 — aplicar” and “S41 — aplicar”).';
const NO_TEAM = 'Your account is not in a team yet. Ask a team admin to add you.';
const FORBIDDEN = 'Only a team admin can do this.';
const LAST_ADMIN = 'A team needs at least one admin. Make someone else an admin first.';
const NEEDS_SECRET_KEY = 'This server can’t manage accounts: SUPABASE_SECRET_KEY is not set (docs/12-hospedagem-cloud-run.md, “Chave secret do Supabase”).';
const NOT_IN_TEAM = 'This person is not in the team any more.';

function caught<R extends string>(e: unknown, what: string): Failure<R | 'missing' | 'failed' | 'last_admin'> {
  if (e instanceof TeamTableError && e.code === 'MISSING') return { ok: false, reason: 'missing', message: MISSING };
  if (e instanceof TeamTableError && e.code === 'LAST_ADMIN') return { ok: false, reason: 'last_admin', message: LAST_ADMIN };
  return { ok: false, reason: 'failed', message: `Could not ${what}: ${errorMessage(e)}` };
}

/** E-mail como a conta do Supabase guarda (minúsculas, sem espaços). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const NAME_MAX = 80;

/** Nome de exibição: espaços colapsados; vazio é `null`; mais de 80 caracteres é `undefined` (inválido). */
export function cleanName(name: string | null | undefined): string | null | undefined {
  const cleaned = (name ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned === '') return null;
  return cleaned.length > NAME_MAX ? undefined : cleaned;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function memberOf(m: TeamMemberRow): TeamMember {
  return { userId: m.user_id, email: m.email, name: m.name ?? undefined, role: m.role, joinedAt: m.created_at, disabled: Boolean(m.disabled_at) };
}

function inviteOf(row: TeamInviteRow, now: Date): PendingInvite {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired: Date.parse(row.expires_at) <= now.getTime(),
    invitedBy: row.created_by_email ?? undefined,
  };
}

const nowOf = (deps: Pick<TeamDeps, 'now'>) => (deps.now ?? (() => new Date()))();

/** O time de quem está logado com os membros (e, para admin, os convites pendentes); `team: undefined` sem time. */
export async function myTeam(user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MyTeamResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to see your team.' };
  try {
    const first = (await table.memberships(user.id))[0];
    if (first === undefined) return { ok: true, team: undefined };
    const rows = await table.members(first.teamId);
    const invites = first.role === 'admin' ? await table.pendingInvites(first.teamId) : [];
    const now = nowOf(deps);
    return {
      ok: true,
      team: {
        id: first.teamId,
        name: first.teamName,
        role: first.role,
        myName: rows.find((m) => m.user_id === user.id)?.name ?? undefined,
        members: rows.map(memberOf),
        invites: invites.map((i) => inviteOf(i, now)),
      },
    };
  } catch (e) {
    return caught(e, 'load your team') as MyTeamResult;
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

/** O time em que quem está logado é admin (ativo: a RLS esconde o time de quem foi desativado), ou a falha. */
async function adminTeam(table: TeamTable, user: SessionUser): Promise<{ ok: true; teamId: string } | Failure<'no_team' | 'forbidden'>> {
  const first = (await table.memberships(user.id))[0];
  if (first === undefined) return { ok: false, reason: 'no_team', message: NO_TEAM };
  if (first.role !== 'admin') return { ok: false, reason: 'forbidden', message: FORBIDDEN };
  return { ok: true, teamId: first.teamId };
}

/** Prepara a tabela, o usuário e o time de admin; devolve a falha comum. */
async function asAdmin(user: SessionUser | undefined, deps: TeamDeps, signedOut: string): Promise<{ ok: true; table: TeamTable; user: SessionUser; teamId: string } | Failure<'unconfigured' | 'signed_out' | 'no_team' | 'forbidden'>> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: signedOut };
  const team = await adminTeam(table, user);
  if (!team.ok) return team;
  return { ok: true, table, user, teamId: team.teamId };
}

async function newLink(table: TeamTable, deps: TeamDeps, input: { teamId: string; email: string; name: string | null; role: TeamRole; origin: string }, user: SessionUser): Promise<{ url: string; expiresAt: string }> {
  const token = (deps.newToken ?? newInviteToken)();
  await table.revokePendingFor(input.teamId, input.email);
  const row = await table.createInvite({
    team_id: input.teamId,
    email: input.email,
    name: input.name,
    role: input.role,
    token_hash: hashInviteToken(token),
    created_by: user.id,
    created_by_email: user.email === '' ? null : user.email,
  });
  return { url: inviteUrl(input.origin, token), expiresAt: row.expires_at };
}

/**
 * Admin põe alguém no time. Conta que já existe entra direto (`add_team_member`). E-mail sem conta (S41): um convite
 * por link, com validade de 7 dias, que o admin copia e manda — o e-mail embutido do Supabase não chega a quem não é
 * da organização. O convite anterior do mesmo e-mail é revogado. Precisa da chave secret (é ela que cria a conta
 * quando a pessoa aceita), senão o link não serviria.
 */
export async function inviteMember(input: { email: string; name?: string | undefined; role: TeamRole; origin: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<InviteResult> {
  const email = normalizeEmail(input.email);
  const name = cleanName(input.name);
  try {
    const ctx = await asAdmin(user, deps, 'Sign in to invite people.');
    if (!ctx.ok) return ctx;
    if (!EMAIL.test(email)) return { ok: false, reason: 'invalid', message: 'Enter a valid email address.' };
    if (name === undefined) return { ok: false, reason: 'invalid', message: `Use at most ${NAME_MAX} characters for the name.` };
    const added = await ctx.table.addMember(ctx.teamId, email, input.role);
    if (added === 'forbidden') return { ok: false, reason: 'forbidden', message: FORBIDDEN };
    if (added === 'added') {
      if (name !== null) {
        const row = (await ctx.table.members(ctx.teamId)).find((m) => m.email.toLowerCase() === email);
        if (row !== undefined && row.name === null) await ctx.table.setName(ctx.teamId, row.user_id, name);
      }
      return { ok: true, status: 'added', email };
    }
    if (added === 'already_member') return { ok: true, status: 'already_member', email };
    if (deps.admin === undefined) return { ok: false, reason: 'needs_secret_key', message: `There is no account for ${email} yet. ${NEEDS_SECRET_KEY}` };
    const link = await newLink(ctx.table, deps, { teamId: ctx.teamId, email, name, role: input.role, origin: input.origin }, ctx.user);
    return { ok: true, status: 'invite_link', email, ...link };
  } catch (e) {
    return caught(e, 'invite this person') as InviteResult;
  }
}

/** Link novo para um convite pendente (o antigo deixa de valer). O link só aparece aqui, como no convite. */
export async function renewInvite(input: { id: string; origin: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<InviteLinkResult> {
  try {
    const ctx = await asAdmin(user, deps, 'Sign in to manage invitations.');
    if (!ctx.ok) return ctx;
    if (deps.admin === undefined) return { ok: false, reason: 'needs_secret_key', message: NEEDS_SECRET_KEY };
    const invite = (await ctx.table.pendingInvites(ctx.teamId)).find((i) => i.id === input.id);
    if (invite === undefined) return { ok: false, reason: 'not_found', message: 'This invitation was already used or withdrawn.' };
    const link = await newLink(ctx.table, deps, { teamId: ctx.teamId, email: invite.email, name: invite.name, role: invite.role, origin: input.origin }, ctx.user);
    return { ok: true, email: invite.email, ...link };
  } catch (e) {
    return caught(e, 'make a new link') as InviteLinkResult;
  }
}

export async function revokeInvite(input: { id: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  try {
    const ctx = await asAdmin(user, deps, 'Sign in to manage invitations.');
    if (!ctx.ok) return ctx;
    if (!(await ctx.table.revokeInvite(ctx.teamId, input.id))) return { ok: false, reason: 'not_found', message: 'This invitation was already used or withdrawn.' };
    return { ok: true };
  } catch (e) {
    return caught(e, 'withdraw the invitation') as MemberChangeResult;
  }
}

export async function setMemberRole(input: { userId: string; role: TeamRole }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  return changeMember(user, deps, 'change the role', (table, teamId) => table.setRole(teamId, input.userId, input.role));
}

/** Tira do time (S32). A conta continua existindo no Supabase; sem time, a pessoa não vê nem grava projetos. */
export async function removeMember(input: { userId: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  return changeMember(user, deps, 'remove this person', (table, teamId) => table.remove(teamId, input.userId));
}

/** S41: admin muda o nome de alguém do time (inclusive o próprio). Vazio apaga o nome. */
export async function setMemberName(input: { userId: string; name: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  const name = cleanName(input.name);
  if (name === undefined) return { ok: false, reason: 'invalid', message: `Use at most ${NAME_MAX} characters for the name.` };
  return changeMember(user, deps, 'change the name', (table, teamId) => table.setName(teamId, input.userId, name));
}

/** S41: o próprio nome (qualquer membro). */
export async function setMyName(input: { name: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  const name = cleanName(input.name);
  if (name === undefined) return { ok: false, reason: 'invalid', message: `Use at most ${NAME_MAX} characters for the name.` };
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to change your name.' };
  try {
    return (await table.setMyName(name)) ? { ok: true } : { ok: false, reason: 'no_team', message: NO_TEAM };
  } catch (e) {
    return caught(e, 'change your name') as MemberChangeResult;
  }
}

async function changeMember(user: SessionUser | undefined, deps: TeamDeps, what: string, run: (table: TeamTable, teamId: string) => Promise<boolean>): Promise<MemberChangeResult> {
  try {
    const ctx = await asAdmin(user, deps, 'Sign in to manage the team.');
    if (!ctx.ok) return ctx;
    if (!(await run(ctx.table, ctx.teamId))) return { ok: false, reason: 'not_found', message: NOT_IN_TEAM };
    return { ok: true };
  } catch (e) {
    return caught(e, what) as MemberChangeResult;
  }
}

type Manageable = { ok: true; admin: AdminApi; teamId: string; target: TeamMemberRow } | Failure<Common | 'needs_secret_key' | 'not_found' | 'self' | 'other_team'>;

/**
 * Guarda do que usa a chave secret sobre a conta de outra pessoa: há chave; quem chama é admin ativo do time (pela
 * sessão — a RLS esconde o time de quem foi desativado); o alvo está na lista do time; não é quem chama; e a conta
 * do alvo não está em outro time (a chave age sobre a conta inteira, não sobre o time).
 */
async function manageable(userId: string, user: SessionUser | undefined, deps: TeamDeps): Promise<Manageable> {
  const ctx = await asAdmin(user, deps, 'Sign in to manage the team.');
  if (!ctx.ok) return ctx;
  if (deps.admin === undefined) return { ok: false, reason: 'needs_secret_key', message: NEEDS_SECRET_KEY };
  if (userId === ctx.user.id) return { ok: false, reason: 'self', message: 'You can’t do this to your own account. Ask another admin.' };
  const target = (await ctx.table.members(ctx.teamId)).find((m) => m.user_id === userId);
  if (target === undefined) return { ok: false, reason: 'not_found', message: NOT_IN_TEAM };
  const teams = await deps.admin.teamsOf(userId);
  if (teams.some((t) => t !== ctx.teamId)) return { ok: false, reason: 'other_team', message: `${target.email} is also in another team, so only the Supabase dashboard can change this account.` };
  return { ok: true, admin: deps.admin, teamId: ctx.teamId, target };
}

/**
 * S41: link de nova senha para alguém do time, para o admin mandar (sem e-mail). Abre a sessão da pessoa em
 * `/app/account?reset=1`; vale por cerca de 1 hora (expiração do OTP no Supabase Auth).
 */
export async function memberResetLink(input: { userId: string; origin: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<ResetLinkResult> {
  try {
    const m = await manageable(input.userId, user, deps);
    if (!m.ok) return m;
    if (m.target.disabled_at) return { ok: false, reason: 'disabled', message: 'This account is disabled. Enable it first.' };
    const r = await m.admin.recoveryTokenHash(m.target.email);
    if ('error' in r) return { ok: false, reason: 'failed', message: `Could not make the link: ${r.error.message}` };
    return { ok: true, email: m.target.email, url: recoveryLink(input.origin, r.tokenHash) };
  } catch (e) {
    return caught(e, 'make the link') as ResetLinkResult;
  }
}

/**
 * S41: desativa (ban no Supabase Auth + `disabled_at`, que tira a pessoa da RLS na hora) ou reativa. Nada é apagado;
 * reativar devolve o acesso como estava.
 */
export async function setMemberDisabled(input: { userId: string; disabled: boolean }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  try {
    const m = await manageable(input.userId, user, deps);
    if (!m.ok) return m;
    const isDisabled = Boolean(m.target.disabled_at);
    if (isDisabled === input.disabled) return { ok: true };
    if (input.disabled) {
      await m.admin.setDisabledAt(m.teamId, input.userId, nowOf(deps).toISOString());
      const error = await m.admin.setBanned(input.userId, true);
      if (error !== null) {
        await m.admin.setDisabledAt(m.teamId, input.userId, null);
        return { ok: false, reason: 'failed', message: `Could not disable the account: ${error.message}` };
      }
    } else {
      const error = await m.admin.setBanned(input.userId, false);
      if (error !== null) return { ok: false, reason: 'failed', message: `Could not enable the account: ${error.message}` };
      await m.admin.setDisabledAt(m.teamId, input.userId, null);
    }
    return { ok: true };
  } catch (e) {
    return caught(e, input.disabled ? 'disable the account' : 'enable the account') as MemberChangeResult;
  }
}

/** S41: apaga a conta de vez. Os projetos ficam no time (autor e "editado por" viram vazio). */
export async function deleteMemberAccount(input: { userId: string }, user: SessionUser | undefined, deps: TeamDeps = defaultDeps): Promise<MemberChangeResult> {
  try {
    const m = await manageable(input.userId, user, deps);
    if (!m.ok) return m;
    const error = await m.admin.deleteUser(input.userId);
    if (error !== null) return { ok: false, reason: 'failed', message: `Could not delete the account: ${error.message}` };
    return { ok: true };
  } catch (e) {
    return caught(e, 'delete the account') as MemberChangeResult;
  }
}

// ——— Aceitar o convite (página pública `/invite/<token>`; só a chave secret, sem sessão) ———

export type InviteDeps = Pick<TeamDeps, 'admin' | 'now'>;

type ClosedReason = 'invalid' | 'used' | 'revoked' | 'expired';

export type InvitePreview =
  | { state: 'open'; email: string; name: string | undefined; role: TeamRole; teamName: string; expiresAt: string }
  | { state: ClosedReason | 'off' | 'missing' | 'failed'; message: string };

const CLOSED: Record<ClosedReason, string> = {
  invalid: 'This invitation link is not valid. Check that you copied all of it, or ask your admin for a new one.',
  used: 'This invitation was already used. Sign in with your email and password.',
  revoked: 'This invitation was withdrawn. Ask your admin for a new one.',
  expired: 'This invitation has expired. Ask your admin for a new one.',
};

const INVITES_OFF = 'Invitations are not set up on this server. Ask your admin to add your account another way.';

function closedState(row: TeamInviteRow | undefined, now: Date): ClosedReason | undefined {
  if (row === undefined) return 'invalid';
  if (row.accepted_at !== null) return 'used';
  if (row.revoked_at !== null) return 'revoked';
  if (Date.parse(row.expires_at) <= now.getTime()) return 'expired';
  return undefined;
}

export async function invitePreview(token: string, deps: InviteDeps): Promise<InvitePreview> {
  if (!isInviteToken(token)) return { state: 'invalid', message: CLOSED.invalid };
  if (deps.admin === undefined) return { state: 'off', message: INVITES_OFF };
  try {
    const row = await deps.admin.findInvite(hashInviteToken(token));
    const closed = closedState(row, nowOf(deps));
    if (closed !== undefined || row === undefined) return { state: closed ?? 'invalid', message: CLOSED[closed ?? 'invalid'] };
    return { state: 'open', email: row.email, name: row.name ?? undefined, role: row.role, teamName: (await deps.admin.teamName(row.team_id)) ?? 'the team', expiresAt: row.expires_at };
  } catch (e) {
    if (e instanceof TeamTableError && e.code === 'MISSING') return { state: 'missing', message: MISSING };
    return { state: 'failed', message: `Could not open the invitation: ${errorMessage(e)}` };
  }
}

export type AcceptResult = { ok: true; email: string } | Failure<ClosedReason | 'off' | 'exists' | 'weak_password' | 'missing' | 'failed'>;

export const INVITE_PASSWORD_MIN = 8;

/**
 * Aceita o convite: marca como aceito (atômico — dois cliques não criam duas contas), cria a conta já confirmada
 * com a senha escolhida e põe no time com o papel do convite. Se a conta não sai, o convite volta a valer; se a
 * entrada no time falha, a conta criada é apagada.
 */
export async function acceptInvite(token: string, input: { name: string | undefined; password: string }, deps: InviteDeps): Promise<AcceptResult> {
  if (!isInviteToken(token)) return { ok: false, reason: 'invalid', message: CLOSED.invalid };
  const admin = deps.admin;
  if (admin === undefined) return { ok: false, reason: 'off', message: INVITES_OFF };
  if (input.password.length < INVITE_PASSWORD_MIN || input.password.length > 72) return { ok: false, reason: 'weak_password', message: `Use ${INVITE_PASSWORD_MIN} to 72 characters for the password.` };
  const name = cleanName(input.name);
  if (name === undefined) return { ok: false, reason: 'failed', message: `Use at most ${NAME_MAX} characters for the name.` };
  const hash = hashInviteToken(token);
  const now = nowOf(deps);
  try {
    const invite = await admin.claimInvite(hash, now.toISOString());
    if (invite === undefined) {
      const closed = closedState(await admin.findInvite(hash), now) ?? 'used';
      return { ok: false, reason: closed, message: CLOSED[closed] };
    }
    const created = await admin.createUser({ email: invite.email, password: input.password, name: name ?? invite.name });
    if ('error' in created) {
      await admin.releaseInvite(invite.id);
      const code = created.error.code;
      if (code === 'email_exists' || code === 'user_already_exists') return { ok: false, reason: 'exists', message: `There is already an account for ${invite.email}. Sign in with it, and ask your admin to add it to the team.` };
      if (code === 'weak_password') return { ok: false, reason: 'weak_password', message: 'This password is too weak. Use a longer one, with letters and numbers.' };
      return { ok: false, reason: 'failed', message: `Could not create the account: ${created.error.message}` };
    }
    try {
      await admin.addMember({ team_id: invite.team_id, user_id: created.userId, email: invite.email, role: invite.role, name: name ?? invite.name, invited_by: invite.created_by });
    } catch (e) {
      await admin.deleteUser(created.userId);
      await admin.releaseInvite(invite.id);
      throw e;
    }
    try {
      await admin.completeInvite(invite.id, created.userId);
    } catch {
      /* a conta e o time já estão certos; `accepted_by` é só registro */
    }
    return { ok: true, email: invite.email };
  } catch (e) {
    return caught(e, 'accept the invitation') as AcceptResult;
  }
}
