import { describe, expect, it, vi } from 'vitest';
import { ProjectsTableError, type ProjectsTable } from '@/lib/supabase/projects-table';
import type { ProjectRevisionRow, ProjectRow } from '@/types/database';
import type { Json } from '@/types/json';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));
import type { DrawingsStore } from '@/lib/supabase/drawings-store';

/** Bucket em memória: caminho → bytes. */
function fakeStore(seed: Record<string, number[]> = {}) {
  const objects = new Map(Object.entries(seed).map(([k, v]) => [k, new Uint8Array(v)]));
  const store: DrawingsStore = {
    async download(path) {
      const b = objects.get(path);
      if (b === undefined) throw new Error(`not found: ${path}`);
      return b;
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(`${prefix}/`));
    },
    async remove(paths) {
      for (const p of paths) objects.delete(p);
    },
    async copy(from, to) {
      const b = objects.get(from);
      if (b === undefined) throw new Error(`not found: ${from}`);
      objects.set(to, b);
    },
  };
  return { store, objects, deps: { store: async () => store } };
}
const { createProject, deleteProject, duplicateProject, listProjects, listRevisions, loadProject, PAGE_SIZE, parseProjectData, projectName, renameProject, restoreProject, restoreRevision, saveProject, trashProject } = await import('./projects.service');

