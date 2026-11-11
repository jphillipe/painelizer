/**
 * Desenhos no Storage, lado do servidor (S22.3): a action de leitura recebe os caminhos que o navegador subiu e
 * baixa os bytes daqui para o `extract`; apagar e duplicar projetos mexem nas pastas. O bucket entra por `deps`
 * (`DrawingsStore`), como o resto: testes com um `Map`, sem rede. Sem Supabase configurado, `store()` é
 * `undefined` e os desenhos continuam vindo no corpo do pedido (desenvolvimento sem chaves).
 */

import { errorMessage } from '@/lib/errors';
import 'server-only';
import { movedDrawings, newUploadId, uploadIdsOf, type DrawingRef } from '@/lib/drawings';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseDrawingsStore, type DrawingsStore } from '@/lib/supabase/drawings-store';
import type { UploadedFile } from './extract.service';

/** Bytes baixados há pouco, em memória da instância: chave → bytes, com validade e teto total (sai o menos usado). */
export interface DownloadCache {
  get: (key: string) => Uint8Array | undefined;
  set: (key: string, bytes: Uint8Array) => void;
}

export function createDownloadCache({ maxBytes, ttlMs, now = Date.now }: { maxBytes: number; ttlMs: number; now?: () => number }): DownloadCache {
  // Map guarda a ordem de inserção: reinserir no `get` deixa o menos usado na frente.
  const entries = new Map<string, { bytes: Uint8Array; at: number }>();
  let total = 0;
  const drop = (key: string) => {
    const e = entries.get(key);
    if (e === undefined) return;
    total -= e.bytes.length;
    entries.delete(key);
  };
  return {
    get(key) {
      const e = entries.get(key);
      if (e === undefined) return undefined;
      if (now() - e.at > ttlMs) {
        drop(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, e);
      return e.bytes;
    },
    set(key, bytes) {
      drop(key);
      if (bytes.length > maxBytes) return;
      while (total + bytes.length > maxBytes) drop(entries.keys().next().value!);
      entries.set(key, { bytes, at: now() });
      total += bytes.length;
    },
  };
}

export interface DrawingsDeps {
  store: () => Promise<DrawingsStore | undefined>;
  cache?: DownloadCache | undefined;
}

/**
 * A prévia do passo 01 roda a cada mudança de páginas/pavimento e a leitura vem depois, sempre com os mesmos
 * desenhos: sem cache, cada uma baixava o conjunto inteiro do Storage (egress pago; o Free tem 5 GB/mês).
 * 64 MB cobrem o maior conjunto com prévia (40 MB); 15 min cobrem prévia → leitura.
 */
export const defaultDeps: DrawingsDeps = {
  store: async () => {
    const client = await supabaseServer();
    return client === undefined ? undefined : supabaseDrawingsStore(client);
  },
  cache: createDownloadCache({ maxBytes: 64 * 1024 * 1024, ttlMs: 15 * 60 * 1000 }),
};

export type DownloadResult = { ok: true; files: UploadedFile[] } | { ok: false; reason: 'unconfigured' | 'failed'; message: string };

/**
 * Os desenhos de um envio como o `extract` os lê (nome do humano, tipo e bytes), na ordem dada. Com `userId`, o que
 * este usuário baixou há pouco sai do cache; a chave leva o usuário porque o download passa pela RLS da sessão dele,
 * e o cache não pode entregar a outro o que só um tinha permissão de ler. Sem `userId`, sempre do Storage.
 */
export async function downloadDrawings(refs: readonly DrawingRef[], deps: DrawingsDeps = defaultDeps, userId?: string): Promise<DownloadResult> {
  const store = await deps.store();
  if (store === undefined) return { ok: false, reason: 'unconfigured', message: 'Drawings are not stored on this server.' };
  const cache = userId === undefined ? undefined : deps.cache;
  const files: UploadedFile[] = [];
  for (const ref of refs) {
    const key = `${userId}\n${ref.path}\n${ref.size}`;
    try {
      let bytes = cache?.get(key);
      if (bytes === undefined) {
        bytes = await store.download(ref.path);
        cache?.set(key, bytes);
      }
      files.push({ name: ref.name, type: ref.type, bytes });
    } catch (e) {
      return { ok: false, reason: 'failed', message: `Could not read ${ref.name} from storage: ${errorMessage(e)}` };
    }
  }
  return { ok: true, files };
}

/** Apaga as pastas dos desenhos de um projeto (best effort: erro vira `false`, o projeto já foi apagado). */
export async function removeDrawings(drawings: readonly DrawingRef[], deps: DrawingsDeps = defaultDeps): Promise<boolean> {
  const store = await deps.store();
  if (store === undefined || drawings.length === 0) return true;
  try {
    for (const id of uploadIdsOf(drawings)) await store.remove(await store.list(id));
    return true;
  } catch {
    return false;
  }
}

/** Copia os desenhos para uma pasta nova (duplicar projeto) e devolve as referências da cópia; sem Storage, as mesmas. */
export async function copyDrawings(drawings: readonly DrawingRef[], deps: DrawingsDeps = defaultDeps): Promise<DrawingRef[]> {
  const store = await deps.store();
  if (store === undefined || drawings.length === 0) return [...drawings];
  const copy = movedDrawings(drawings, newUploadId());
  for (let i = 0; i < drawings.length; i++) await store.copy(drawings[i]!.path, copy[i]!.path);
  return copy;
}
