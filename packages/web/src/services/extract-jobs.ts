/**
 * Leituras em curso e terminadas (M7; S24 no banco). Uma server action de 10 minutos não tem como dizer "estou na
 * metade" nem sobreviver a um F5: o cliente passa um `jobId`, a action registra o job aqui e outras actions
 * consultam o progresso, cancelam e recolhem o resultado.
 *
 * S24: o job é uma linha de `extraction_jobs` (`ExtractJobsTable`, adaptador injetável como `ProjectsTable`), e
 * não mais só um `Map` do processo — o resultado sobrevive a restart e deploy, e qualquer instância do Cloud Run
 * responde. A instância que roda a leitura guarda o progresso em memória (`report`, a cada token) e o grava no
 * banco num batimento a cada `HEARTBEAT_MS` (moderação: ~120 escritas numa leitura de 10 min, não uma por token).
 * O mesmo batimento traz o pedido de cancelamento que outra instância marcou. `running` sem batimento há
 * `STALE_MS` = a instância morreu no meio (deploy sem esperar, crash): vira falha com mensagem, não espera eterna.
 *
 * Dono: toda consulta compara o dono do job com o usuário da action (a RLS por dono faz o mesmo no banco); job de
 * outro é `unknown`, como inexistente. Sem Supabase (desenvolvimento, testes), a tabela é um `Map` em `globalThis`
 * (sobrevive ao HMR) e o dono é nulo.
 */

import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseExtractJobsTable, type ExtractJobsTable, type JobPhase, type JobRecord } from '@/lib/supabase/extract-jobs-table';
import { normalizeReading } from '@/lib/editor/project-file';
import type { ExtractOutcome, ExtractProgressInfo } from '@/types/extract';

/** Resultado não recolhido fica 24 h (o original volta pela própria action; isto é o seguro do F5 e do deploy). */
export const JOB_TTL_MS = 24 * 60 * 60 * 1000;
/** Intervalo entre gravações de progresso (e leituras do pedido de cancelamento) da instância que roda a leitura. */
export const HEARTBEAT_MS = 5_000;
/** Sem batimento por isto, um job `running` é dado como perdido. */
export const STALE_MS = 2 * 60 * 1000;

export const LOST_MESSAGE = 'The server stopped during this read (a restart or a new version). Nothing was kept; upload the set again.';

/** O que a instância que roda a leitura sabe e o banco só vê no próximo batimento. */
interface Live {
  id: string;
  ownerId: string | null;
  controller: AbortController;
  startedAt: number;
  phase: JobPhase;
  inputTokens: number | undefined;
  outputTokens: number;
}

export interface ExtractJobsDeps {
  table: () => Promise<ExtractJobsTable>;
  /** Jobs rodando NESTE processo (o `AbortController` não atravessa instâncias). */
  live?: Map<string, Live>;
  now?: () => number;
  heartbeatMs?: number;
}

function globalMap<T>(key: string): Map<string, T> {
  const g = globalThis as unknown as Record<string, Map<string, T> | undefined>;
  g[key] ??= new Map();
  return g[key];
}

/** A tabela em memória: desenvolvimento sem Supabase e testes. Mesma semântica do adaptador real. */
export function memoryExtractJobsTable(rows: Map<string, JobRecord> = new Map()): ExtractJobsTable {
  return {
    async insert({ id, ownerId, at }) {
      if (rows.has(id)) throw new Error(`job ${id} already exists`);
      rows.set(id, { id, ownerId, status: 'running', phase: 'preparing', inputTokens: undefined, outputTokens: 0, message: undefined, result: undefined, cancelRequested: false, createdAt: at, updatedAt: at, endedAt: undefined });
    },
    async get(id) {
      const row = rows.get(id);
      return row === undefined ? undefined : { ...row };
    },
    async progress(id, p) {
      const row = rows.get(id);
      if (row === undefined || row.status !== 'running') return undefined;
      row.phase = p.phase;
      if (p.inputTokens !== undefined) row.inputTokens = p.inputTokens;
      row.outputTokens = p.outputTokens;
      row.updatedAt = p.at;
      return { cancelRequested: row.cancelRequested };
    },
    async finish(id, p) {
      const row = rows.get(id);
      if (row === undefined) return;
      Object.assign(row, { status: p.status, message: p.message, result: p.result, endedAt: p.at, updatedAt: p.at });
    },
    async requestCancel(id, at) {
      const row = rows.get(id);
      if (row === undefined || row.status !== 'running') return false;
      row.cancelRequested = true;
      row.updatedAt = at;
      return true;
    },
    async delete(id) {
      return rows.delete(id);
    },
    async sweep(ownerId, before) {
      for (const [id, row] of rows) if (row.ownerId === ownerId && row.updatedAt < before) rows.delete(id);
    },
  };
}

const devTable = memoryExtractJobsTable(globalMap<JobRecord>('__panelizerExtractJobRows'));

export const defaultDeps: ExtractJobsDeps = {
  table: async () => {
    const client = await supabaseServer();
    return client === undefined ? devTable : supabaseExtractJobsTable(client);
  },
};

const liveOf = (deps: ExtractJobsDeps) => deps.live ?? globalMap<Live>('__panelizerExtractJobsLive');
const nowOf = (deps: ExtractJobsDeps) => (deps.now ?? Date.now)();
const ownerOf = (owner: string | undefined) => owner ?? null;

function warn(what: string, e: unknown): void {
  console.warn(`extract job: ${what}: ${e instanceof Error ? e.message : String(e)}`);
}

