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

export interface DrawingsDeps {
  store: () => Promise<DrawingsStore | undefined>;
}

export const defaultDeps: DrawingsDeps = {
  store: async () => {
    const client = await supabaseServer();
    return client === undefined ? undefined : supabaseDrawingsStore(client);
  },
};

export type DownloadResult = { ok: true; files: UploadedFile[] } | { ok: false; reason: 'unconfigured' | 'failed'; message: string };

/** Os desenhos de um envio como o `extract` os lê (nome do humano, tipo e bytes), na ordem dada. */
export async function downloadDrawings(refs: readonly DrawingRef[], deps: DrawingsDeps = defaultDeps): Promise<DownloadResult> {
  const store = await deps.store();
  if (store === undefined) return { ok: false, reason: 'unconfigured', message: 'Drawings are not stored on this server.' };
  const files: UploadedFile[] = [];
  for (const ref of refs) {
    try {
      files.push({ name: ref.name, type: ref.type, bytes: await store.download(ref.path) });
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