/** Tabela em memória com a mesma regra da gravação condicional do banco, a lixeira e os retratos (S32). */
function fakeTable(seed: ProjectRow[] = []) {
  const rows = new Map(seed.map((r) => [r.id, r]));
  const snaps: ProjectRevisionRow[] = [];
  let n = 0;
  let clock = 1_700_000_000_000;
  const stamp = () => new Date((clock += 1000)).toISOString();
  const snapshot = (row: ProjectRow) => {
    if (row.revision !== 1 && row.revision % 20 !== 0) return;
    const { $panelizer: _p, $underlay: _u, ...data } = row.data as Record<string, Json>;
    snaps.push({ id: snaps.length + 1, project_id: row.id, team_id: 't1', revision: row.revision, name: row.name, data, saved_by: row.owner_id, saved_by_email: row.owner_email, created_at: stamp() });
  };
  const table: ProjectsTable = {
    async insert(row) {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      const at = stamp();
      const full: ProjectRow = { id, owner_id: row.owner_id, owner_email: row.owner_email, name: row.name, data: row.data, revision: 1, created_at: at, updated_at: at, team_id: 't1', updated_by: row.owner_id, updated_by_email: row.owner_email, deleted_at: null, deleted_by: null };
      rows.set(id, full);
      snapshot(full);
      return { id, revision: 1, updated_at: at };
    },
    async get(id, options) {
      const row = rows.get(id);
      return row === undefined || (row.deleted_at !== null && options?.trashed !== true) ? undefined : row;
    },
    async updateIfRevision(id, expected, patch) {
      const row = rows.get(id);
      if (row === undefined || row.revision !== expected || row.deleted_at !== null) return undefined;
      const next = { ...row, ...patch, revision: expected + 1, updated_at: stamp() };
      rows.set(id, next);
      snapshot(next);
      return { revision: next.revision, updated_at: next.updated_at };
    },
    async list({ search, ownerId, trash = false, before, limit }) {
      const key = trash ? 'deleted_at' : 'updated_at';
      return [...rows.values()]
        .filter((r) => (trash ? r.deleted_at !== null : r.deleted_at === null))
        .filter((r) => search === undefined || r.name.toLowerCase().includes(search.toLowerCase()))
        .filter((r) => ownerId === undefined || r.owner_id === ownerId)
        .sort((a, b) => (b[key] ?? '').localeCompare(a[key] ?? '') || b.id.localeCompare(a.id))
        .filter((r) => before === undefined || (r[key] ?? '') < before.at || ((r[key] ?? '') === before.at && r.id < before.id))
        .slice(0, limit)
        .map(({ data, ...r }) => ({ ...r, walls: data !== null && typeof data === 'object' && !Array.isArray(data) ? (data['walls'] ?? null) : null }));
    },
    async trash(id) {
      const row = rows.get(id);
      if (row === undefined || row.deleted_at !== null) return false;
      rows.set(id, { ...row, deleted_at: stamp() });
      return true;
    },
    async restore(id) {
      const row = rows.get(id);
      if (row === undefined || row.deleted_at === null) return false;
      rows.set(id, { ...row, deleted_at: null });
      return true;
    },
    async delete(id) {
      const row = rows.get(id);
      if (row === undefined || row.deleted_at === null || !admin.yes) return false;
      return rows.delete(id);
    },
    async revisions(projectId) {
      return snaps
        .filter((r) => r.project_id === projectId)
        .sort((a, b) => b.revision - a.revision)
        .map((r) => ({ revision: r.revision, name: r.name, saved_by_email: r.saved_by_email, created_at: r.created_at }));
    },
    async revision(projectId, revision) {
      return snaps.find((r) => r.project_id === projectId && r.revision === revision);
    },
  };
  /** A RLS de "apagar de vez": só admin. */
  const admin = { yes: true };
  return { table, rows, snaps, admin, deps: { table: async () => table } };
}
/** Id da n-ésima linha do fake. */
const pid = (k: number) => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`;
const user = { id: 'u1', email: 'a@b.c' };
const TEXT = JSON.stringify({ name: 'Casa', config: { studSpacing: 16 }, walls: [] });

describe('projects.service (S22.1)', () => {
  it('sem Supabase tudo é unconfigured e nada quebra', async () => {
    const deps = { table: async () => undefined };
    expect(await createProject({ name: 'x', text: TEXT }, user, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await loadProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await saveProject({ id: pid(1), revision: 1, name: 'x', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
  });

  it('cria com autor, nome normalizado e revisão 1; carrega o texto formatado de volta', async () => {
    const { deps, rows } = fakeTable();
    const created = await createProject({ name: '  Casa Ringgold  ', text: TEXT }, user, deps);
    expect(created).toMatchObject({ ok: true, id: pid(1), revision: 1 });
    expect(rows.get(pid(1))).toMatchObject({ owner_id: 'u1', owner_email: 'a@b.c', name: 'Casa Ringgold' });
    const loaded = await loadProject(pid(1), deps);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.project).toMatchObject({ id: pid(1), name: 'Casa Ringgold', revision: 1, ownerEmail: 'a@b.c' });
    expect(JSON.parse(loaded.project.text)).toEqual(JSON.parse(TEXT));
    expect(loaded.project.text).toContain('\n'); // formatado como o arquivo
  });

  it('exige usuário e um objeto JSON', async () => {
    const { deps } = fakeTable();
    expect(await createProject({ name: 'x', text: TEXT }, undefined, deps)).toMatchObject({ ok: false, reason: 'signed_out' });
    expect(await createProject({ name: 'x', text: 'not json' }, user, deps)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await createProject({ name: 'x', text: '[1,2]' }, user, deps)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseProjectData('null')).toMatchObject({ ok: false });
    expect(projectName(undefined)).toBe('Untitled project');
    // Sem nome da tela, o nome é o do arquivo (S22.2); sem nome no arquivo, "Untitled project".
    const { deps: d2, rows: r2 } = fakeTable();
    await createProject({ name: undefined, text: TEXT }, user, d2);
    expect(r2.get(pid(1))!.name).toBe('Casa');
    await createProject({ name: undefined, text: '{"walls":[]}' }, user, d2);
    expect(r2.get(pid(2))!.name).toBe('Untitled project');
    expect(projectName('   ')).toBe('Untitled project');
    expect(projectName('a'.repeat(300))).toHaveLength(200);
  });

  it('grava com a revisão esperada e devolve a próxima; a segunda gravação segue a cadeia', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'x', text: TEXT }, user, deps);
    const first = await saveProject({ id: pid(1), revision: 1, name: 'x', text: TEXT.replace('Casa', 'Casa 2') }, deps);
    expect(first).toMatchObject({ ok: true, revision: 2 });
    const second = await saveProject({ id: pid(1), revision: 2, name: 'Renomeada', text: TEXT }, deps);
    expect(second).toMatchObject({ ok: true, revision: 3 });
    expect(rows.get(pid(1))).toMatchObject({ name: 'Renomeada', revision: 3 });
  });

  it('revisão divergente é conflito com a revisão atual, sem gravar nada', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'x', text: TEXT }, user, deps);
    await saveProject({ id: pid(1), revision: 1, name: 'x', text: TEXT.replace('Casa', 'Outra pessoa') }, deps); // → 2
    const stale = await saveProject({ id: pid(1), revision: 1, name: 'x', text: TEXT.replace('Casa', 'Minha') }, deps);
    expect(stale).toMatchObject({ ok: false, reason: 'conflict', revision: 2 });
    expect(stale.ok === false && stale.message).toMatch(/edited elsewhere/);
    expect((rows.get(pid(1))!.data as { name: string }).name).toBe('Outra pessoa');
  });

  it('projeto apagado: not_found ao carregar e ao gravar', async () => {
    const { deps } = fakeTable();
    expect(await loadProject('nope', deps)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await saveProject({ id: 'nope', revision: 1, name: 'x', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('erro da tabela vira failed com a mensagem, nunca exceção', async () => {
    const boom: ProjectsTable = {
      insert: async () => {
        throw new Error('rede caiu');
      },
      get: async () => {
        throw new Error('rede caiu');
      },
      updateIfRevision: async () => {
        throw new Error('rede caiu');
      },
      list: async () => {
        throw new Error('rede caiu');
      },
      trash: async () => {
        throw new Error('rede caiu');
      },
      restore: async () => {
        throw new Error('rede caiu');
      },
      delete: async () => {
        throw new Error('rede caiu');
      },
      revisions: async () => {
        throw new Error('rede caiu');
      },
      revision: async () => {
        throw new Error('rede caiu');
      },
    };
    const deps = { table: async () => boom };
    expect(await createProject({ name: 'x', text: TEXT }, user, deps)).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('rede caiu') });
    expect(await loadProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await saveProject({ id: pid(1), revision: 1, name: 'x', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await listProjects({}, user, deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await renameProject({ id: pid(1), name: 'y' }, deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await duplicateProject(pid(1), user, deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await deleteProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'failed' });
  });
});

describe('projects.service — lista, renomear, duplicar, apagar (S22.2)', () => {
  const WITH_WALLS = JSON.stringify({ name: 'Ringgold', config: {}, walls: [{ id: 'W01' }, { id: 'W02' }, { id: 'W03' }] });

  it('sem Supabase tudo é unconfigured', async () => {
    const deps = { table: async () => undefined };
    expect(await listProjects({}, user, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await renameProject({ id: pid(1), name: 'y' }, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await duplicateProject(pid(1), user, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await deleteProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
  });

  it('lista do mais recente para o mais antigo, com paredes contadas e autor, sem o data', async () => {
    const { deps } = fakeTable();
    await createProject({ name: 'Antigo', text: TEXT }, user, deps);
    await createProject({ name: 'Ringgold', text: WITH_WALLS }, { id: 'u2', email: 'b@b.c' }, deps);
    const list = await listProjects({}, user, deps);
    if (!list.ok) throw new Error(list.message);
    expect(list.projects.map((p) => [p.name, p.walls, p.ownerEmail])).toEqual([
      ['Ringgold', 3, 'b@b.c'],
      ['Antigo', 0, 'a@b.c'],
    ]);
    expect(list.projects[0]).toMatchObject({ id: pid(2), revision: 1 });
    expect(list.projects[0]).not.toHaveProperty('data');
    // Gravar o antigo o traz para o topo.
    await saveProject({ id: pid(1), revision: 1, name: 'Antigo', text: TEXT }, deps);
    const again = await listProjects({}, user, deps);
    expect(again.ok && again.projects.map((p) => p.name)).toEqual(['Antigo', 'Ringgold']);
  });

  it('renomear troca o nome da linha e o do arquivo, sobe a revisão e recusa nome vazio', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'Casa', text: TEXT }, user, deps);
    const renamed = await renameProject({ id: pid(1), name: '  Casa Nova  ' }, deps);
    expect(renamed).toMatchObject({ ok: true, name: 'Casa Nova', revision: 2 });
    const row = rows.get(pid(1))!;
    expect(row.name).toBe('Casa Nova');
    expect((row.data as { name: string; config: unknown }).name).toBe('Casa Nova');
    expect((row.data as { config: unknown }).config).toEqual({ studSpacing: 16 }); // o resto do arquivo fica
    // O editor aberto com a revisão 1 agora vê conflito: o nome novo não é sobrescrito.
    expect(await saveProject({ id: pid(1), revision: 1, name: 'Casa', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'conflict', revision: 2 });
    expect(await renameProject({ id: pid(1), name: '   ' }, deps)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await renameProject({ id: pid(1), name: 'a'.repeat(201) }, deps)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await renameProject({ id: 'nope', name: 'x' }, deps)).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('renomear tenta de novo quando alguém grava no meio, e desiste depois de três vezes', async () => {
    const { deps, table, rows } = fakeTable();
    await createProject({ name: 'Casa', text: TEXT }, user, deps);
    // Alguém grava entre o get e o update, uma vez.
    const realGet = table.get.bind(table);
    let bumps = 1;
    table.get = async (id) => {
      const row = await realGet(id);
      if (row !== undefined && bumps > 0) {
        bumps--;
        rows.set(id, { ...row, revision: row.revision + 1 });
      }
      return row;
    };
    expect(await renameProject({ id: pid(1), name: 'Depois' }, deps)).toMatchObject({ ok: true, revision: 3 });
    bumps = Number.POSITIVE_INFINITY;
    expect(await renameProject({ id: pid(1), name: 'Nunca' }, deps)).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('edited right now') });
  });

  it('duplicar cria "Copy of" com o mesmo conteúdo, nome dentro do arquivo e o autor de quem duplicou', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'Ringgold', text: WITH_WALLS }, user, deps);
    const copy = await duplicateProject(pid(1), { id: 'u2', email: 'b@b.c' }, deps);
    expect(copy).toMatchObject({ ok: true, id: pid(2), name: 'Copy of Ringgold' });
    const row = rows.get(pid(2))!;
    expect(row).toMatchObject({ name: 'Copy of Ringgold', owner_id: 'u2', owner_email: 'b@b.c', revision: 1 });
    expect(row.data).toEqual({ ...JSON.parse(WITH_WALLS), name: 'Copy of Ringgold' });
    expect(rows.get(pid(1))!.data).toEqual(JSON.parse(WITH_WALLS)); // o original fica igual
    expect(await duplicateProject(pid(1), undefined, deps)).toMatchObject({ ok: false, reason: 'signed_out' });
    expect(await duplicateProject('nope', user, deps)).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('apagar leva a pasta de desenhos junto; duplicar copia os objetos para uma pasta nova (S22.3)', async () => {
    const { deps: tableDeps } = fakeTable();
    const { objects, deps: drawingsDeps } = fakeStore({ 'u1/A.pdf': [1, 2], 'u1/B.png': [3], 'other/C.pdf': [4] });
    const deps = { ...tableDeps, drawings: drawingsDeps };
    const withDrawings = JSON.stringify({
      name: 'Casa',
      walls: [],
      $panelizer: { version: 1, reading: { projectName: 'Casa', drawings: [{ name: 'A.pdf', path: 'u1/A.pdf', size: 2, type: 'application/pdf' }, { name: 'B.png', path: 'u1/B.png', size: 1, type: 'image/png' }] } },
    });
    await createProject({ name: 'Casa', text: withDrawings }, user, deps);
    const copy = await duplicateProject(pid(1), user, deps);
    expect(copy).toMatchObject({ ok: true, id: pid(2) });
    const loaded = await loadProject(pid(2), deps);
    if (!loaded.ok) throw new Error(loaded.message);
    const copied = (JSON.parse(loaded.project.text) as { $panelizer: { reading: { drawings: { path: string }[] } } }).$panelizer.reading.drawings.map((d) => d.path);
    expect(copied).toHaveLength(2);
    expect(copied[0]).not.toBe('u1/A.pdf');
    expect(copied[0]!.endsWith('/A.pdf')).toBe(true);
    expect(objects.size).toBe(5); // 3 originais + 2 cópias
    expect(await trashProject(pid(1), deps)).toEqual({ ok: true });
    expect(objects.size).toBe(5); // a lixeira não apaga desenhos
    expect(await deleteProject(pid(1), deps)).toEqual({ ok: true });
    expect([...objects.keys()].filter((k) => k.startsWith('u1/'))).toEqual([]);
    expect(objects.has('other/C.pdf')).toBe(true);
    expect(objects.size).toBe(3); // a cópia continua com os dela
  });

  it('lixeira (S32): some da lista, não abre, não grava; restaurar devolve; apagar de vez só da lixeira e só admin', async () => {
    const { deps, admin } = fakeTable();
    await createProject({ name: 'Casa', text: TEXT }, user, deps);
    expect(await deleteProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'not_found', message: 'Move the project to the trash first.' });
    expect(await trashProject(pid(1), deps)).toEqual({ ok: true });
    expect(await trashProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await listProjects({}, user, deps)).toEqual({ ok: true, projects: [] });
    const trash = await listProjects({ trash: true }, user, deps);
    expect(trash.ok && trash.projects.map((p) => [p.name, p.deletedAt !== null])).toEqual([['Casa', true]]);
    expect(await loadProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await saveProject({ id: pid(1), revision: 1, name: 'Casa', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'not_found', message: expect.stringContaining('trash') });
    expect(await restoreProject(pid(1), deps)).toEqual({ ok: true });
    expect(await restoreProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await saveProject({ id: pid(1), revision: 1, name: 'Casa', text: TEXT }, deps)).toMatchObject({ ok: true, revision: 2 });
    await trashProject(pid(1), deps);
    admin.yes = false;
    expect(await deleteProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'not_found', message: 'Only a team admin can delete projects for good.' });
    admin.yes = true;
    expect(await deleteProject(pid(1), deps)).toEqual({ ok: true });
    expect(await deleteProject(pid(1), deps)).toMatchObject({ ok: false, reason: 'not_found', message: 'This project was already deleted.' });
  });
});

describe('projects.service — busca, "mine", páginas, histórico e time (S32)', () => {
  it('busca no nome sem diferença de maiúsculas, "mine" filtra pelo autor, página de 50 com cursor', async () => {
    const { deps } = fakeTable();
    const other = { id: 'u2', email: 'b@b.c' };
    for (let k = 0; k < PAGE_SIZE + 5; k++) await createProject({ name: k % 2 === 0 ? `Casa ${k}` : `Galpão ${k}`, text: TEXT }, k < 3 ? other : user, deps);
    const first = await listProjects({}, user, deps);
    if (!first.ok) throw new Error(first.message);
    expect(first.projects).toHaveLength(PAGE_SIZE);
    expect(first.next).toBeDefined();
    const second = await listProjects({ before: first.next }, user, deps);
    if (!second.ok) throw new Error(second.message);
    expect(second.projects).toHaveLength(5);
    expect(second.next).toBeUndefined();
    expect(new Set([...first.projects, ...second.projects].map((p) => p.id)).size).toBe(PAGE_SIZE + 5);
    const casas = await listProjects({ search: '  CASA ' }, user, deps);
    expect(casas.ok && casas.projects.every((p) => p.name.startsWith('Casa'))).toBe(true);
    expect(casas.ok && casas.projects.length).toBe(28);
    const mine = await listProjects({ mine: true }, other, deps);
    expect(mine.ok && mine.projects.map((p) => p.ownerEmail)).toEqual(['b@b.c', 'b@b.c', 'b@b.c']);
    expect(await listProjects({ before: 'lixo' }, user, deps)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('histórico: retrato na criação e a cada 20 gravações; restaurar vira projeto novo com a leitura e a planta atuais', async () => {
    const { deps, rows } = fakeTable();
    const text = JSON.stringify({ name: 'Casa', walls: [{ id: 'W01' }], $panelizer: { version: 1, reading: { projectName: 'Casa' } }, $underlay: { image: 'data:old' } });
    await createProject({ name: 'Casa', text }, user, deps);
    let revision = 1;
    for (let k = 0; k < 20; k++) {
      const walls = Array.from({ length: k + 2 }, (_, i) => ({ id: `W${i}` }));
      const saved = await saveProject({ id: pid(1), revision, name: 'Casa', text: JSON.stringify({ name: 'Casa', walls, $panelizer: { version: 1, reading: { projectName: 'Casa' } }, $underlay: { image: 'data:new' } }) }, deps);
      if (!saved.ok) throw new Error(saved.message);
      revision = saved.revision;
    }
    const history = await listRevisions(pid(1), deps);
    expect(history.ok && history.revisions.map((r) => r.revision)).toEqual([20, 1]);
    const restored = await restoreRevision({ id: pid(1), revision: 1 }, { id: 'u2', email: 'b@b.c' }, deps);
    expect(restored).toMatchObject({ ok: true, name: 'Casa (revision 1)' });
    const row = rows.get(pid(2))!;
    expect(row).toMatchObject({ owner_email: 'b@b.c', name: 'Casa (revision 1)' });
    expect(row.data).toEqual({ name: 'Casa (revision 1)', walls: [{ id: 'W01' }], $panelizer: { version: 1, reading: { projectName: 'Casa' } }, $underlay: { image: 'data:new' } });
    expect(await restoreRevision({ id: pid(1), revision: 7 }, user, deps)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await restoreRevision({ id: pid(1), revision: 1 }, undefined, deps)).toMatchObject({ ok: false, reason: 'signed_out' });
    expect(await listRevisions(pid(1), { table: async () => undefined })).toMatchObject({ ok: false, reason: 'unconfigured' });
  });

  it('conta sem time: criar e duplicar dizem para pedir a um admin', async () => {
    const { table, deps } = fakeTable();
    await createProject({ name: 'Casa', text: TEXT }, user, deps);
    table.insert = async () => {
      throw new ProjectsTableError('null value in column "team_id"', 'NO_TEAM');
    };
    expect(await createProject({ name: 'x', text: TEXT }, user, deps)).toMatchObject({ ok: false, reason: 'no_team', message: expect.stringContaining('team admin') });
    expect(await duplicateProject(pid(1), user, deps)).toMatchObject({ ok: false, reason: 'no_team' });
  });
});

