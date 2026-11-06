import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '@/lib/supabase/admin';
import { TeamTableError, type TeamTable } from '@/lib/supabase/team-table';
import type { TeamInviteRow, TeamMemberRow, TeamRole } from '@/types/database';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));

const { hashInviteToken } = await import('@/lib/invite-token');
const svc = await import('./team.service');
const { acceptInvite, cleanName, deleteMemberAccount, invitePreview, inviteMember, memberResetLink, myRole, myTeam, normalizeEmail, removeMember, renewInvite, revokeInvite, setMemberDisabled, setMemberName, setMemberRole, setMyName } = svc;

const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@x.com' };
const EDITOR = { id: '22222222-2222-4222-8222-222222222222', email: 'ed@x.com' };
const NOBODY = { id: '33333333-3333-4333-8333-333333333333', email: 'new@x.com' };
const ORIGIN = 'https://panelizer.run.app';
const NOW = new Date('2026-11-06T12:00:00Z');
/** Tokens do formato do app (43 caracteres base64url), um por chamada. */
const token = (n: number) => `${'t'.repeat(40)}${String(n).padStart(3, '0')}`;

const member = (team: string, u: { id: string; email: string }, role: TeamRole, extra: Partial<TeamMemberRow> = {}): TeamMemberRow => ({
  team_id: team,
  user_id: u.id,
  email: u.email,
  role,
  invited_by: null,
  created_at: '2026-11-04T00:00:00Z',
  name: null,
  disabled_at: null,
  ...extra,
});

/**
 * Time em memória com as regras do banco: só admin ativo muda, o último admin ativo fica, `add_team_member` acha conta
 * pelo e-mail, convite com hash único por pendente; e uma "chave secret" que cria/apaga/bane contas.
 */
