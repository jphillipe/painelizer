import { beforeEach, describe, expect, it } from 'vitest';
import type { ExtractOutcome } from '@/types/extract';
import { cancelJob, createJob, finishJob, JOB_TTL_MS, jobProgress, registry, reportProgress, sweep, takeResult } from './extract-jobs';

const ok = { ok: true, output: {}, given: { wallHeight: '', headerHeight: '', sillHeight: '', floors: '', floorSpan: '' as const, snow: '', width: '', wind: '', exposure: '' as const }, projectName: 'p', level: 1, origin: '', projectText: '{}', walls: [], openingTypes: [], notes: [], problems: [], warnings: [], report: '', model: 'm', usage: { inputTokens: 1, outputTokens: 2 }, pagesSent: [] } as ExtractOutcome;

describe('jobs de extração (M7)', () => {
  beforeEach(() => registry().clear());

  it('cria, reporta progresso, termina e entrega o resultado uma vez', () => {
    const job = createJob('j1', 1000);
    expect(jobProgress('j1', 1500)).toMatchObject({ status: 'running', phase: 'preparing', outputTokens: 0, elapsedMs: 500 });
    reportProgress(job, { phase: 'reading', inputTokens: 21_000, outputTokens: 4_000 });
    expect(jobProgress('j1', 2000)).toMatchObject({ status: 'running', phase: 'reading', inputTokens: 21_000, outputTokens: 4_000, elapsedMs: 1000 });
    expect(takeResult('j1')).toBeUndefined();
    finishJob(job, ok, 3000);
    expect(jobProgress('j1', 9000)).toMatchObject({ status: 'done', elapsedMs: 2000 });
    expect(takeResult('j1')).toBe(ok);
    expect(takeResult('j1')).toBeUndefined();
    expect(jobProgress('j1')).toMatchObject({ status: 'unknown' });
  });

  it('cancelar aborta o controller só de job em curso; falha e cancelamento ficam com a mensagem', () => {
    const job = createJob('j2');
    expect(job.controller.signal.aborted).toBe(false);
    expect(cancelJob('j2')).toBe(true);
    expect(job.controller.signal.aborted).toBe(true);
    finishJob(job, { ok: false, reason: 'cancelled', message: 'Read cancelled.' });
    expect(cancelJob('j2')).toBe(false);
    expect(jobProgress('j2')).toMatchObject({ status: 'cancelled', message: 'Read cancelled.' });
    expect(cancelJob('nope')).toBe(false);
    const j3 = createJob('j3');
    finishJob(j3, { ok: false, reason: 'api', message: 'boom' });
    expect(jobProgress('j3')).toMatchObject({ status: 'failed', message: 'boom' });
  });

  it('varredura tira só os terminados há mais de uma hora', () => {
    const a = createJob('a', 0);
    finishJob(a, ok, 0);
    createJob('b', 0);
    sweep(JOB_TTL_MS + 1);
    expect(registry().has('a')).toBe(false);
    expect(registry().has('b')).toBe(true);
  });
});
