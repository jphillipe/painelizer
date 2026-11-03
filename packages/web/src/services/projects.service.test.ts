import { describe, expect, it, vi } from 'vitest';
import type { ProjectsTable } from '@/lib/supabase/projects-table';
import type { ProjectRow } from '@/types/database';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));
const { createProject, deleteProject, duplicateProject, listProjects, loadProject, parseProjectData, projectName, renameProject, saveProject } = await import('./projects.service');

/** Tabela em memória com a mesma regra da gravação condicional do banco. */
function fakeTable(seed: ProjectRow[] = []) {
  const rows = new Map(seed.map((r) => [r.id, r]));
  let n = 0;
  let clock = 1_700_000_000_000;
  const stamp = () => new Date((clock += 1000)).toISOString();
  const table: ProjectsTable = {
    async insert(row) {
      const id = `p${++n}`;
      const at = stamp();
      rows.set(id, { id, owner_id: row.owner_id, owner_email: row.owner_email, name: row.name, data: row.data, revision: 1, created_at: at, updated_at: at });
      return { id, revision: 1, updated_at: at };
    },
    async get(id) {
      return rows.get(id);
    },
    async updateIfRevision(id, expected, patch) {
      const row = rows.get(id);
      if (row === undefined || row.revision !== expected) return undefined;
      const next = { ...row, ...patch, revision: expected + 1, updated_at: stamp() };
      rows.set(id, next);
      return { revision: next.revision, updated_at: next.updated_at };
    },
    async list() {
      return [...rows.values()]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(({ data, ...r }) => ({ ...r, walls: data !== null && typeof data === 'object' && !Array.isArray(data) ? (data['walls'] ?? null) : null }));
    },
    async delete(id) {
      return rows.delete(id);
    },
  };
  return { table, rows, deps: { table: async () => table } };
}
const user = { id: 'u1', email: 'a@b.c' };
const TEXT = JSON.stringify({ name: 'Casa', config: { studSpacing: 16 }, walls: [] });

