/**
 * Leituras em curso no servidor (M7). Uma server action de 10 minutos não tem como dizer "estou na metade" nem
 * sobreviver a um F5: o cliente passa um `jobId`, a action registra o job aqui (progresso, `AbortController`,
 * resultado) e outras actions consultam, cancelam e recolhem o resultado. Memória do processo (um servidor
 * Node; em `globalThis` para sobreviver ao HMR do dev). Resultado guardado por `JOB_TTL_MS` e entregue uma vez.
 * Puro além do relógio; sem Next.
 */

import type { ExtractOutcome, ExtractProgressInfo } from '@/types/extract';

export const JOB_TTL_MS = 60 * 60 * 1000;

export interface Job {
  id: string;
  startedAt: number;
  controller: AbortController;
  phase: 'preparing' | 'waiting' | 'reading';
  inputTokens: number | undefined;
  outputTokens: number;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  result: ExtractOutcome | undefined;
  message: string | undefined;
  endedAt: number | undefined;
}

type Registry = Map<string, Job>;

const KEY = '__panelizerExtractJobs';

export function registry(): Registry {
  const g = globalThis as unknown as Record<string, Registry | undefined>;
  g[KEY] ??= new Map();
  return g[KEY];
}

export function createJob(id: string, now = Date.now()): Job {
  sweep(now);
  const job: Job = { id, startedAt: now, controller: new AbortController(), phase: 'preparing', inputTokens: undefined, outputTokens: 0, status: 'running', result: undefined, message: undefined, endedAt: undefined };
  registry().set(id, job);
  return job;
}

export function reportProgress(job: Job, p: { phase: Job['phase']; inputTokens?: number | undefined; outputTokens: number }): void {
  job.phase = p.phase;
  if (p.inputTokens !== undefined) job.inputTokens = p.inputTokens;
  job.outputTokens = p.outputTokens;
}

export function finishJob(job: Job, result: ExtractOutcome, now = Date.now()): void {
  job.status = result.ok ? 'done' : result.reason === 'cancelled' ? 'cancelled' : 'failed';
  job.result = result;
  job.message = result.ok ? undefined : result.message;
  job.endedAt = now;
}

/** `true` se havia um job em curso para cancelar. */
export function cancelJob(id: string): boolean {
  const job = registry().get(id);
  if (job === undefined || job.status !== 'running') return false;
  job.controller.abort();
  return true;
}

export function jobProgress(id: string, now = Date.now()): ExtractProgressInfo {
  const job = registry().get(id);
  if (job === undefined) return { status: 'unknown', outputTokens: 0, elapsedMs: 0 };
  return {
    status: job.status,
    phase: job.phase,
    ...(job.inputTokens === undefined ? {} : { inputTokens: job.inputTokens }),
    outputTokens: job.outputTokens,
    elapsedMs: (job.endedAt ?? now) - job.startedAt,
    ...(job.message === undefined ? {} : { message: job.message }),
  };
}

/** Resultado de um job terminado, entregue uma vez (depois o job some). */
export function takeResult(id: string): ExtractOutcome | undefined {
  const job = registry().get(id);
  if (job === undefined || job.status === 'running') return undefined;
  registry().delete(id);
  return job.result;
}

/** Jobs terminados há mais de `JOB_TTL_MS` saem; os em curso ficam. */
export function sweep(now = Date.now()): void {
  for (const [id, job] of registry()) {
    if (job.endedAt !== undefined && now - job.endedAt > JOB_TTL_MS) registry().delete(id);
  }
}
