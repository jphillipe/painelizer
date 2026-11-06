/**
 * S41 contra o Supabase local: grant por coluna em `team_members`, `set_my_name`, membro desativado fora da RLS, o
 * último admin ATIVO, a RLS de `team_invites` — e o caminho inteiro do service com o adaptador real da chave secret
 * (`supabaseAdmin`): convite por link → aceitar (conta criada, no time) → entrar → desativar → reativar → link de
 * senha → apagar.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { supabaseTeamTable } from '../src/lib/supabase/team-table';
import type { Database } from '../src/types/database';
import { ACCOUNTS, seedAccounts } from '../testing/local-supabase';
import { env, RUN, skip, world, type World } from './setup';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));

const { supabaseAdmin } = await import('../src/lib/supabase/admin');
const svc = await import('../src/services/team.service');

const ORIGIN = 'http://localhost:3000';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

describe.skipIf(skip)('contas e convites (S41, Supabase local)', () => {
  let w: World;
  const fresh = `${RUN}@panelizer.test`;
  beforeAll(async () => {
    w = await world();
  });
  afterAll(async () => {
    if (env === undefined) return;
    await w.service.from('team_invites').delete().like('email', `${RUN}%`);
    const { data } = await w.service.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of data?.users ?? []) if (u.email?.startsWith(RUN)) await w.service.auth.admin.deleteUser(u.id);
    await seedAccounts(env);
  });

  const adminApi = () =>
    supabaseAdmin({ NEXT_PUBLIC_SUPABASE_URL: w.env.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: w.env.key, SUPABASE_SECRET_KEY: w.env.secretKey })!;
  const as = (account: keyof World['as']) => ({ table: async () => supabaseTeamTable(w.as[account]), admin: adminApi() });
  const ADMIN = () => ({ id: w.seeded.ids.admin, email: ACCOUNTS.admin.email });

  it('grant por coluna: admin muda papel e nome, mas não e-mail nem disabled_at; editor não muda o próprio papel', async () => {
    const team = w.seeded.mainTeamId;
    const email = await w.as.admin.from('team_members').update({ email: 'x@y.z' }).eq('team_id', team).eq('user_id', w.seeded.ids.editor).select('user_id');
    expect(email.error?.code).toBe('42501');
    const disabled = await w.as.admin.from('team_members').update({ disabled_at: new Date().toISOString() }).eq('team_id', team).eq('user_id', w.seeded.ids.editor).select('user_id');
    expect(disabled.error?.code).toBe('42501');
    expect(await supabaseTeamTable(w.as.admin).setName(team, w.seeded.ids.editor, 'Ed Lumber')).toBe(true);
    expect(await supabaseTeamTable(w.as.editor).setRole(team, w.seeded.ids.editor, 'admin')).toBe(false);
    expect(await supabaseTeamTable(w.as.editor).setMyName('Edna')).toBe(true);
    const rows = await supabaseTeamTable(w.as.editor).members(team);
    expect(rows.find((r) => r.user_id === w.seeded.ids.editor)).toMatchObject({ role: 'editor', name: 'Edna', disabled_at: null });
    expect(await supabaseTeamTable(w.as.outsider).setMyName('Ninguém')).toBe(false);
  });

  it('desativado sai da RLS na hora; o último admin ativo não é desativado', async () => {
    const team = w.seeded.mainTeamId;
    const admin = adminApi();
    await admin.setDisabledAt(team, w.seeded.ids.editor, new Date().toISOString());
    expect(await supabaseTeamTable(w.as.editor).memberships(w.seeded.ids.editor)).toEqual([]);
    const { data: projects } = await w.as.editor.from('projects').select('id').limit(1);
    expect(projects).toEqual([]);
    await admin.setDisabledAt(team, w.seeded.ids.editor, null);
    expect((await supabaseTeamTable(w.as.editor).memberships(w.seeded.ids.editor)).map((m) => m.role)).toEqual(['editor']);
    await expect(admin.setDisabledAt(team, w.seeded.ids.admin, new Date().toISOString())).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('team_invites: admin cria e revoga; editor, outro time e anon não veem; aceitar não é do cliente', async () => {
    const team = w.seeded.mainTeamId;
    const row = await supabaseTeamTable(w.as.admin).createInvite({ team_id: team, email: `${RUN}-rls@panelizer.test`, name: null, role: 'editor', token_hash: 'a'.repeat(64), created_by: w.seeded.ids.admin, created_by_email: ACCOUNTS.admin.email });
    expect(row.expires_at > row.created_at).toBe(true);
    expect(await supabaseTeamTable(w.as.editor).pendingInvites(team)).toEqual([]);
    expect(await supabaseTeamTable(w.as.rival).pendingInvites(team)).toEqual([]);
    const anon = createClient<Database>(w.env.url, w.env.key, noSession);
    expect((await anon.from('team_invites').select('id')).data ?? []).toEqual([]);
    const forged = await w.as.editor.from('team_invites').insert({ team_id: team, email: `${RUN}-x@panelizer.test`, token_hash: 'b'.repeat(64), created_by: w.seeded.ids.editor });
    expect(forged.error).not.toBeNull();
    const accept = await w.as.admin.from('team_invites').update({ accepted_at: new Date().toISOString() }).eq('id', row.id).select('id');
    expect(accept.error?.code).toBe('42501');
    expect(await supabaseTeamTable(w.as.admin).revokeInvite(team, row.id)).toBe(true);
    expect(await supabaseTeamTable(w.as.admin).revokeInvite(team, row.id)).toBe(false);
  });

  it('o caminho inteiro: convite → aceitar → entrar → desativar → reativar → link de senha → apagar', async () => {
    const link = await svc.inviteMember({ email: fresh, name: 'Fresh Person', role: 'editor', origin: ORIGIN }, ADMIN(), as('admin'));
    expect(link).toMatchObject({ ok: true, status: 'invite_link', email: fresh });
    const token = link.ok && link.status === 'invite_link' ? link.url.split('/invite/')[1]! : '';
    expect(await svc.invitePreview(token, { admin: adminApi() })).toMatchObject({ state: 'open', email: fresh, teamName: 'National Lumber' });

    expect(await svc.acceptInvite(token, { name: undefined, password: 'fresh-password-1' }, { admin: adminApi() })).toEqual({ ok: true, email: fresh });
    expect(await svc.acceptInvite(token, { name: undefined, password: 'fresh-password-1' }, { admin: adminApi() })).toMatchObject({ ok: false, reason: 'used' });

    const client = createClient<Database>(w.env.url, w.env.key, noSession);
    const signed = await client.auth.signInWithPassword({ email: fresh, password: 'fresh-password-1' });
    expect(signed.error).toBeNull();
    const userId = signed.data.user!.id;
    const mine = await svc.myTeam({ id: userId, email: fresh }, { table: async () => supabaseTeamTable(client) });
    expect(mine.ok && mine.team).toMatchObject({ role: 'editor', myName: 'Fresh Person' });

    expect(await svc.setMemberDisabled({ userId, disabled: true }, ADMIN(), as('admin'))).toEqual({ ok: true });
    expect(await supabaseTeamTable(client).memberships(userId)).toEqual([]);
    const blocked = await createClient<Database>(w.env.url, w.env.key, noSession).auth.signInWithPassword({ email: fresh, password: 'fresh-password-1' });
    expect(blocked.error?.code).toBe('user_banned');
    expect(await svc.setMemberDisabled({ userId, disabled: false }, ADMIN(), as('admin'))).toEqual({ ok: true });

    const reset = await svc.memberResetLink({ userId, origin: ORIGIN }, ADMIN(), as('admin'));
    expect(reset).toMatchObject({ ok: true, email: fresh, url: expect.stringContaining('/auth/confirm?token_hash=') });
    const hash = reset.ok ? new URL(reset.url).searchParams.get('token_hash')! : '';
    const opened = await createClient<Database>(w.env.url, w.env.key, noSession).auth.verifyOtp({ token_hash: hash, type: 'recovery' });
    expect(opened.data.user?.email).toBe(fresh);

    expect(await svc.deleteMemberAccount({ userId }, ADMIN(), as('admin'))).toEqual({ ok: true });
    const { data: gone } = await w.service.auth.admin.getUserById(userId);
    expect(gone.user).toBeNull();
    expect((await supabaseTeamTable(w.as.admin).members(w.seeded.mainTeamId)).some((m) => m.user_id === userId)).toBe(false);
  });
});
