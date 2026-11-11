// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O cliente do Supabase no navegador vira um bucket em memória: só interessa o que o hook faz com ele.
const objects = new Map<string, File>();
let failOn: string | undefined;
const upload = vi.fn(async (path: string, file: File) => {
  if (failOn !== undefined && path.endsWith(failOn)) return { error: { message: 'quota' } };
  objects.set(path, file);
  return { error: null };
});
const remove = vi.fn(async (paths: string[]) => {
  for (const p of paths) objects.delete(p);
  return { error: null };
});
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ storage: { from: () => ({ upload, remove }) } }) }));

const { useDrawingsUpload } = await import('./use-drawings-upload');
const env = { url: 'https://x.supabase.co', key: 'sb_publishable_x' };
const file = (name: string, size = 3, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type, lastModified: 1 });

beforeEach(() => {
  objects.clear();
  failOn = undefined;
  upload.mockClear();
  remove.mockClear();
});
afterEach(cleanup);

describe('useDrawingsUpload (S22.3)', () => {
  it('lista recriada a cada render com os mesmos arquivos não reinicia os uploads', async () => {
    const { result } = renderHook(() => useDrawingsUpload(env, [file('a.pdf')]));
    await waitFor(() => expect(result.current.refs).toHaveLength(1));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('refs mantêm a identidade entre renders (a prévia depende delas e não pode rodar em laço)', async () => {
    const { result, rerender } = renderHook(() => useDrawingsUpload(env, [file('a.pdf')]));
    await waitFor(() => expect(result.current.refs).toHaveLength(1));
    const first = result.current.refs;
    rerender();
    rerender();
    expect(result.current.refs).toBe(first);
  });

  it('sem Storage não sobe nada e não está habilitado', () => {
    const { result } = renderHook(() => useDrawingsUpload(undefined, [file('a.pdf')]));
    expect(result.current).toMatchObject({ enabled: false, refs: undefined, uploading: undefined });
    expect(upload).not.toHaveBeenCalled();
  });

  it('sobe cada arquivo numa pasta da sessão, um por vez, e devolve os caminhos na ordem dos arquivos', async () => {
    const a = file('A 100.pdf');
    const b = file('foto.png', 2, 'image/png');
    const { result } = renderHook(({ files }: { files: File[] }) => useDrawingsUpload(env, files), { initialProps: { files: [a, b] } });
    expect(result.current.enabled).toBe(true);
    await waitFor(() => expect(result.current.refs).toBeDefined());
    const refs = result.current.refs!;
    expect(refs.map((r) => r.name)).toEqual(['A 100.pdf', 'foto.png']);
    const folder = refs[0]!.path.split('/')[0]!;
    expect(refs.map((r) => r.path)).toEqual([`${folder}/A_100.pdf`, `${folder}/foto.png`]);
    expect(refs[1]).toMatchObject({ size: 2, type: 'image/png' });
    expect(upload).toHaveBeenCalledTimes(2);
    expect((upload.mock.calls[1] as unknown[])[2]).toMatchObject({ upsert: true, contentType: 'image/png' });
    expect(result.current.uploading).toBeUndefined();
  });

  it('arquivo que entra depois sobe sozinho; o que sai é apagado do bucket; mesmo nome seguro ganha sufixo', async () => {
    const a = file('a.pdf');
    const { result, rerender } = renderHook(({ files }: { files: File[] }) => useDrawingsUpload(env, files), { initialProps: { files: [a] } });
    await waitFor(() => expect(result.current.refs).toHaveLength(1));
    const folder = result.current.refs![0]!.path.split('/')[0]!;
    const twin = file('a (1).pdf'); // nome seguro "a_1_.pdf" ≠ "a.pdf"; o sufixo é para colisão real
    const same = file('a.pdf', 9); // mesmo nome, outro arquivo: colide em "a.pdf"
    rerender({ files: [a, twin, same] });
    await waitFor(() => expect(result.current.refs).toHaveLength(3));
    expect(result.current.refs!.map((r) => r.path)).toEqual([`${folder}/a.pdf`, `${folder}/a_1_.pdf`, `${folder}/a-2.pdf`]);
    expect(upload).toHaveBeenCalledTimes(3);
    rerender({ files: [twin] });
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(remove.mock.calls[0]![0]).toEqual([`${folder}/a.pdf`, `${folder}/a-2.pdf`]);
    await waitFor(() => expect(result.current.refs).toEqual([{ name: 'a (1).pdf', path: `${folder}/a_1_.pdf`, size: 3, type: 'application/pdf' }]));
  });

  it('falha no upload: erro com o nome, refs indefinidas, e "retry" tenta de novo', async () => {
    failOn = 'b.pdf';
    const list = [file('a.pdf'), file('b.pdf')];
    const { result } = renderHook(() => useDrawingsUpload(env, list));
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error).toContain('b.pdf');
    expect(result.current.refs).toBeUndefined();
    expect(result.current.uploading).toBeUndefined();
    failOn = undefined;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.refs).toHaveLength(2));
    expect(upload).toHaveBeenCalledTimes(3); // a, b (falhou), b
  });
});
