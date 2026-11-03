import { describe, expect, it, vi } from 'vitest';
import type { ProjectsTable } from '@/lib/supabase/projects-table';
import type { ProjectRow } from '@/types/database';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));
const { createProject, loadProject, parseProjectData, projectName, saveProject } = await import('./projects.service');

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
    };
    const deps = { table: async () => boom };
    expect(await createProject({ name: 'x', text: TEXT }, user, deps)).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('rede caiu') });
    expect(await loadProject('p1', deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await saveProject({ id: 'p1', revision: 1, name: 'x', text: TEXT }, deps)).toMatchObject({ ok: false, reason: 'failed' });
  });
});
