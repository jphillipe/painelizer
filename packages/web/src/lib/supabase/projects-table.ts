/**
 * A tabela `projects` por uma interface estreita (S22.1): o service fala com isto, e os testes a falsificam com um
 * `Map`. O adaptador real embaixo traduz para o cliente do Supabase; é o único lugar que conhece a sintaxe de
 * consulta dele. Sem lógica: quem decide o que gravar e o que é conflito é `services/projects.service.ts`.
 *
 * S32: a RLS limita tudo ao time de quem está logado; aqui só entram a lixeira (`deleted_at`: `get` e
 * `updateIfRevision` não enxergam projeto na lixeira), a lista com busca/"mine"/paginação e os retratos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectRevisionRow, ProjectRow } from '@/types/database';
import type { Json } from '@/types/json';

/**
 * Uma linha como a lista a vê (S22.2): sem o `data` inteiro (uma leitura da IA passa de 500 KB), só a lista de
 * paredes dele (`data->walls`), que o service conta.
 */
export type ProjectSummaryRow = Pick<ProjectRow, 'id' | 'name' | 'owner_id' | 'owner_email' | 'updated_by_email' | 'revision' | 'created_at' | 'updated_at' | 'deleted_at'> & { walls: Json | null };

/** Onde a página anterior parou (S32): a chave de ordenação (`updated_at`, ou `deleted_at` na lixeira) e o id, para empates. */
export interface ListCursor {
  at: string;
  id: string;
}

export interface ListQuery {
  /** Parte do nome (sem diferença de maiúsculas). */
  search?: string;
  /** Só os projetos criados por esta pessoa ("Mine"). */
  ownerId?: string;
  /** A lixeira em vez da lista. */
  trash?: boolean;
  before?: ListCursor;
  limit: number;
}

/** Um retrato do histórico como a tela o lista (sem o `data`). */
export type RevisionSummaryRow = Pick<ProjectRevisionRow, 'revision' | 'name' | 'saved_by_email' | 'created_at'>;

export interface ProjectsTable {
  insert(row: { name: string; data: Json; owner_id: string | null; owner_email: string | null }): Promise<Pick<ProjectRow, 'id' | 'revision' | 'updated_at'>>;
  /** Fora da lixeira; `{ trashed: true }` também acha o que está nela. */
  get(id: string, options?: { trashed?: boolean }): Promise<ProjectRow | undefined>;
  /**
   * Grava só se a linha ainda estiver na revisão esperada (concorrência otimista) e fora da lixeira, passando para
   * `expected + 1`. `undefined` = nenhuma linha gravada (revisão divergente, id inexistente ou na lixeira).
   */
  updateIfRevision(id: string, expected: number, patch: { name: string; data: Json }): Promise<Pick<ProjectRow, 'revision' | 'updated_at'> | undefined>;
  /** Uma página, da mais recente para a mais antiga (a lixeira, pela data em que entrou nela). */
  list(query: ListQuery): Promise<ProjectSummaryRow[]>;
  /** Manda para a lixeira; `false` se não achou fora dela. */
  trash(id: string): Promise<boolean>;
  /** Tira da lixeira; `false` se não estava nela. */
  restore(id: string): Promise<boolean>;
  /** Apaga de vez (só da lixeira; a RLS exige admin). `true` se apagou uma linha. */
  delete(id: string): Promise<boolean>;
  /** Os retratos de um projeto, do mais novo para o mais velho. */
  revisions(projectId: string): Promise<RevisionSummaryRow[]>;
  revision(projectId: string, revision: number): Promise<ProjectRevisionRow | undefined>;
}

/** Falha do Supabase com código (S26): a tela diz a frase de `lib/messages.en.ts`; `message` é o detalhe (inglês, do PostgREST/Storage). */
export class ProjectsTableError extends Error {
  readonly code: 'INSERT_NO_ROW' | 'DB_ERROR' | 'NO_TEAM';
  constructor(message: string, code: 'INSERT_NO_ROW' | 'DB_ERROR' | 'NO_TEAM' = 'DB_ERROR') {
    super(message);
    this.name = 'ProjectsTableError';
    this.code = code;
  }
}

