/**
 * A tabela `extraction_jobs` por uma interface estreita (S24), como `projects` em `projects-table.ts`: o service de
 * jobs (`services/extract-jobs.ts`) fala com isto; os testes e o desenvolvimento sem Supabase usam a versão em
 * memória de lá. O adaptador real traduz para o cliente do Supabase com a sessão do usuário — a RLS por dono já
 * esconde os jobs dos outros. Sem lógica: quem decide estado, dono e batimento é o service.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ExtractionJobRow } from '@/types/database';
import type { ExtractOutcome } from '@/types/extract';
import type { Json } from '@/types/json';

export type JobStatus = ExtractionJobRow['status'];
export type JobPhase = ExtractionJobRow['phase'];

/** Um job como o service o vê: tempos em ms desde a época; `ownerId` nulo só sem Supabase (desenvolvimento). */
export interface JobRecord {
  id: string;
  ownerId: string | null;
  status: JobStatus;
  phase: JobPhase;
  inputTokens: number | undefined;
  outputTokens: number;
  message: string | undefined;
  result: ExtractOutcome | undefined;
  cancelRequested: boolean;
  createdAt: number;
  /** Último batimento (progresso gravado) ou o fim. */
  updatedAt: number;
  endedAt: number | undefined;
}

export interface ExtractJobsTable {
  /** Lança se o id já existir. */
  insert(job: { id: string; ownerId: string | null; at: number }): Promise<void>;
  get(id: string): Promise<JobRecord | undefined>;
  /**
   * Batimento: grava fase e tokens de um job ainda `running` e diz se alguém pediu cancelamento (talvez noutra
   * instância). `undefined` = nenhuma linha em curso com esse id (apagada ou já terminada).
   */
  progress(id: string, p: { phase: JobPhase; inputTokens: number | undefined; outputTokens: number; at: number }): Promise<{ cancelRequested: boolean } | undefined>;
  finish(id: string, p: { status: Exclude<JobStatus, 'running'>; message: string | undefined; result: ExtractOutcome; at: number }): Promise<void>;
  /** Marca o pedido de cancelamento num job em curso; `true` se marcou. */
  requestCancel(id: string, at: number): Promise<boolean>;
  /** `true` se apagou uma linha. */
  delete(id: string): Promise<boolean>;
  /** Apaga os jobs do dono sem atividade desde `before` (terminados há tempo ou de uma instância que morreu). */
  sweep(ownerId: string | null, before: number): Promise<void>;
}

/** Falha do Supabase com código (S26): a tela diz a frase de `lib/messages.en.ts`; `message` é o detalhe (inglês, do PostgREST/Storage). */
export class ExtractJobsTableError extends Error {
  readonly code: 'DB_ERROR';
  constructor(message: string, code: 'DB_ERROR' = 'DB_ERROR') {
    super(message);
    this.name = 'ExtractJobsTableError';
    this.code = code;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

function record(row: ExtractionJobRow): JobRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    status: row.status,
    phase: row.phase,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens,
    message: row.message ?? undefined,
    result: (row.result ?? undefined) as ExtractOutcome | undefined,
    cancelRequested: row.cancel_requested,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    endedAt: row.ended_at === null ? undefined : Date.parse(row.ended_at),
  };
}

/** `updated_at` vem do trigger `set_updated_at` (relógio do banco); `at` só entra em `ended_at`. */
export function supabaseExtractJobsTable(client: SupabaseClient<Database>): ExtractJobsTable {
  const table = () => client.from('extraction_jobs');
  return {
    async insert(job) {
      const { error } = await table().insert({ id: job.id, ...(job.ownerId === null ? {} : { owner_id: job.ownerId }) });
      if (error !== null) throw new ExtractJobsTableError(error.message);
    },
    async get(id) {
      const { data, error } = await table().select('*').eq('id', id).maybeSingle();
      if (error !== null) throw new ExtractJobsTableError(error.message);
      return data === null ? undefined : record(data);
    },
    async progress(id, p) {
      const { data, error } = await table()
        .update({ phase: p.phase, output_tokens: p.outputTokens, ...(p.inputTokens === undefined ? {} : { input_tokens: p.inputTokens }) })
        .eq('id', id)
        .eq('status', 'running')
        .select('cancel_requested');
      if (error !== null) throw new ExtractJobsTableError(error.message);
      const row = data?.[0];
      return row === undefined ? undefined : { cancelRequested: row.cancel_requested };
    },
    async finish(id, p) {
      const { error } = await table()
        .update({ status: p.status, message: p.message ?? null, result: p.result as unknown as Json, ended_at: iso(p.at) })
        .eq('id', id);
      if (error !== null) throw new ExtractJobsTableError(error.message);
    },
    async requestCancel(id) {
      const { data, error } = await table().update({ cancel_requested: true }).eq('id', id).eq('status', 'running').select('id');
      if (error !== null) throw new ExtractJobsTableError(error.message);
      return (data?.length ?? 0) > 0;
    },
    async delete(id) {
      const { data, error } = await table().delete().eq('id', id).select('id');
      if (error !== null) throw new ExtractJobsTableError(error.message);
      return (data?.length ?? 0) > 0;
    },
    async sweep(ownerId, before) {
      let q = table().delete().lt('updated_at', iso(before));
      if (ownerId !== null) q = q.eq('owner_id', ownerId);
      const { error } = await q;
      if (error !== null) throw new ExtractJobsTableError(error.message);
    },
  };
}
