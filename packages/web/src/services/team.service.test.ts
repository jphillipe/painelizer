import { describe, expect, it, vi } from 'vitest';
import type { AdminInvites } from '@/lib/supabase/admin';
import { TeamTableError, type TeamTable } from '@/lib/supabase/team-table';
import type { TeamMemberRow, TeamRole } from '@/types/database';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));

const { inviteMember, myRole, myTeam, normalizeEmail, removeMember, setMemberRole } = await import('./team.service');

const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@x.com' };
const EDITOR = { id: '22222222-2222-4222-8222-222222222222', email: 'ed@x.com' };
const NOBODY = { id: '33333333-3333-4333-8333-333333333333', email: 'new@x.com' };

/** Time em memória com as regras do banco: só admin muda, o último admin fica, `add_team_member` acha conta pelo e-mail. */
function fakeTeam() {
  const accounts = new Map<string, string>([
    [ADMIN.email, ADMIN.id],
    [EDITOR.email, EDITOR.id],
    [NOBODY.email, NOBODY.id],
  ]);
  const members: TeamMemberRow[] = [
    { team_id: 't1', user_id: ADMIN.id, email: ADMIN.email, role: 'admin', invited_by: null, created_at: '2026-11-04T00:00:00Z' },
    { team_id: 't1', user_id: EDITOR.id, email: EDITOR.email, role: 'editor', invited_by: null, created_at: '2026-11-04T00:01:00Z' },
  ];
  let caller = ADMIN.id;
  const isAdmin = () => members.some((m) => m.user_id === caller && m.role === 'admin');
  const lastAdmin = (userId: string) => members.filter((m) => m.role === 'admin' && m.user_id !== userId).length === 0;
  const table: TeamTable = {
    async memberships(userId) {
      return members.filter((m) => m.user_id === userId).map((m) => ({ teamId: m.team_id, teamName: 'National Lumber', role: m.role }));
    },
    async members(teamId) {
      return members.filter((m) => m.team_id === teamId);
    },
    async addMember(teamId, email, role) {
      if (!isAdmin()) return 'forbidden';
      const id = accounts.get(email.trim().toLowerCase());
      if (id === undefined) return 'no_account';
      if (members.some((m) => m.user_id === id)) return 'already_member';
      members.push({ team_id: teamId, user_id: id, email, role, invited_by: caller, created_at: new Date().toISOString() });
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
  };
  return {
    table,
    members,
    accounts,
    as: (id: string) => {
      caller = id;
    },
    deps: (invites?: AdminInvites) => ({ table: async () => table, invites }),
  };
}

describe('team.service (S32)', () => {
  it('sem Supabase é unconfigured; sem login, signed_out; sem time, team undefined', async () => {
    const none = { table: async () => undefined };
    expect(await myTeam(ADMIN, none)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await inviteMember({ email: 'a@b.c', role: 'editor', redirectTo: 'r' }, ADMIN, none)).toMatchObject({ ok: false, reason: 'unconfigured' });
    const t = fakeTeam();
    expect(await myTeam(undefined, t.deps())).toMatchObject({ ok: false, reason: 'signed_out' });
    expect(await myTeam(NOBODY, t.deps())).toEqual({ ok: true, team: undefined });
    expect(await myRole(NOBODY, t.deps())).toBeUndefined();
    expect(await myRole(EDITOR, t.deps())).toBe('editor');
  });

  it('o time de quem está logado, com papel e membros', async () => {
    const t = fakeTeam();
    const mine = await myTeam(EDITOR, t.deps());
    expect(mine).toMatchObject({ ok: true, team: { id: 't1', name: 'National Lumber', role: 'editor' } });
    expect(mine.ok && mine.team?.members.map((m) => [m.email, m.role])).toEqual([
      ['admin@x.com', 'admin'],
      ['ed@x.com', 'editor'],
    ]);
  });

  it('tabela que falta (migração não aplicada) vira missing com o caminho do README', async () => {
    const t = fakeTeam();
    t.table.memberships = async () => {
      throw new TeamTableError('Could not find the table public.team_members', 'MISSING');
    };
    expect(await myTeam(ADMIN, t.deps())).toMatchObject({ ok: false, reason: 'missing', message: expect.stringContaining('S32 — aplicar') });
  });

  it('admin adiciona conta existente; repetida é already_member; editor não convida', async () => {
    const t = fakeTeam();
    expect(await inviteMember({ email: '  NEW@x.com ', role: 'editor', redirectTo: 'r' }, ADMIN, t.deps())).toEqual({ ok: true, status: 'added', email: 'new@x.com' });
    expect(t.members.map((m) => m.email)).toContain('new@x.com');
    expect(await inviteMember({ email: 'new@x.com', role: 'editor', redirectTo: 'r' }, ADMIN, t.deps())).toEqual({ ok: true, status: 'already_member', email: 'new@x.com' });
    expect(await inviteMember({ email: 'z@x.com', role: 'editor', redirectTo: 'r' }, EDITOR, t.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await inviteMember({ email: 'não é email', role: 'editor', redirectTo: 'r' }, ADMIN, t.deps())).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await inviteMember({ email: 'z@x.com', role: 'editor', redirectTo: 'r' }, NOBODY, fakeTeam().deps())).toMatchObject({ ok: false, reason: 'no_team' });
  });

  it('e-mail sem conta: sem chave secret diz o que fazer; com ela convida pelo Supabase e põe no time', async () => {
    const t = fakeTeam();
    expect(await inviteMember({ email: 'fresh@x.com', role: 'admin', redirectTo: 'r' }, ADMIN, t.deps())).toMatchObject({ ok: false, reason: 'invites_off', message: expect.stringContaining('SUPABASE_SECRET_KEY') });
    const sent: unknown[] = [];
    const invites: AdminInvites = {
      inviteUserByEmail: async (email, options) => {
        sent.push([email, options.redirectTo]);
        t.accounts.set(email, '44444444-4444-4444-8444-444444444444');
        return { data: { user: { id: '44444444-4444-4444-8444-444444444444' } }, error: null };
      },
    };
    const redirectTo = 'https://app/auth/confirm?next=%2Fapp%2Faccount%3Fwelcome%3D1';
    expect(await inviteMember({ email: 'fresh@x.com', role: 'admin', redirectTo }, ADMIN, t.deps(invites))).toEqual({ ok: true, status: 'invited', email: 'fresh@x.com' });
    expect(sent).toEqual([['fresh@x.com', redirectTo]]);
    expect(t.members.find((m) => m.email === 'fresh@x.com')?.role).toBe('admin');
    const failing: AdminInvites = { inviteUserByEmail: async () => ({ data: { user: null }, error: { message: 'Email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 } }) };
    expect(await inviteMember({ email: 'other@x.com', role: 'editor', redirectTo }, ADMIN, t.deps(failing))).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('Too many emails') });
  });

  it('trocar papel e tirar: só admin; o último admin não sai nem é rebaixado', async () => {
    const t = fakeTeam();
    expect(await setMemberRole({ userId: ADMIN.id, role: 'editor' }, ADMIN, t.deps())).toMatchObject({ ok: false, reason: 'last_admin' });
    expect(await removeMember({ userId: ADMIN.id }, ADMIN, t.deps())).toMatchObject({ ok: false, reason: 'last_admin' });
    expect(await setMemberRole({ userId: EDITOR.id, role: 'admin' as TeamRole }, EDITOR, t.deps())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await setMemberRole({ userId: EDITOR.id, role: 'admin' }, ADMIN, t.deps())).toEqual({ ok: true });
    expect(await setMemberRole({ userId: ADMIN.id, role: 'editor' }, ADMIN, t.deps())).toEqual({ ok: true });
    t.as(EDITOR.id);
    expect(await removeMember({ userId: ADMIN.id }, EDITOR, t.deps())).toEqual({ ok: true });
    expect(await removeMember({ userId: ADMIN.id }, EDITOR, t.deps())).toMatchObject({ ok: false, reason: 'not_found' });
    expect(t.members.map((m) => [m.email, m.role])).toEqual([['ed@x.com', 'admin']]);
  });

  it('normalizeEmail tira espaços e maiúsculas', () => {
    expect(normalizeEmail('  Nick@WR.com ')).toBe('nick@wr.com');
  });
});
