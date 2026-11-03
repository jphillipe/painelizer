/**
 * A tabela `projects` por uma interface estreita (S22.1): o service fala com isto, e os testes a falsificam com um
 * `Map`. O adaptador real embaixo traduz para o cliente do Supabase; é o único lugar que conhece a sintaxe de
 * consulta dele. Sem lógica: quem decide o que gravar e o que é conflito é `services/projects.service.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectRow } from '@/types/database';
import type { Json } from '@/types/json';

export interface ProjectsTable {
  insert(row: { name: string; data: Json; owner_id: string | null; owner_email: string | null }): Promise<Pick<ProjectRow, 'id' | 'revision' | 'updated_at'>>;
  get(id: string): Promise<ProjectRow | undefined>;
  /**
   * Grava só se a linha ainda estiver na revisão esperada (concorrência otimista), passando para `expected + 1`.
   * `undefined` = nenhuma linha gravada (revisão divergente ou id inexistente).
   */
  updateIfRevision(id: string, expected: number, patch: { name: string; data: Json }): Promise<Pick<ProjectRow, 'revision' | 'updated_at'> | undefined>;
}

export class ProjectsTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectsTableError';
  }
}

export function supabaseProjectsTable(client: SupabaseClient<Database>): ProjectsTable {
  const table = () => client.from('projects');
  return {
    async insert(row) {
      const { data, error } = await table().insert(row).select('id, revision, updated_at').single();
      if (error !== null || data === null) throw new ProjectsTableError(error?.message ?? 'insert sem retorno');
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
  };
}
