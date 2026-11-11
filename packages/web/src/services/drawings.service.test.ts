import { describe, expect, it, vi } from 'vitest';
import type { DrawingsStore } from '@/lib/supabase/drawings-store';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));
const { copyDrawings, createDownloadCache, downloadDrawings, removeDrawings } = await import('./drawings.service');

function fakeStore(seed: Record<string, number[]>) {
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
const refs = [
  { name: 'A 100.pdf', path: 'u1/A_100.pdf', size: 2, type: 'application/pdf' },
  { name: 'foto.png', path: 'u1/foto.png', size: 1, type: 'image/png' },
];

describe('drawings.service (S22.3)', () => {
  it('sem Supabase: baixar é unconfigured, apagar e copiar não fazem nada', async () => {
    const deps = { store: async () => undefined };
    expect(await downloadDrawings(refs, deps)).toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(await removeDrawings(refs, deps)).toBe(true);
    expect(await copyDrawings(refs, deps)).toEqual(refs);
  });

  it('baixa na ordem pedida com o nome e o tipo do humano; objeto que falta é failed com o nome', async () => {
    const { deps } = fakeStore({ 'u1/A_100.pdf': [1, 2], 'u1/foto.png': [3] });
    const r = await downloadDrawings(refs, deps);
    if (!r.ok) throw new Error(r.message);
    expect(r.files.map((f) => [f.name, f.type, [...f.bytes]])).toEqual([
      ['A 100.pdf', 'application/pdf', [1, 2]],
      ['foto.png', 'image/png', [3]],
    ]);
    const missing = await downloadDrawings([{ name: 'B.pdf', path: 'u1/B.pdf', size: 1, type: '' }], deps);
    expect(missing).toMatchObject({ ok: false, reason: 'failed', message: expect.stringContaining('B.pdf') });
  });

  it('cache por usuário: prévia e leitura do mesmo envio baixam do Storage uma vez só', async () => {
    const { store } = fakeStore({ 'u1/A_100.pdf': [1, 2], 'u1/foto.png': [3] });
    const download = vi.spyOn(store, 'download');
    let t = 0;
    const cache = createDownloadCache({ maxBytes: 100, ttlMs: 1000, now: () => t });
    const deps = { store: async () => store, cache };
    await downloadDrawings(refs, deps, 'ana');
    const again = await downloadDrawings(refs, deps, 'ana');
    expect(download).toHaveBeenCalledTimes(2); // um por arquivo, só na primeira
    if (!again.ok) throw new Error(again.message);
    expect(again.files.map((f) => [...f.bytes])).toEqual([[1, 2], [3]]);
    await downloadDrawings(refs, deps, 'bia'); // outro usuário passa pela RLS de novo
    expect(download).toHaveBeenCalledTimes(4);
    await downloadDrawings(refs, deps); // sem usuário, sem cache
    expect(download).toHaveBeenCalledTimes(6);
    t = 1001; // venceu
    await downloadDrawings(refs, deps, 'ana');
    expect(download).toHaveBeenCalledTimes(8);
  });

  it('cache respeita o teto de bytes: sai o mais antigo, e objeto maior que o teto não entra', () => {
    const cache = createDownloadCache({ maxBytes: 4, ttlMs: 1000, now: () => 0 });
    cache.set('k1', new Uint8Array(2));
    cache.set('k2', new Uint8Array(2));
    cache.get('k1'); // usado agora: o mais antigo passa a ser k2
    cache.set('k3', new Uint8Array(2));
    expect([cache.get('k1')?.length, cache.get('k2'), cache.get('k3')?.length]).toEqual([2, undefined, 2]);
    cache.set('big', new Uint8Array(5));
    expect(cache.get('big')).toBeUndefined();
    expect(cache.get('k1')?.length).toBe(2);
  });

  it('apagar limpa a pasta inteira (também o que a lista não cita) e deixa as outras; erro vira false', async () => {
    const { deps, objects } = fakeStore({ 'u1/A_100.pdf': [1], 'u1/foto.png': [2], 'u1/extra.pdf': [3], 'u2/x.pdf': [4] });
    expect(await removeDrawings([refs[0]!], deps)).toBe(true);
    expect([...objects.keys()]).toEqual(['u2/x.pdf']);
    const boom: DrawingsStore = { ...deps.store === undefined ? ({} as DrawingsStore) : await deps.store()!, list: async () => { throw new Error('rede'); } };
    expect(await removeDrawings(refs, { store: async () => boom })).toBe(false);
  });

  it('copiar põe os objetos numa pasta nova e devolve as referências apontando para ela', async () => {
    const { deps, objects } = fakeStore({ 'u1/A_100.pdf': [1, 2], 'u1/foto.png': [3] });
    const copy = await copyDrawings(refs, deps);
    expect(copy.map((c) => c.name)).toEqual(['A 100.pdf', 'foto.png']);
    const folder = copy[0]!.path.split('/')[0]!;
    expect(folder).not.toBe('u1');
    expect(copy.map((c) => c.path)).toEqual([`${folder}/A_100.pdf`, `${folder}/foto.png`]);
    expect([...objects.get(`${folder}/A_100.pdf`)!]).toEqual([1, 2]);
    expect(objects.size).toBe(4);
  });
});
