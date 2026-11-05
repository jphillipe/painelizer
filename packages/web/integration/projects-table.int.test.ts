/**
 * `supabaseProjectsTable` contra o Supabase local (S33): a sintaxe do PostgREST que os testes com `Map` não cobrem —
 * concorrência otimista, lixeira, busca `ilike` com `%`/`_` literais, cursor `or(...)` com datas entre aspas,
 * "Mine" e os retratos do histórico gravados pelo trigger.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseProjectsTable, ProjectsTableError, type ProjectsTable } from '../src/lib/supabase/projects-table';
import type { Json } from '../src/types/json';
import { ACCOUNTS } from '../testing/local-supabase';
import { cleanProjects, RUN, skip, world, type World } from './setup';

describe.skipIf(skip)('projects-table (Supabase local)', () => {
  let w: World;
  let admin: ProjectsTable;
  let editor: ProjectsTable;
  const row = (name: string, data: Json = { walls: [{ id: 'W1' }] }, who: 'admin' | 'editor' = 'admin') => ({
    name: `${RUN} ${name}`,
    data,
    owner_id: w.seeded.ids[who],
    owner_email: ACCOUNTS[who].email,
  });

  beforeAll(async () => {
    w = await world();
    admin = supabaseProjectsTable(w.as.admin);
    editor = supabaseProjectsTable(w.as.editor);
  });
  afterAll(async () => {
    if (w !== undefined) await cleanProjects(w.service);
  });

  it('insere com revisão 1 e lê de volta, com o time e o autor da sessão', async () => {
    const created = await admin.insert(row('insert'));
    expect(created.revision).toBe(1);
    const got = await editor.get(created.id);
    expect(got?.name).toBe(`${RUN} insert`);
    expect(got?.team_id).toBe(w.seeded.mainTeamId);
    expect(got?.owner_email).toBe(ACCOUNTS.admin.email);
    expect(got?.updated_by_email).toBe(ACCOUNTS.admin.email);
  });

  it('id inexistente é undefined, não erro', async () => {
    expect(await admin.get('00000000-0000-4000-8000-0000000000ff')).toBeUndefined();
  });

  it('updateIfRevision grava só na revisão esperada e registra quem gravou', async () => {
    const { id } = await admin.insert(row('rev'));
    const saved = await editor.updateIfRevision(id, 1, { name: `${RUN} rev 2`, data: { walls: [] } });
    expect(saved?.revision).toBe(2);
    expect(await admin.updateIfRevision(id, 1, { name: `${RUN} stale`, data: { walls: [] } })).toBeUndefined();
    const got = await admin.get(id);
    expect(got?.name).toBe(`${RUN} rev 2`);
    expect(got?.updated_by_email).toBe(ACCOUNTS.editor.email);
  });

  it('busca trata % e _ como texto, sem diferença de maiúsculas', async () => {
    await admin.insert(row('100% Done'));
    await admin.insert(row('100 done'));
    await admin.insert(row('a_b'));
    await admin.insert(row('axb'));
    const names = async (search: string) =>
      (await admin.list({ search: `${RUN} ${search}`, limit: 50 })).map((r) => r.name).sort();
    expect(await names('100% d')).toEqual([`${RUN} 100% Done`]);
    expect(await names('a_b')).toEqual([`${RUN} a_b`]);
    expect(await names('100')).toEqual([`${RUN} 100 done`, `${RUN} 100% Done`]);
  });

  it('lista só a lista de paredes do data, mais recente primeiro', async () => {
    await admin.insert(
      row('walls-a', { walls: [{ id: 'W1' }, { id: 'W2' }], $panelizer: { reading: { big: 'x'.repeat(1000) } } }),
    );
    const [first] = await admin.list({ search: `${RUN} walls-a`, limit: 5 });
    expect(first?.walls).toEqual([{ id: 'W1' }, { id: 'W2' }]);
    expect(first).not.toHaveProperty('data');
  });

  it('pagina pelo cursor updated_at~id (datas com ":" e "+" entre aspas no or)', async () => {
    const prefix = `${RUN} page`;
    for (let i = 0; i < 5; i++) await admin.insert(row(`page ${i}`));
    const seen: string[] = [];
    let before: { at: string; id: string } | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await admin.list({ search: prefix, limit: 2, ...(before === undefined ? {} : { before }) });
      if (page.length === 0) break;
      seen.push(...page.map((r) => r.name));
      const last = page[page.length - 1]!;
      before = { at: last.updated_at, id: last.id };
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen).toEqual([...seen].sort().reverse());
  });

  it('cursor desempata pelo id quando updated_at é igual', async () => {
    const a = await admin.insert(row('tie a'));
    const b = await admin.insert(row('tie b'));
    // Um UPDATE só nas duas: o trigger põe `updated_at = now()`, que é o mesmo instante na transação inteira.
    const { error } = await w.service
      .from('projects')
      .update({ name: `${RUN} tie` })
      .in('id', [a.id, b.id]);
    expect(error).toBeNull();
    const all = await admin.list({ search: `${RUN} tie`, limit: 10 });
    expect(all[0]?.updated_at).toBe(all[1]?.updated_at);
    expect(all.map((r) => r.id)).toEqual([a.id, b.id].sort().reverse());
    const rest = await admin.list({
      search: `${RUN} tie`,
      limit: 10,
      before: { at: all[0]!.updated_at, id: all[0]!.id },
    });
    expect(rest.map((r) => r.id)).toEqual([all[1]!.id]);
  });

  it('"Mine" filtra pelo autor', async () => {
    await admin.insert(row('mine-admin'));
    await supabaseProjectsTable(w.as.editor).insert(row('mine-editor', undefined, 'editor'));
    const mine = await admin.list({ search: `${RUN} mine-`, ownerId: w.seeded.ids.editor, limit: 10 });
    expect(mine.map((r) => r.name)).toEqual([`${RUN} mine-editor`]);
  });

  it('lixeira: some do get/list/update, aparece na lista da lixeira, restaura com a mesma revisão', async () => {
    const { id } = await admin.insert(row('trash'));
    expect(await editor.trash(id)).toBe(true);
    expect(await editor.trash(id)).toBe(false);
    expect(await admin.get(id)).toBeUndefined();
    expect((await admin.get(id, { trashed: true }))?.deleted_at).not.toBeNull();
    expect(await admin.updateIfRevision(id, 1, { name: 'x', data: {} })).toBeUndefined();
    expect((await admin.list({ search: `${RUN} trash`, limit: 10 })).map((r) => r.id)).not.toContain(id);
    const inTrash = await admin.list({ search: `${RUN} trash`, trash: true, limit: 10 });
    expect(inTrash.map((r) => r.id)).toContain(id);
    expect(await editor.restore(id)).toBe(true);
    expect(await editor.restore(id)).toBe(false);
    expect((await admin.get(id))?.revision).toBe(1);
  });

  it('apagar de vez: só da lixeira e só admin', async () => {
    const { id } = await admin.insert(row('delete'));
    expect(await admin.delete(id)).toBe(false);
    await admin.trash(id);
    expect(await editor.delete(id)).toBe(false);
    expect(await admin.delete(id)).toBe(true);
    expect(await admin.get(id, { trashed: true })).toBeUndefined();
  });

  it('retrato na criação, sem $panelizer nem $underlay', async () => {
    const { id } = await admin.insert(
      row('revisions', { walls: [{ id: 'W1' }], $panelizer: { reading: {} }, $underlay: { image: 'data:' } }),
    );
    const list = await editor.revisions(id);
    expect(list.map((r) => r.revision)).toEqual([1]);
    expect(list[0]?.saved_by_email).toBe(ACCOUNTS.admin.email);
    const one = await editor.revision(id, 1);
    expect(one?.data).toEqual({ walls: [{ id: 'W1' }] });
    expect(await editor.revision(id, 99)).toBeUndefined();
  });

  it('conta sem time não insere (NO_TEAM) e não vê nada', async () => {
    const outsider = supabaseProjectsTable(w.as.outsider);
    const err = await outsider
      .insert({
        name: `${RUN} outsider`,
        data: {},
        owner_id: w.seeded.ids.outsider,
        owner_email: ACCOUNTS.outsider.email,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProjectsTableError);
    expect((err as ProjectsTableError).code).toBe('NO_TEAM');
    await admin.insert(row('hidden'));
    expect(await outsider.list({ search: RUN, limit: 50 })).toEqual([]);
  });
});