export interface RunningJob {
  readonly id: string;
  readonly signal: AbortSignal;
  /** Progresso da chamada à API; só memória — o banco recebe no batimento. */
  report(p: { phase: JobPhase; inputTokens?: number | undefined; outputTokens: number }): void;
  /** Grava o progresso agora e aborta se alguém pediu cancelamento. O timer chama isto a cada `HEARTBEAT_MS`. */
  beat(): Promise<void>;
  /** Grava o resultado (sucesso ou falha) e para o batimento. Erro do banco não derruba a leitura: a action ainda devolve o resultado. */
  finish(outcome: ExtractOutcome): Promise<void>;
}

/** Abre um job para `owner` (id do usuário; `undefined` sem Supabase) e começa o batimento. */
export async function startJob(id: string, owner: string | undefined, deps: ExtractJobsDeps = defaultDeps): Promise<RunningJob> {
  const ownerId = ownerOf(owner);
  const startedAt = nowOf(deps);
  const live: Live = { id, ownerId, controller: new AbortController(), startedAt, phase: 'preparing', inputTokens: undefined, outputTokens: 0 };
  liveOf(deps).set(id, live);
  let table: ExtractJobsTable | undefined;
  try {
    table = await deps.table();
    await table.sweep(ownerId, startedAt - JOB_TTL_MS).catch((e: unknown) => warn('sweep', e));
    await table.insert({ id, ownerId, at: startedAt });
  } catch (e) {
    // Sem linha: a leitura roda igual e volta pela própria action; só não sobrevive a F5 noutra instância.
    warn('insert', e);
    table = undefined;
  }

  let beating = false;
  const beat = async (): Promise<void> => {
    if (table === undefined || beating) return;
    beating = true;
    try {
      const r = await table.progress(id, { phase: live.phase, inputTokens: live.inputTokens, outputTokens: live.outputTokens, at: nowOf(deps) });
      if (r?.cancelRequested === true) live.controller.abort();
    } catch (e) {
      warn('progress', e);
    } finally {
      beating = false;
    }
  };
  const timer = setInterval(() => void beat(), deps.heartbeatMs ?? HEARTBEAT_MS);
  (timer as { unref?: () => void }).unref?.();

  return {
    id,
    signal: live.controller.signal,
    report(p) {
      live.phase = p.phase;
      if (p.inputTokens !== undefined) live.inputTokens = p.inputTokens;
      live.outputTokens = p.outputTokens;
    },
    beat,
    async finish(outcome) {
      clearInterval(timer);
      const status = outcome.ok ? 'done' : outcome.reason === 'cancelled' ? 'cancelled' : 'failed';
      try {
        await table?.finish(id, { status, message: outcome.ok ? undefined : outcome.message, result: outcome, at: nowOf(deps) });
      } catch (e) {
        warn('finish', e);
      }
      liveOf(deps).delete(id);
    },
  };
}

/** `true` se havia um job em curso do usuário para cancelar (aqui: aborta já; noutra instância: marca no banco). */
export async function cancelJob(id: string, owner: string | undefined, deps: ExtractJobsDeps = defaultDeps): Promise<boolean> {
  const ownerId = ownerOf(owner);
  const live = liveOf(deps).get(id);
  if (live !== undefined) {
    if (live.ownerId !== ownerId) return false;
    live.controller.abort();
    return true;
  }
  const table = await deps.table();
  const row = await table.get(id);
  if (row === undefined || row.ownerId !== ownerId || row.status !== 'running') return false;
  return table.requestCancel(id, nowOf(deps));
}

export async function jobProgress(id: string, owner: string | undefined, deps: ExtractJobsDeps = defaultDeps): Promise<ExtractProgressInfo> {
  const ownerId = ownerOf(owner);
  const now = nowOf(deps);
  const unknown: ExtractProgressInfo = { status: 'unknown', outputTokens: 0, elapsedMs: 0 };
  const live = liveOf(deps).get(id);
  if (live !== undefined) {
    if (live.ownerId !== ownerId) return unknown;
    return { status: 'running', phase: live.phase, ...(live.inputTokens === undefined ? {} : { inputTokens: live.inputTokens }), outputTokens: live.outputTokens, elapsedMs: now - live.startedAt };
  }
  const row = await (await deps.table()).get(id);
  if (row === undefined || row.ownerId !== ownerId) return unknown;
  if (row.status === 'running' && now - row.updatedAt > STALE_MS) {
    return { status: 'failed', phase: row.phase, outputTokens: row.outputTokens, elapsedMs: row.updatedAt - row.createdAt, message: LOST_MESSAGE };
  }
  return {
    status: row.status,
    phase: row.phase,
    ...(row.inputTokens === undefined ? {} : { inputTokens: row.inputTokens }),
    outputTokens: row.outputTokens,
    elapsedMs: (row.endedAt ?? now) - row.createdAt,
    ...(row.message === undefined ? {} : { message: row.message }),
  };
}

/** Resultado de um job terminado do usuário, entregue uma vez (depois a linha some). */
export async function takeResult(id: string, owner: string | undefined, deps: ExtractJobsDeps = defaultDeps): Promise<ExtractOutcome | undefined> {
  const table = await deps.table();
  const row = await table.get(id);
  if (row === undefined || row.ownerId !== ownerOf(owner) || row.status === 'running') return undefined;
  await table.delete(id);
  // Job gravado por uma versão anterior (antes da S26) traz os avisos como texto.
  return row.result === undefined ? undefined : normalizeReading(row.result);
}
