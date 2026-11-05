/**
 * RLS por time (S32) direto pelo cliente do Supabase, como um usuário mal-intencionado faria com a chave publicável
 * do navegador (S33): o app passa pelos adaptadores, mas a barreira é a política — aqui sem adaptador no meio.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, RIVAL_TEAM_ID } from '../testing/local-supabase';
import { cleanProjects, RUN, skip, world, type World } from './setup';

describe.skipIf(skip)('RLS (Supabase local)', () => {
  let w: World;
  let mainProject: string;
  let rivalProject: string;

  beforeAll(async () => {
    w = await world();
    const main = await w.as.editor
      .from('projects')
      .insert({
        name: `${RUN} rls main`,
        data: { walls: [] },
        owner_id: w.seeded.ids.editor,
        owner_email: ACCOUNTS.editor.email,
      })
      .select('id, team_id')
      .single();
    if (main.error !== null) throw new Error(main.error.message);
    mainProject = main.data.id;
    const rival = await w.as.rival
      .from('projects')
      .insert({
        name: `${RUN} rls rival`,
        data: { walls: [] },
        owner_id: w.seeded.ids.rival,
        owner_email: ACCOUNTS.rival.email,
      })
      .select('id, team_id')
      .single();
    if (rival.error !== null) throw new Error(rival.error.message);
    rivalProject = rival.data.id;
    expect(rival.data.team_id).toBe(RIVAL_TEAM_ID);
  });
  afterAll(async () => {
    if (w !== undefined) await cleanProjects(w.service);
  });

  it('sem login (anon) não lê projetos, times nem retratos', async () => {
    const anon = (await import('@supabase/supabase-js')).createClient(w.env.url, w.env.key, {
      auth: { persistSession: false },
    });
    for (const table of ['projects', 'teams', 'team_members', 'project_revisions', 'extraction_jobs'] as const) {
      const { data } = await anon.from(table).select('*').limit(5);
      expect(data ?? []).toEqual([]);
    }
  });

  it('um time não vê, não edita e não apaga projeto do outro', async () => {
    expect((await w.as.rival.from('projects').select('id').eq('id', mainProject)).data).toEqual([]);
    expect((await w.as.admin.from('projects').select('id').eq('id', rivalProject)).data).toEqual([]);
    const edit = await w.as.rival.from('projects').update({ name: 'hijack' }).eq('id', mainProject).select('id');
    expect(edit.data ?? []).toEqual([]);
    const del = await w.as.rival.from('projects').delete().eq('id', mainProject).select('id');
    expect(del.data ?? []).toEqual([]);
    expect((await w.as.rival.from('project_revisions').select('id').eq('project_id', mainProject)).data).toEqual([]);
  });

  it('não dá para levar um projeto para outro time nem criar em time alheio', async () => {
    const move = await w.as.admin
      .from('projects')
      .update({ team_id: RIVAL_TEAM_ID })
      .eq('id', mainProject)
      .select('id');
    expect(move.error).not.toBeNull();
    const intrude = await w.as.admin
      .from('projects')
      .insert({ name: `${RUN} intrude`, data: {}, owner_id: w.seeded.ids.admin, team_id: RIVAL_TEAM_ID });
    expect(intrude.error).not.toBeNull();
  });

  it('não dá para criar projeto em nome de outra pessoa', async () => {
    const forged = await w.as.editor
      .from('projects')
      .insert({ name: `${RUN} forged`, data: {}, owner_id: w.seeded.ids.admin });
    expect(forged.error).not.toBeNull();
  });

  it('retratos: só leitura para o cliente', async () => {
    const write = await w.as.admin
      .from('project_revisions')
      .insert({ project_id: mainProject, team_id: w.seeded.mainTeamId, revision: 999, name: 'x', data: {} });
    expect(write.error).not.toBeNull();
    const erase = await w.as.admin.from('project_revisions').delete().eq('project_id', mainProject).select('id');
    expect(erase.data ?? []).toEqual([]);
  });

  it('editor não se promove nem entra em outro time por insert direto', async () => {
    const promote = await w.as.editor
      .from('team_members')
      .update({ role: 'admin' })
      .eq('user_id', w.seeded.ids.editor)
      .select('user_id');
    expect(promote.data ?? []).toEqual([]);
    const join = await w.as.outsider
      .from('team_members')
      .insert({
        team_id: w.seeded.mainTeamId,
        user_id: w.seeded.ids.outsider,
        email: ACCOUNTS.outsider.email,
        role: 'admin',
      });
    expect(join.error).not.toBeNull();
    const rename = await w.as.editor
      .from('teams')
      .update({ name: 'renamed' })
      .eq('id', w.seeded.mainTeamId)
      .select('id');
    expect(rename.data ?? []).toEqual([]);
  });

  it('jobs de leitura: só o dono vê', async () => {
    const id = `${RUN}-job`;
    const mine = await w.as.editor
      .from('extraction_jobs')
      .insert({ id, owner_id: w.seeded.ids.editor, status: 'running' })
      .select('id');
    expect(mine.error).toBeNull();
    expect((await w.as.admin.from('extraction_jobs').select('id').eq('id', id)).data).toEqual([]);
    expect((await w.as.editor.from('extraction_jobs').select('id').eq('id', id)).data).toEqual([{ id }]);
    await w.service.from('extraction_jobs').delete().eq('id', id);
  });

  it('funções de limpeza fechadas para quem está logado', async () => {
    for (const fn of [
      'sweep_trashed_projects',
      'orphan_drawings',
      'sweep_orphan_drawings',
      'sweep_extraction_jobs',
    ] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- funções fora do `Database` tipado (só o dono do banco as chama).
      const { error } = await (w.as.admin.rpc as any)(fn);
      // 42501 = permission denied (não "função não existe", que passaria pelo motivo errado).
      expect(error?.code, fn).toBe('42501');
    }
  });
});
