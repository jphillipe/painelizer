/**
 * A tabela `projects` por uma interface estreita (S22.1): o service fala com isto, e os testes a falsificam com um
 * `Map`. O adaptador real embaixo traduz para o cliente do Supabase; é o único lugar que conhece a sintaxe de
 * consulta dele. Sem lógica: quem decide o que gravar e o que é conflito é `services/projects.service.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectRow } from '@/types/database';
import type { Json } from '@/types/json';

/**
 * Uma linha como a lista a vê (S22.2): sem o `data` inteiro (uma leitura da IA passa de 500 KB), só a lista de
 * paredes dele (`data->walls`), que o service conta.
 */
export type ProjectSummaryRow = Pick<ProjectRow, 'id' | 'name' | 'owner_email' | 'revision' | 'created_at' | 'updated_at'> & { walls: Json | null };

export interface ProjectsTable {
  insert(row: { name: string; data: Json; owner_id: string | null; owner_email: string | null }): Promise<Pick<ProjectRow, 'id' | 'revision' | 'updated_at'>>;
  get(id: string): Promise<ProjectRow | undefined>;
  /**
   * Grava só se a linha ainda estiver na revisão esperada (concorrência otimista), passando para `expected + 1`.
   * `undefined` = nenhuma linha gravada (revisão divergente ou id inexistente).
   */
  updateIfRevision(id: string, expected: number, patch: { name: string; data: Json }): Promise<Pick<ProjectRow, 'revision' | 'updated_at'> | undefined>;
  /** Todas as linhas que o usuário enxerga (RLS de time: todas), da mais recente para a mais antiga. */
  list(): Promise<ProjectSummaryRow[]>;
  /** `true` se apagou uma linha; `false` se o id não existia (ou já tinha sido apagado). */
  delete(id: string): Promise<boolean>;
}

/** Falha do Supabase com código (S26): a tela diz a frase de `lib/messages.en.ts`; `message` é o detalhe (inglês, do PostgREST/Storage). */
export class ProjectsTableError extends Error {
  readonly code: 'INSERT_NO_ROW' | 'DB_ERROR';
  constructor(message: string, code: 'INSERT_NO_ROW' | 'DB_ERROR' = 'DB_ERROR') {
    super(message);
    this.name = 'ProjectsTableError';
    this.code = code;
  }
}

export function supabaseProjectsTable(client: SupabaseClient<Database>): ProjectsTable {
  const table = () => client.from('projects');
  return {
    async insert(row) {
      const { data, error } = await table().insert(row).select('id, revision, updated_at').single();
      if (error !== null || data === null) throw new ProjectsTableError(error?.message ?? 'insert returned no row', error === null ? 'INSERT_NO_ROW' : 'DB_ERROR');
      return data;
    },
    async get(id) {
      const { data, error } = await table().select('*').eq('id', id).maybeSingle();
      if (error !== null) throw new ProjectsTableError(error.message);
      return data ?? undefined;
    },
    async updateIfRevision(id, expected, patch) {
      const { data, error } = await table()
        .update({ ...patch, revision: expected + 1 })
        .eq('id', id)
        .eq('revision', expected)
        .select('revision, updated_at');
      if (error !== null) throw new ProjectsTableError(error.message);
      return data?.[0];
    },
    async list() {
      // `data->walls` é o caminho JSON do PostgREST: só a lista de paredes atravessa a rede, não o arquivo inteiro.
      const { data, error } = await table().select('id, name, owner_email, revision, created_at, updated_at, walls:data->walls').order('updated_at', { ascending: false });
      if (error !== null) throw new ProjectsTableError(error.message);
      return (data ?? []) as ProjectSummaryRow[];
    },
    async delete(id) {
      const { data, error } = await table().delete().eq('id', id).select('id');
      if (error !== null) throw new ProjectsTableError(error.message);
      return (data?.length ?? 0) > 0;
    },
  };
}