function world() {
  const accounts = new Map<string, { id: string; password?: string; name?: string | null }>([
    [ADMIN.email, { id: ADMIN.id }],
    [EDITOR.email, { id: EDITOR.id }],
    [NOBODY.email, { id: NOBODY.id }],
  ]);
  const members: TeamMemberRow[] = [member('t1', ADMIN, 'admin'), member('t1', EDITOR, 'editor', { created_at: '2026-11-04T00:01:00Z' })];
  const invites: TeamInviteRow[] = [];
  const banned = new Set<string>();
  let caller = ADMIN.id;
  let seq = 0;
  let nextId = 0;
  const active = (m: TeamMemberRow) => m.disabled_at === null;
  const isAdmin = () => members.some((m) => m.user_id === caller && m.role === 'admin' && active(m));
  const lastAdmin = (userId: string) => members.filter((m) => m.role === 'admin' && active(m) && m.user_id !== userId).length === 0;
  const table: TeamTable = {
    async memberships(userId) {
      return members.filter((m) => m.user_id === userId && active(m)).map((m) => ({ teamId: m.team_id, teamName: 'National Lumber', role: m.role }));
    },
    async members(teamId) {
      return members.filter((m) => m.team_id === teamId);
    },
    async addMember(teamId, email, role) {
      if (!isAdmin()) return 'forbidden';
      const acc = accounts.get(email.trim().toLowerCase());
      if (acc === undefined) return 'no_account';
      if (members.some((m) => m.user_id === acc.id && m.team_id === teamId)) return 'already_member';
      members.push(member(teamId, { id: acc.id, email }, role, { invited_by: caller }));
      return 'added';
    },
    async setRole(_teamId, userId, role) {
      if (!isAdmin()) return false;
      const m = members.find((x) => x.user_id === userId);
      if (m === undefined) return false;
      if (m.role === 'admin' && role !== 'admin' && lastAdmin(userId)) throw new TeamTableError('LAST_ADMIN: a team needs at least one admin', 'LAST_ADMIN');
      m.role = role;
      return true;
    },
    async remove(_teamId, userId) {
      if (!isAdmin()) return false;
      const i = members.findIndex((x) => x.user_id === userId);
      if (i < 0) return false;
      if (members[i]!.role === 'admin' && lastAdmin(userId)) throw new TeamTableError('LAST_ADMIN: a team needs at least one admin', 'LAST_ADMIN');
      members.splice(i, 1);
      return true;
    },
    async setName(teamId, userId, name) {
      if (!isAdmin()) return false;
      const m = members.find((x) => x.user_id === userId && x.team_id === teamId);
      if (m === undefined) return false;
      m.name = name;
      return true;
    },
    async setMyName(name) {
      const mine = members.filter((m) => m.user_id === caller && active(m));
      for (const m of mine) m.name = name;
      return mine.length > 0;
    },
    async pendingInvites(teamId) {
      return isAdmin() ? invites.filter((i) => i.team_id === teamId && i.accepted_at === null && i.revoked_at === null) : [];
    },
    async revokePendingFor(teamId, email) {
      for (const i of invites) if (i.team_id === teamId && i.email === email && i.accepted_at === null && i.revoked_at === null) i.revoked_at = NOW.toISOString();
    },
    async createInvite(row) {
      if (!isAdmin()) throw new TeamTableError('new row violates row-level security policy');
      if (invites.some((i) => i.team_id === row.team_id && i.email === row.email && i.accepted_at === null && i.revoked_at === null)) throw new TeamTableError('duplicate key value violates unique constraint "team_invites_pending_idx"');
      const full: TeamInviteRow = {
        id: `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
        team_id: row.team_id,
        email: row.email,
        name: row.name ?? null,
        role: row.role ?? 'editor',
        token_hash: row.token_hash,
        created_by: row.created_by ?? null,
        created_by_email: row.created_by_email ?? null,
        created_at: NOW.toISOString(),
        expires_at: new Date(NOW.getTime() + 7 * 86_400_000).toISOString(),
        accepted_at: null,
        accepted_by: null,
        revoked_at: null,
      };
      invites.push(full);
      return full;
    },
    async revokeInvite(teamId, id) {
      if (!isAdmin()) return false;
      const i = invites.find((x) => x.id === id && x.team_id === teamId && x.accepted_at === null && x.revoked_at === null);
      if (i === undefined) return false;
      i.revoked_at = NOW.toISOString();
      return true;
    },
  };
  const admin: AdminApi = {
    async createUser({ email, password, name }) {
      if (accounts.has(email)) return { error: { message: 'A user with this email address has already been registered', code: 'email_exists', status: 422 } };
      const id = `44444444-4444-4444-8444-${String(accounts.size).padStart(12, '0')}`;
      accounts.set(email, { id, password, name });
      return { userId: id };
    },
    async deleteUser(userId) {
      for (const [email, acc] of accounts) if (acc.id === userId) accounts.delete(email);
      for (let i = members.length - 1; i >= 0; i--) if (members[i]!.user_id === userId) members.splice(i, 1);
      return null;
    },
    async setBanned(userId, ban) {
      if (ban) banned.add(userId);
      else banned.delete(userId);
      return null;
    },
    async recoveryTokenHash(email) {
      return accounts.has(email) ? { tokenHash: `pkce_${email.length}abc` } : { error: { message: 'User not found' } };
    },
    async teamsOf(userId) {
      return members.filter((m) => m.user_id === userId).map((m) => m.team_id);
    },
    async setDisabledAt(teamId, userId, at) {
      const m = members.find((x) => x.user_id === userId && x.team_id === teamId)!;
      if (at !== null && m.role === 'admin' && lastAdmin(userId)) throw new TeamTableError('LAST_ADMIN: a team needs at least one admin', 'LAST_ADMIN');
      m.disabled_at = at;
    },
    async findInvite(tokenHash) {
      return invites.find((i) => i.token_hash === tokenHash);
    },
    async claimInvite(tokenHash, now) {
      const i = invites.find((x) => x.token_hash === tokenHash && x.accepted_at === null && x.revoked_at === null && x.expires_at > now);
      if (i === undefined) return undefined;
      i.accepted_at = now;
      return { ...i };
    },
    async releaseInvite(id) {
      const i = invites.find((x) => x.id === id)!;
      i.accepted_at = null;
      i.accepted_by = null;
    },
    async completeInvite(id, userId) {
      invites.find((x) => x.id === id)!.accepted_by = userId;
    },
    async addMember(row) {
      members.push(member(row.team_id, { id: row.user_id, email: row.email }, row.role ?? 'editor', { name: row.name ?? null, invited_by: row.invited_by ?? null }));
    },
    async teamName() {
      return 'National Lumber';
    },
  };
  return {
    table,
    admin,
    members,
    invites,
    accounts,
    banned,
    as: (id: string) => {
      caller = id;
    },
    /** Deps com relógio fixo e tokens previsíveis; `withAdmin: false` = servidor sem chave secret. */
    deps: (withAdmin = true) => ({ table: async () => table, admin: withAdmin ? admin : undefined, now: () => NOW, newToken: () => token(++seq) }),
    inviteDeps: (now: Date = NOW) => ({ admin, now: () => now }),
  };
}

const invite = (w: ReturnType<typeof world>, email: string, extra: { name?: string; role?: TeamRole } = {}) => inviteMember({ email, role: extra.role ?? 'editor', origin: ORIGIN, ...(extra.name === undefined ? {} : { name: extra.name }) }, ADMIN, w.deps());

describe('team.service — time e papéis (S32)', () => {
  it('sem Supabase é unconfigured; sem login, signed_out; sem time, team undefined', async () => {
    const none = { table: async () => undefined };
    expect(await myTeam(ADMIN, none)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await inviteMember({ email: 'a@b.c', role: 'editor', origin: ORIGIN }, ADMIN, none)).toMatchObject({ ok: false, reason: 'unconfigured' });
    const w = world();
    expect(await myTeam(undefined, w.deps())).toMatchObject({ ok: false, reason: 'signed_out' });
    expect(await myTeam(NOBODY, w.deps())).toEqual({ ok: true, team: undefined });
    expect(await myRole(NOBODY, w.deps())).toBeUndefined();
    expect(await myRole(EDITOR, w.deps())).toBe('editor');
  });

  it('o time de quem está logado, com papel, nome, situação e (só para admin) os convites', async () => {
    const w = world();
    w.members[1]!.name = 'Ed Lumber';
    await invite(w, 'fresh@x.com', { name: 'Fresh' });
    w.as(EDITOR.id);
    const mine = await myTeam(EDITOR, w.deps());
    expect(mine).toMatchObject({ ok: true, team: { id: 't1', name: 'National Lumber', role: 'editor', myName: 'Ed Lumber', invites: [] } });
    expect(mine.ok && mine.team?.members.map((m) => [m.email, m.name, m.role, m.disabled])).toEqual([
      ['admin@x.com', undefined, 'admin', false],
      ['ed@x.com', 'Ed Lumber', 'editor', false],
    ]);
    w.as(ADMIN.id);
    const adminView = await myTeam(ADMIN, w.deps());
    expect(adminView.ok && adminView.team?.invites).toEqual([
      { id: expect.any(String), email: 'fresh@x.com', name: 'Fresh', role: 'editor', createdAt: NOW.toISOString(), expiresAt: '2026-11-13T12:00:00.000Z', expired: false, invitedBy: 'admin@x.com' },
    ]);
  });

  it('tabela que falta (migração não aplicada) vira missing com o caminho do README', async () => {
    const w = world();
    w.table.memberships = async () => {
      throw new TeamTableError('Could not find the table public.team_members', 'MISSING');
    };
    expect(await myTeam(ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'missing', message: expect.stringContaining('S41 — aplicar') });
  });

  it('admin adiciona conta existente (com nome, se ela não tinha); repetida é already_member; editor não convida', async () => {
    const w = world();
    expect(await inviteMember({ email: '  NEW@x.com ', name: '  Nova   Pessoa ', role: 'editor', origin: ORIGIN }, ADMIN, w.deps())).toEqual({ ok: true, status: 'added', email: 'new@x.com' });
    expect(w.members.find((m) => m.email === 'new@x.com')?.name).toBe('Nova Pessoa');
    expect(await invite(w, 'new@x.com')).toEqual({ ok: true, status: 'already_member', email: 'new@x.com' });
    expect(await inviteMember({ email: 'z@x.com', role: 'editor', origin: ORIGIN }, EDITOR, w.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await invite(w, 'não é email')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await invite(w, 'z@x.com', { name: 'x'.repeat(81) })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await inviteMember({ email: 'z@x.com', role: 'editor', origin: ORIGIN }, NOBODY, world().deps())).toMatchObject({ ok: false, reason: 'no_team' });
  });

  it('trocar papel e tirar: só admin; o último admin não sai nem é rebaixado', async () => {
    const w = world();
    expect(await setMemberRole({ userId: ADMIN.id, role: 'editor' }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'last_admin' });
    expect(await removeMember({ userId: ADMIN.id }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'last_admin' });
    expect(await setMemberRole({ userId: EDITOR.id, role: 'admin' }, EDITOR, w.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await setMemberRole({ userId: EDITOR.id, role: 'admin' }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(await setMemberRole({ userId: ADMIN.id, role: 'editor' }, ADMIN, w.deps())).toEqual({ ok: true });
    w.as(EDITOR.id);
    expect(await removeMember({ userId: ADMIN.id }, EDITOR, w.deps())).toEqual({ ok: true });
    expect(await removeMember({ userId: ADMIN.id }, EDITOR, w.deps())).toMatchObject({ ok: false, reason: 'not_found' });
    expect(w.members.map((m) => [m.email, m.role])).toEqual([['ed@x.com', 'admin']]);
  });

  it('normalizeEmail tira espaços e maiúsculas; cleanName colapsa espaços, vazio é null, longo é inválido', () => {
    expect(normalizeEmail('  Nick@WR.com ')).toBe('nick@wr.com');
    expect(cleanName('  Ana   Maria ')).toBe('Ana Maria');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(undefined)).toBeNull();
    expect(cleanName('x'.repeat(81))).toBeUndefined();
  });
});

describe('team.service — nomes (S41)', () => {
  it('admin muda o nome de alguém (vazio apaga); editor não; cada um muda o próprio', async () => {
    const w = world();
    expect(await setMemberName({ userId: EDITOR.id, name: ' Ed  L. ' }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(w.members[1]!.name).toBe('Ed L.');
    expect(await setMemberName({ userId: EDITOR.id, name: '' }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(w.members[1]!.name).toBeNull();
    expect(await setMemberName({ userId: ADMIN.id, name: 'Boss' }, EDITOR, w.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await setMemberName({ userId: EDITOR.id, name: 'x'.repeat(81) }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'invalid' });
    w.as(EDITOR.id);
    expect(await setMyName({ name: 'Edna' }, EDITOR, w.deps())).toEqual({ ok: true });
    expect(w.members[1]!.name).toBe('Edna');
    w.as(NOBODY.id);
    expect(await setMyName({ name: 'Ninguém' }, NOBODY, w.deps())).toMatchObject({ ok: false, reason: 'no_team' });
    expect(await setMyName({ name: 'x' }, undefined, w.deps())).toMatchObject({ ok: false, reason: 'signed_out' });
  });
});

describe('team.service — convite por link (S41)', () => {
  it('e-mail sem conta: sem chave secret diz o que falta; com ela, gera o link e guarda só o hash', async () => {
    const w = world();
    expect(await inviteMember({ email: 'fresh@x.com', role: 'admin', origin: ORIGIN }, ADMIN, w.deps(false))).toMatchObject({ ok: false, reason: 'needs_secret_key', message: expect.stringContaining('SUPABASE_SECRET_KEY') });
    expect(w.invites).toEqual([]);
    const r = await invite(w, 'Fresh@x.com', { name: 'Fresh', role: 'admin' });
    expect(r).toEqual({ ok: true, status: 'invite_link', email: 'fresh@x.com', url: `${ORIGIN}/invite/${token(1)}`, expiresAt: '2026-11-13T12:00:00.000Z' });
    expect(w.invites).toMatchObject([{ email: 'fresh@x.com', name: 'Fresh', role: 'admin', token_hash: hashInviteToken(token(1)), created_by: ADMIN.id, created_by_email: ADMIN.email }]);
    expect(JSON.stringify(w.invites)).not.toContain(token(1));
  });

  it('convidar de novo o mesmo e-mail revoga o anterior; New link troca o token; Withdraw retira', async () => {
    const w = world();
    await invite(w, 'fresh@x.com');
    await invite(w, 'fresh@x.com');
    expect(w.invites.map((i) => [i.token_hash === hashInviteToken(token(1)), i.revoked_at !== null])).toEqual([
      [true, true],
      [false, false],
    ]);
    const pending = w.invites[1]!;
    expect(await renewInvite({ id: pending.id, origin: ORIGIN }, ADMIN, w.deps())).toEqual({ ok: true, email: 'fresh@x.com', url: `${ORIGIN}/invite/${token(3)}`, expiresAt: expect.any(String) });
    expect(pending.revoked_at).not.toBeNull();
    expect(await renewInvite({ id: pending.id, origin: ORIGIN }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await renewInvite({ id: w.invites[2]!.id, origin: ORIGIN }, ADMIN, w.deps(false))).toMatchObject({ ok: false, reason: 'needs_secret_key' });
    expect(await revokeInvite({ id: w.invites[2]!.id }, EDITOR, w.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await revokeInvite({ id: w.invites[2]!.id }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(await revokeInvite({ id: w.invites[2]!.id }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('a página do convite: aberto mostra time, e-mail e papel; usado, revogado, vencido e lixo explicam', async () => {
    const w = world();
    await invite(w, 'fresh@x.com', { name: 'Fresh', role: 'admin' });
    expect(await invitePreview(token(1), w.inviteDeps())).toEqual({ state: 'open', email: 'fresh@x.com', name: 'Fresh', role: 'admin', teamName: 'National Lumber', expiresAt: '2026-11-13T12:00:00.000Z' });
    expect(await invitePreview(token(1), w.inviteDeps(new Date('2026-11-14T00:00:00Z')))).toMatchObject({ state: 'expired' });
    expect(await invitePreview('curto', w.inviteDeps())).toMatchObject({ state: 'invalid' });
    expect(await invitePreview(token(99), w.inviteDeps())).toMatchObject({ state: 'invalid' });
    expect(await invitePreview(token(1), { admin: undefined })).toMatchObject({ state: 'off' });
    w.invites[0]!.revoked_at = NOW.toISOString();
    expect(await invitePreview(token(1), w.inviteDeps())).toMatchObject({ state: 'revoked', message: expect.stringContaining('withdrawn') });
  });

  it('aceitar: cria a conta com a senha, entra no time com papel e nome; o mesmo link não serve duas vezes', async () => {
    const w = world();
    await invite(w, 'fresh@x.com', { name: 'Fresh', role: 'admin' });
    expect(await acceptInvite(token(1), { name: undefined, password: 'curta' }, w.inviteDeps())).toMatchObject({ ok: false, reason: 'weak_password' });
    expect(await acceptInvite(token(1), { name: '  Fresh  Person ', password: 'long enough 1' }, w.inviteDeps())).toEqual({ ok: true, email: 'fresh@x.com' });
    expect(w.accounts.get('fresh@x.com')).toMatchObject({ password: 'long enough 1', name: 'Fresh Person' });
    const joined = w.members.find((m) => m.email === 'fresh@x.com');
    expect(joined).toMatchObject({ team_id: 't1', role: 'admin', name: 'Fresh Person', invited_by: ADMIN.id });
    expect(w.invites[0]).toMatchObject({ accepted_at: NOW.toISOString(), accepted_by: joined!.user_id });
    expect(await acceptInvite(token(1), { name: undefined, password: 'long enough 1' }, w.inviteDeps())).toMatchObject({ ok: false, reason: 'used' });
    expect(w.members.filter((m) => m.email === 'fresh@x.com')).toHaveLength(1);
  });

  it('aceitar: sem nome usa o do convite; vencido e revogado recusam; sem chave, off', async () => {
    const w = world();
    await invite(w, 'a@x.com', { name: 'Ana' });
    await invite(w, 'b@x.com');
    expect(await acceptInvite(token(1), { name: '', password: 'long enough 1' }, w.inviteDeps())).toEqual({ ok: true, email: 'a@x.com' });
    expect(w.members.find((m) => m.email === 'a@x.com')?.name).toBe('Ana');
    expect(await acceptInvite(token(2), { name: undefined, password: 'long enough 1' }, w.inviteDeps(new Date('2026-12-01T00:00:00Z')))).toMatchObject({ ok: false, reason: 'expired' });
    w.invites[1]!.revoked_at = NOW.toISOString();
    expect(await acceptInvite(token(2), { name: undefined, password: 'long enough 1' }, w.inviteDeps())).toMatchObject({ ok: false, reason: 'revoked' });
    expect(await acceptInvite(token(2), { name: undefined, password: 'long enough 1' }, { admin: undefined })).toMatchObject({ ok: false, reason: 'off' });
    expect(await acceptInvite('lixo', { name: undefined, password: 'long enough 1' }, w.inviteDeps())).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('aceitar: conta que já existe devolve o convite; falha ao entrar no time apaga a conta criada', async () => {
    const w = world();
    await invite(w, 'fresh@x.com');
    w.accounts.set('fresh@x.com', { id: '55555555-5555-4555-8555-555555555555' });
    expect(await acceptInvite(token(1), { name: undefined, password: 'long enough 1' }, w.inviteDeps())).toMatchObject({ ok: false, reason: 'exists', message: expect.stringContaining('Sign in') });
    expect(w.invites[0]!.accepted_at).toBeNull();
    w.accounts.delete('fresh@x.com');
    w.admin.addMember = async () => {
      throw new TeamTableError('insert failed');
    };
    expect(await acceptInvite(token(1), { name: undefined, password: 'long enough 1' }, w.inviteDeps())).toMatchObject({ ok: false, reason: 'failed' });
    expect(w.accounts.has('fresh@x.com')).toBe(false);
    expect(w.invites[0]!.accepted_at).toBeNull();
  });
});

describe('team.service — contas pela chave secret (S41)', () => {
  it('link de nova senha: só admin, nunca a própria conta, sem chave diz o que falta; o link vai a /auth/confirm', async () => {
    const w = world();
    const r = await memberResetLink({ userId: EDITOR.id, origin: ORIGIN }, ADMIN, w.deps());
    expect(r).toEqual({ ok: true, email: EDITOR.email, url: `${ORIGIN}/auth/confirm?token_hash=pkce_8abc&type=recovery&next=%2Fapp%2Faccount%3Freset%3D1` });
    expect(await memberResetLink({ userId: ADMIN.id, origin: ORIGIN }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'self' });
    expect(await memberResetLink({ userId: ADMIN.id, origin: ORIGIN }, EDITOR, w.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await memberResetLink({ userId: EDITOR.id, origin: ORIGIN }, ADMIN, w.deps(false))).toMatchObject({ ok: false, reason: 'needs_secret_key' });
    expect(await memberResetLink({ userId: NOBODY.id, origin: ORIGIN }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('conta que também está em outro time não é gerida pela chave', async () => {
    const w = world();
    w.members.push(member('t2', EDITOR, 'editor'));
    for (const run of [
      () => memberResetLink({ userId: EDITOR.id, origin: ORIGIN }, ADMIN, w.deps()),
      () => setMemberDisabled({ userId: EDITOR.id, disabled: true }, ADMIN, w.deps()),
      () => deleteMemberAccount({ userId: EDITOR.id }, ADMIN, w.deps()),
    ]) {
      expect(await run()).toMatchObject({ ok: false, reason: 'other_team' });
    }
    expect(w.accounts.has(EDITOR.email)).toBe(true);
  });

  it('desativar: ban + disabled_at (sai da RLS: some do time dele); reativar devolve; link de senha pede reativar antes', async () => {
    const w = world();
    expect(await setMemberDisabled({ userId: EDITOR.id, disabled: true }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(w.banned.has(EDITOR.id)).toBe(true);
    expect(w.members[1]!.disabled_at).toBe(NOW.toISOString());
    expect(await myTeam(EDITOR, w.deps())).toEqual({ ok: true, team: undefined });
    const adminView = await myTeam(ADMIN, w.deps());
    expect(adminView.ok && adminView.team?.members[1]?.disabled).toBe(true);
    expect(await memberResetLink({ userId: EDITOR.id, origin: ORIGIN }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'disabled' });
    expect(await setMemberDisabled({ userId: EDITOR.id, disabled: true }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(await setMemberDisabled({ userId: EDITOR.id, disabled: false }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(w.banned.has(EDITOR.id)).toBe(false);
    expect(w.members[1]!.disabled_at).toBeNull();
    expect(await setMemberDisabled({ userId: ADMIN.id, disabled: true }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'self' });
  });

  it('desativar: se o ban falha, disabled_at volta; o último admin ativo não é desativado', async () => {
    const w = world();
    w.admin.setBanned = async () => ({ message: 'auth down' });
    expect(await setMemberDisabled({ userId: EDITOR.id, disabled: true }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('auth down') });
    expect(w.members[1]!.disabled_at).toBeNull();
    const w2 = world();
    // Só pela guarda do banco: um segundo admin desativado e o outro tentando se desativar por outro caminho.
    w2.members[1]!.role = 'admin';
    w2.as(EDITOR.id);
    expect(await setMemberDisabled({ userId: ADMIN.id, disabled: true }, EDITOR, w2.deps())).toEqual({ ok: true });
    await expect(w2.admin.setDisabledAt('t1', EDITOR.id, NOW.toISOString())).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('apagar a conta: some do Supabase e do time; nunca a própria; erro do Auth volta como frase', async () => {
    const w = world();
    expect(await deleteMemberAccount({ userId: ADMIN.id }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'self' });
    expect(await deleteMemberAccount({ userId: EDITOR.id }, EDITOR, w.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await deleteMemberAccount({ userId: EDITOR.id }, ADMIN, w.deps())).toEqual({ ok: true });
    expect(w.accounts.has(EDITOR.email)).toBe(false);
    expect(w.members.map((m) => m.email)).toEqual([ADMIN.email]);
    expect(await deleteMemberAccount({ userId: EDITOR.id }, ADMIN, w.deps())).toMatchObject({ ok: false, reason: 'not_found' });
    const w2 = world();
    w2.admin.deleteUser = async () => ({ message: 'Database error deleting user' });
    expect(await deleteMemberAccount({ userId: EDITOR.id }, ADMIN, w2.deps())).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('Database error') });
  });
});
