/**
 * O bucket `drawings` por uma interface estreita (S22.3), como a tabela `projects` em `projects-table.ts`: o
 * service de desenhos e o de projetos falam com isto, e os testes o falsificam com um `Map`. O adaptador real
 * traduz para o cliente do Supabase (servidor ou navegador — a API de Storage é a mesma). Sem lógica.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DRAWINGS_BUCKET } from '@/lib/drawings';
import type { Database } from '@/types/database';

export interface DrawingsStore {
  /** Bytes de um objeto; lança se não existir ou a rede falhar. */
  download(path: string): Promise<Uint8Array>;
  /** Caminhos dos objetos numa pasta (`<uploadId>/`), sem recursão (um envio é plano). */
  list(prefix: string): Promise<string[]>;
  /** Apaga os objetos dados; caminhos inexistentes são ignorados. */
  remove(paths: readonly string[]): Promise<void>;
  /** Copia um objeto para outro caminho (duplicar projeto). */
  copy(from: string, to: string): Promise<void>;
}

/** Falha do Supabase com código (S26): a tela diz a frase de `lib/messages.en.ts`; `message` é o detalhe (inglês, do PostgREST/Storage). */
export class DrawingsStoreError extends Error {
  readonly code: 'DOWNLOAD_NO_DATA' | 'STORAGE_ERROR';
  constructor(message: string, code: 'DOWNLOAD_NO_DATA' | 'STORAGE_ERROR' = 'STORAGE_ERROR') {
    super(message);
    this.name = 'DrawingsStoreError';
    this.code = code;
  }
}

export function supabaseDrawingsStore(client: SupabaseClient<Database>): DrawingsStore {
  const bucket = () => client.storage.from(DRAWINGS_BUCKET);
  return {
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error !== null || data === null) throw new DrawingsStoreError(error?.message ?? `download returned no data: ${path}`, error === null ? 'DOWNLOAD_NO_DATA' : 'STORAGE_ERROR');
      return new Uint8Array(await data.arrayBuffer());
    },
    async list(prefix) {
      const folder = prefix.replace(/\/+$/, '');
      const { data, error } = await bucket().list(folder, { limit: 1000 });
      if (error !== null) throw new DrawingsStoreError(error.message);
      // `list` devolve pastas também (sem `id`); só objetos interessam.
      return (data ?? []).filter((o) => o.id !== null && o.id !== undefined).map((o) => `${folder}/${o.name}`);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove([...paths]);
      if (error !== null) throw new DrawingsStoreError(error.message);
    },
    async copy(from, to) {
      const { error } = await bucket().copy(from, to);
      if (error !== null) throw new DrawingsStoreError(error.message);
    },
  };
}
