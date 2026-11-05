/**
 * `supabaseDrawingsStore` contra o Storage local (S33): o bucket `drawings` e as políticas de `storage.objects`
 * (só quem está num time; por decisão da S32, qualquer time — o caminho não leva o time).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DRAWINGS_BUCKET } from '../src/lib/drawings';
import { supabaseDrawingsStore, DrawingsStoreError } from '../src/lib/supabase/drawings-store';
import { RUN, skip, world, type World } from './setup';

const PDF = new TextEncoder().encode('%PDF-1.4\n%panelizer integration\n');

describe.skipIf(skip)('drawings-store (Supabase local)', () => {
  let w: World;
  const folder = `${RUN}-drawings`;
  const upload = async (as: World['as'][keyof World['as']], path: string) =>
    as.storage.from(DRAWINGS_BUCKET).upload(path, PDF, { contentType: 'application/pdf' });

  beforeAll(async () => {
    w = await world();
  });
  afterAll(async () => {
    if (w === undefined) return;
    const { data } = await w.service.storage.from(DRAWINGS_BUCKET).list(folder);
    const copies = await w.service.storage.from(DRAWINGS_BUCKET).list(`${folder}-copy`);
    const paths = [
      ...(data ?? []).map((o) => `${folder}/${o.name}`),
      ...(copies.data ?? []).map((o) => `${folder}-copy/${o.name}`),
    ];
    if (paths.length > 0) await w.service.storage.from(DRAWINGS_BUCKET).remove(paths);
  });

  it('membro sobe; list, download, copy e remove pelo adaptador', async () => {
    expect((await upload(w.as.editor, `${folder}/a.pdf`)).error).toBeNull();
    expect((await upload(w.as.editor, `${folder}/b.pdf`)).error).toBeNull();
    const store = supabaseDrawingsStore(w.as.admin);
    expect((await store.list(`${folder}/`)).sort()).toEqual([`${folder}/a.pdf`, `${folder}/b.pdf`]);
    expect(await store.download(`${folder}/a.pdf`)).toEqual(PDF);
    await store.copy(`${folder}/a.pdf`, `${folder}-copy/a.pdf`);
    expect(await store.list(`${folder}-copy`)).toEqual([`${folder}-copy/a.pdf`]);
    await store.remove([`${folder}/b.pdf`, `${folder}/missing.pdf`]);
    expect(await store.list(folder)).toEqual([`${folder}/a.pdf`]);
    await store.remove([]);
  });

  it('download de caminho inexistente lança DrawingsStoreError', async () => {
    const err = await supabaseDrawingsStore(w.as.admin)
      .download(`${folder}/nope.pdf`)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DrawingsStoreError);
  });

  it('conta sem time: não sobe, não lista, não baixa', async () => {
    expect((await upload(w.as.outsider, `${folder}/outsider.pdf`)).error).not.toBeNull();
    await upload(w.as.admin, `${folder}/team.pdf`);
    const outsider = supabaseDrawingsStore(w.as.outsider);
    expect(await outsider.list(folder)).toEqual([]);
    await expect(outsider.download(`${folder}/team.pdf`)).rejects.toBeInstanceOf(DrawingsStoreError);
  });

  it('outro time lê (o bucket é por "está num time", decisão da S32)', async () => {
    await upload(w.as.admin, `${folder}/shared.pdf`);
    expect(await supabaseDrawingsStore(w.as.rival).download(`${folder}/shared.pdf`)).toEqual(PDF);
  });

  it('o bucket recusa tipo fora da lista (só PDF e imagens)', async () => {
    const { error } = await w.as.editor.storage
      .from(DRAWINGS_BUCKET)
      .upload(`${folder}/notes.txt`, new TextEncoder().encode('x'), { contentType: 'text/plain' });
    expect(error).not.toBeNull();
  });
});