/** `%`, `_` e `\` literais num `ilike` (a busca procura o texto, não um padrão). */
export function ilikePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Valor entre aspas para um filtro `or(...)` do PostgREST (datas têm `.`, `:` e `+`, que lá são sintaxe). */
function quoted(value: string): string {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/**
 * Inserção sem time: a conta não está em nenhum (`team_id` cai no default `private.default_team_id()`, que dá
 * `null`) ou a RLS recusou por isso. O service diz para pedir a um admin.
 */
function insertError(error: { code?: string; message: string }): ProjectsTableError {
  if ((error.code === '23502' && /team_id/.test(error.message)) || error.code === '42501') return new ProjectsTableError(error.message, 'NO_TEAM');
  return new ProjectsTableError(error.message);
}

const SUMMARY = 'id, name, owner_id, owner_email, updated_by_email, revision, created_at, updated_at, deleted_at, walls:data->walls';

export function supabaseProjectsTable(client: SupabaseClient<Database>): ProjectsTable {
  const table = () => client.from('projects');
  return {
    async insert(row) {
      const { data, error } = await table().insert(row).select('id, revision, updated_at').single();
      if (error !== null) throw insertError(error);
      if (data === null) throw new ProjectsTableError('insert returned no row', 'INSERT_NO_ROW');
      return data;
    },
    async get(id, options) {
      let query = table().select('*').eq('id', id);
      if (options?.trashed !== true) query = query.is('deleted_at', null);
      const { data, error } = await query.maybeSingle();
      if (error !== null) throw new ProjectsTableError(error.message);
      return data ?? undefined;
    },
    async updateIfRevision(id, expected, patch) {
      const { data, error } = await table()
        .update({ ...patch, revision: expected + 1 })
        .eq('id', id)
        .eq('revision', expected)
        .is('deleted_at', null)
        .select('revision, updated_at');
      if (error !== null) throw new ProjectsTableError(error.message);
      return data?.[0];
    },
    async list({ search, ownerId, trash = false, before, limit }) {
      // `data->walls` é o caminho JSON do PostgREST: só a lista de paredes atravessa a rede, não o arquivo inteiro.
      const key = trash ? 'deleted_at' : 'updated_at';
      let query = table().select(SUMMARY);
      query = trash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
      if (search !== undefined && search !== '') query = query.ilike('name', ilikePattern(search));
      if (ownerId !== undefined) query = query.eq('owner_id', ownerId);
      if (before !== undefined) query = query.or(`${key}.lt.${quoted(before.at)},and(${key}.eq.${quoted(before.at)},id.lt.${quoted(before.id)})`);
      const { data, error } = await query.order(key, { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (error !== null) throw new ProjectsTableError(error.message);
      return (data ?? []) as unknown as ProjectSummaryRow[];
    },
    async trash(id) {
      const { data, error } = await table().update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('id');
      if (error !== null) throw new ProjectsTableError(error.message);
      return (data?.length ?? 0) > 0;
    },
    async restore(id) {
      const { data, error } = await table().update({ deleted_at: null }).eq('id', id).not('deleted_at', 'is', null).select('id');
      if (error !== null) throw new ProjectsTableError(error.message);
      return (data?.length ?? 0) > 0;
    },
    async delete(id) {
      const { data, error } = await table().delete().eq('id', id).not('deleted_at', 'is', null).select('id');
      if (error !== null) throw new ProjectsTableError(error.message);
      return (data?.length ?? 0) > 0;
    },
    async revisions(projectId) {
      const { data, error } = await client.from('project_revisions').select('revision, name, saved_by_email, created_at').eq('project_id', projectId).order('revision', { ascending: false });
      if (error !== null) throw new ProjectsTableError(error.message);
      return data ?? [];
    },
    async revision(projectId, revision) {
      const { data, error } = await client.from('project_revisions').select('*').eq('project_id', projectId).eq('revision', revision).maybeSingle();
      if (error !== null) throw new ProjectsTableError(error.message);
      return data ?? undefined;
    },
  };
}
