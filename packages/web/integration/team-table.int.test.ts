/**
 * `supabaseTeamTable` contra o Supabase local (S33): leitura do time pela RLS, `add_team_member` por `rpc`, troca de
 * papel e saída do time — e o trigger do último admin chegando como `LAST_ADMIN`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseTeamTable, TeamTableError } from '../src/lib/supabase/team-table';
import { ACCOUNTS, MAIN_TEAM_NAME, RIVAL_TEAM_ID, seedAccounts } from '../testing/local-supabase';
import { env, skip, world, type World } from './setup';

describe.skipIf(skip)('team-table (Supabase local)', () => {
  let w: World;
  beforeAll(async () => {
    w = await world();
  });
  // O que um teste mudou no time volta ao estado de `ACCOUNTS` (outsider fora, papéis originais).
  afterAll(async () => {
    if (env !== undefined) await seedAccounts(env);
  });

  it('memberships: o time e o papel de cada conta; conta sem time, nenhum', async () => {
    expect(await supabaseTeamTable(w.as.admin).memberships(w.seeded.ids.admin)).toEqual([
      { teamId: w.seeded.mainTeamId, teamName: MAIN_TEAM_NAME, role: 'admin' },
    ]);
    expect(await supabaseTeamTable(w.as.editor).memberships(w.seeded.ids.editor)).toEqual([
      { teamId: w.seeded.mainTeamId, teamName: MAIN_TEAM_NAME, role: 'editor' },
    ]);
    expect(await supabaseTeamTable(w.as.outsider).memberships(w.seeded.ids.outsider)).toEqual([]);
  });

  it('members: o time vê a própria lista; quem é de fora, não', async () => {
    const emails = (await supabaseTeamTable(w.as.editor).members(w.seeded.mainTeamId)).map((m) => m.email);
    expect(emails).toEqual(expect.arrayContaining([ACCOUNTS.admin.email, ACCOUNTS.editor.email]));
    expect(emails).not.toContain(ACCOUNTS.rival.email);
    expect(await supabaseTeamTable(w.as.outsider).members(w.seeded.mainTeamId)).toEqual([]);
    expect(await supabaseTeamTable(w.as.rival).members(w.seeded.mainTeamId)).toEqual([]);
    expect((await supabaseTeamTable(w.as.admin).members(RIVAL_TEAM_ID)).length).toBe(0);
  });

  it('add_team_member: editor é recusado; admin vê no_account, already_member e added (e-mail sem diferença de caixa)', async () => {
    expect(await supabaseTeamTable(w.as.editor).addMember(w.seeded.mainTeamId, ACCOUNTS.outsider.email, 'editor')).toBe(
      'forbidden',
    );
    const admin = supabaseTeamTable(w.as.admin);
    expect(await admin.addMember(w.seeded.mainTeamId, 'nobody@panelizer.test', 'editor')).toBe('no_account');
    expect(await admin.addMember(w.seeded.mainTeamId, ACCOUNTS.editor.email, 'editor')).toBe('already_member');
    expect(await admin.addMember(w.seeded.mainTeamId, `  ${ACCOUNTS.outsider.email.toUpperCase()} `, 'editor')).toBe(
      'added',
    );
    const outsiderView = await supabaseTeamTable(w.as.outsider).memberships(w.seeded.ids.outsider);
    expect(outsiderView.map((m) => m.role)).toEqual(['editor']);
    expect(await admin.remove(w.seeded.mainTeamId, w.seeded.ids.outsider)).toBe(true);
    expect(await supabaseTeamTable(w.as.outsider).memberships(w.seeded.ids.outsider)).toEqual([]);
  });

  it('papel: editor não muda nada (false); admin muda; o último admin não sai (LAST_ADMIN)', async () => {
    expect(await supabaseTeamTable(w.as.editor).setRole(w.seeded.mainTeamId, w.seeded.ids.admin, 'editor')).toBe(false);
    expect(await supabaseTeamTable(w.as.editor).remove(w.seeded.mainTeamId, w.seeded.ids.admin)).toBe(false);
    const admin = supabaseTeamTable(w.as.admin);
    const last = await admin.setRole(w.seeded.mainTeamId, w.seeded.ids.admin, 'editor').catch((e: unknown) => e);
    expect(last).toBeInstanceOf(TeamTableError);
    expect((last as TeamTableError).code).toBe('LAST_ADMIN');
    const leave = await admin.remove(w.seeded.mainTeamId, w.seeded.ids.admin).catch((e: unknown) => e);
    expect((leave as TeamTableError).code).toBe('LAST_ADMIN');
    expect(await admin.setRole(w.seeded.mainTeamId, w.seeded.ids.editor, 'admin')).toBe(true);
    expect(await admin.setRole(w.seeded.mainTeamId, w.seeded.ids.editor, 'editor')).toBe(true);
  });
});
