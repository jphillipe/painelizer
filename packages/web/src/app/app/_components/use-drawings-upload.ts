'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DRAWINGS_BUCKET, drawingPath, newUploadId, type DrawingRef } from '@/lib/drawings';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { SupabaseEnv } from '@/lib/supabase/env';

export interface DrawingsUpload {
  /** Há Storage: os arquivos sobem direto do navegador e a leitura recebe os caminhos. */
  enabled: boolean;
  /** Os desenhos já no bucket, na ordem dos arquivos; `undefined` enquanto algum ainda sobe ou falhou. */
  refs: DrawingRef[] | undefined;
  /** Progresso enquanto sobe (`done` de `total`), ou `undefined` quando tudo está no lugar. */
  uploading: { done: number; total: number } | undefined;
  error: string | undefined;
  retry: () => void;
}

const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

/**
 * Sobe os arquivos do passo 01 ao bucket `drawings` assim que entram na lista (S22.3), um por vez, numa pasta
 * por sessão do formulário (`<uploadId>/`); um arquivo que sai da lista é apagado do bucket. A prévia e a leitura
 * esperam `refs` — sem Storage (`storage` ausente) nada sobe e os arquivos vão no corpo do pedido, como antes.
 * Nomes que dão no mesmo nome seguro ganham um sufixo numérico no caminho.
 */
export function useDrawingsUpload(storage: SupabaseEnv | undefined, files: readonly File[]): DrawingsUpload {
  const uploadId = useRef<string | undefined>(undefined);
  const [done, setDone] = useState<Map<string, DrawingRef>>(() => new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const enabled = storage !== undefined;
  // A fila reage ao CONTEÚDO da lista (nome, tamanho, data), não à identidade do array: um pai que recria a lista a
  // cada render não reinicia os uploads nem entra em loop.
  const signature = files.map(fileKey).join('|');
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    if (storage === undefined) return;
    const files = filesRef.current;
    if (uploadId.current === undefined) uploadId.current = newUploadId();
    const folder = uploadId.current;
    const client = supabaseBrowser(storage);
    const bucket = () => client.storage.from(DRAWINGS_BUCKET);
    let cancelled = false;
    const keys = new Set(files.map(fileKey));

    // Arquivos que saíram da lista: fora do bucket também (best effort).
    const gone = [...done.entries()].filter(([k]) => !keys.has(k));
    if (gone.length > 0) {
      void bucket().remove(gone.map(([, r]) => r.path));
      setDone((prev) => {
        const next = new Map(prev);
        for (const [k] of gone) next.delete(k);
        return next;
      });
    }

    const pending = files.filter((f) => !done.has(fileKey(f)));
    if (pending.length === 0) {
      setProgress(undefined);
      return;
    }
    setError(undefined);
    setProgress({ done: files.length - pending.length, total: files.length });
    void (async () => {
      const used = new Set([...done.values()].map((r) => r.path));
      for (const f of pending) {
        if (cancelled) return;
        let path = drawingPath(folder, f.name);
        for (let n = 2; used.has(path); n++) path = drawingPath(folder, f.name).replace(/(\.[^.]*)?$/, `-${n}$1`);
        used.add(path);
        const { error: e } = await bucket().upload(path, f, { upsert: true, ...(f.type === '' ? {} : { contentType: f.type }) });
        if (cancelled) return;
        if (e !== null) {
          setError(`Could not upload ${f.name}: ${e.message}`);
          setProgress(undefined);
          return;
        }
        const ref: DrawingRef = { name: f.name, path, size: f.size, type: f.type };
        setDone((prev) => new Map(prev).set(fileKey(f), ref));
        setProgress((p) => (p === undefined ? undefined : { done: p.done + 1, total: p.total }));
      }
      setProgress(undefined);
    })();
    return () => {
      cancelled = true;
    };
    // `done` de propósito fora das deps: cada upload concluído muda `done` e não deve reiniciar a fila.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, signature, attempt]);

  const complete = enabled && error === undefined && progress === undefined && files.every((f) => done.has(fileKey(f)));
  // Mesma identidade enquanto lista e uploads não mudam: a prévia do passo 01 depende de `refs`, e um array novo a
  // cada render a fazia rodar em laço (cada volta baixava o conjunto inteiro do Storage — estourou a cota de egress).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refs = useMemo(() => (complete ? files.map((f) => done.get(fileKey(f))!) : undefined), [complete, signature, done]);
  return { enabled, refs, uploading: progress, error, retry: () => setAttempt((a) => a + 1) };
}