describe('projects.service (S22.1)', () => {
  it('sem Supabase tudo é unconfigured e nada quebra', async () => {
    const deps = { table: async () => undefined };
    expect(await createProject({ name: 'x', text: TEXT }, user, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await loadProject('p1', deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await saveProject({ id: 'p1', revision: 1, name: 'x', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
  });

  it('cria com autor, nome normalizado e revisão 1; carrega o texto formatado de volta', async () => {
    const { deps, rows } = fakeTable();
    const created = await createProject({ name: '  Casa Ringgold  ', text: TEXT }, user, deps);
    expect(created).toMatchObject({ ok: true, id: 'p1', revision: 1 });
    expect(rows.get('p1')).toMatchObject({ owner_id: 'u1', owner_email: 'a@b.c', name: 'Casa Ringgold' });
    const loaded = await loadProject('p1', deps);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.project).toMatchObject({ id: 'p1', name: 'Casa Ringgold', revision: 1, ownerEmail: 'a@b.c' });
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
    expect(r2.get('p1')!.name).toBe('Casa');
    await createProject({ name: undefined, text: '{"walls":[]}' }, user, d2);
    expect(r2.get('p2')!.name).toBe('Untitled project');
    expect(projectName('   ')).toBe('Untitled project');
    expect(projectName('a'.repeat(300))).toHaveLength(200);
  });

  it('grava com a revisão esperada e devolve a próxima; a segunda gravação segue a cadeia', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'x', text: TEXT }, user, deps);
    const first = await saveProject({ id: 'p1', revision: 1, name: 'x', text: TEXT.replace('Casa', 'Casa 2') }, deps);
    expect(first).toMatchObject({ ok: true, revision: 2 });
    const second = await saveProject({ id: 'p1', revision: 2, name: 'Renomeada', text: TEXT }, deps);
    expect(second).toMatchObject({ ok: true, revision: 3 });
    expect(rows.get('p1')).toMatchObject({ name: 'Renomeada', revision: 3 });
  });

  it('revisão divergente é conflito com a revisão atual, sem gravar nada', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'x', text: TEXT }, user, deps);
    await saveProject({ id: 'p1', revision: 1, name: 'x', text: TEXT.replace('Casa', 'Outra pessoa') }, deps); // → 2
    const stale = await saveProject({ id: 'p1', revision: 1, name: 'x', text: TEXT.replace('Casa', 'Minha') }, deps);
    expect(stale).toMatchObject({ ok: false, reason: 'conflict', revision: 2 });
    expect(stale.ok === false && stale.message).toMatch(/edited elsewhere/);
    expect((rows.get('p1')!.data as { name: string }).name).toBe('Outra pessoa');
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
      delete: async () => {
        throw new Error('rede caiu');
      },
    };
    const deps = { table: async () => boom };
    expect(await createProject({ name: 'x', text: TEXT }, user, deps)).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('rede caiu') });
    expect(await loadProject('p1', deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await saveProject({ id: 'p1', revision: 1, name: 'x', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await listProjects(deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await renameProject({ id: 'p1', name: 'y' }, deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await duplicateProject('p1', user, deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await deleteProject('p1', deps)).toMatchObject({ ok: false, reason: 'failed' });
  });
});

describe('projects.service — lista, renomear, duplicar, apagar (S22.2)', () => {
  const WITH_WALLS = JSON.stringify({ name: 'Ringgold', config: {}, walls: [{ id: 'W01' }, { id: 'W02' }, { id: 'W03' }] });

  it('sem Supabase tudo é unconfigured', async () => {
    const deps = { table: async () => undefined };
    expect(await listProjects(deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await renameProject({ id: 'p1', name: 'y' }, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await duplicateProject('p1', user, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await deleteProject('p1', deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
  });

  it('lista do mais recente para o mais antigo, com paredes contadas e autor, sem o data', async () => {
    const { deps } = fakeTable();
    await createProject({ name: 'Antigo', text: TEXT }, user, deps);
    await createProject({ name: 'Ringgold', text: WITH_WALLS }, { id: 'u2', email: 'b@b.c' }, deps);
    const list = await listProjects(deps);
    if (!list.ok) throw new Error(list.message);
    expect(list.projects.map((p) => [p.name, p.walls, p.ownerEmail])).toEqual([
      ['Ringgold', 3, 'b@b.c'],
      ['Antigo', 0, 'a@b.c'],
    ]);
    expect(list.projects[0]).toMatchObject({ id: 'p2', revision: 1 });
    expect(list.projects[0]).not.toHaveProperty('data');
    // Gravar o antigo o traz para o topo.
    await saveProject({ id: 'p1', revision: 1, name: 'Antigo', text: TEXT }, deps);
    const again = await listProjects(deps);
    expect(again.ok && again.projects.map((p) => p.name)).toEqual(['Antigo', 'Ringgold']);
  });

  it('renomear troca o nome da linha e o do arquivo, sobe a revisão e recusa nome vazio', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'Casa', text: TEXT }, user, deps);
    const renamed = await renameProject({ id: 'p1', name: '  Casa Nova  ' }, deps);
    expect(renamed).toMatchObject({ ok: true, name: 'Casa Nova', revision: 2 });
    const row = rows.get('p1')!;
    expect(row.name).toBe('Casa Nova');
    expect((row.data as { name: string; config: unknown }).name).toBe('Casa Nova');
    expect((row.data as { config: unknown }).config).toEqual({ studSpacing: 16 }); // o resto do arquivo fica
    // O editor aberto com a revisão 1 agora vê conflito: o nome novo não é sobrescrito.
    expect(await saveProject({ id: 'p1', revision: 1, name: 'Casa', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'conflict', revision: 2 });
    expect(await renameProject({ id: 'p1', name: '   ' }, deps)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await renameProject({ id: 'p1', name: 'a'.repeat(201) }, deps)).toMatchObject({ ok: false, reason: 'invalid' });
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
    expect(await renameProject({ id: 'p1', name: 'Depois' }, deps)).toMatchObject({ ok: true, revision: 3 });
    bumps = Number.POSITIVE_INFINITY;
    expect(await renameProject({ id: 'p1', name: 'Nunca' }, deps)).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('edited right now') });
  });

  it('duplicar cria "Copy of" com o mesmo conteúdo, nome dentro do arquivo e o autor de quem duplicou', async () => {
    const { deps, rows } = fakeTable();
    await createProject({ name: 'Ringgold', text: WITH_WALLS }, user, deps);
    const copy = await duplicateProject('p1', { id: 'u2', email: 'b@b.c' }, deps);
    expect(copy).toMatchObject({ ok: true, id: 'p2', name: 'Copy of Ringgold' });
    const row = rows.get('p2')!;
    expect(row).toMatchObject({ name: 'Copy of Ringgold', owner_id: 'u2', owner_email: 'b@b.c', revision: 1 });
    expect(row.data).toEqual({ ...JSON.parse(WITH_WALLS), name: 'Copy of Ringgold' });
    expect(rows.get('p1')!.data).toEqual(JSON.parse(WITH_WALLS)); // o original fica igual
    expect(await duplicateProject('p1', undefined, deps)).toMatchObject({ ok: false, reason: 'signed_out' });
    expect(await duplicateProject('nope', user, deps)).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('apagar some da lista; apagar de novo é not_found; gravar depois é not_found', async () => {
    const { deps } = fakeTable();
    await createProject({ name: 'Casa', text: TEXT }, user, deps);
    expect(await deleteProject('p1', deps)).toEqual({ ok: true });
    expect(await listProjects(deps)).toEqual({ ok: true, projects: [] });
    expect(await deleteProject('p1', deps)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await saveProject({ id: 'p1', revision: 1, name: 'Casa', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'not_found' });
  });
});

