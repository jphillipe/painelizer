import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobRecord } from '@/lib/supabase/extract-jobs-table';
import type { ExtractOutcome } from '@/types/extract';

vi.mock('server-only', () => ({}));
const { cancelJob, HEARTBEAT_MS, JOB_TTL_MS, jobProgress, LOST_MESSAGE, memoryExtractJobsTable, STALE_MS, startJob, takeResult } = await import('./extract-jobs');
type Deps = import('./extract-jobs').ExtractJobsDeps;

const ok = { ok: true, output: {}, given: { wallHeight: '', headerHeight: '', sillHeight: '', floors: '', floorSpan: '' as const, snow: '', width: '', wind: '', exposure: '' as const }, projectName: 'p', level: 1, origin: '', projectText: '{}', walls: [], openingTypes: [], notes: [], problems: [], warnings: [], report: '', model: 'm', usage: { inputTokens: 1, outputTokens: 2 }, pagesSent: [] } as ExtractOutcome;

/**
 * Um "banco" (o `Map` de linhas) e duas instâncias do servidor, cada uma com os seus jobs vivos (o
 * `AbortController` não atravessa processos) e o mesmo relógio. É o cenário que a S24 resolve: a leitura roda numa,
 * o F5 / o deploy faz o cliente cair noutra.
 */
function cluster(t0 = 1_000_000) {
  const rows = new Map<string, JobRecord>();
  const clock = { now: t0 };
  const table = memoryExtractJobsTable(rows);
  const writes = { progress: 0 };
  const counted = { ...table, progress: (...a: Parameters<typeof table.progress>) => (writes.progress++, table.progress(...a)) };
  const instance = (): Deps => ({ table: async () => counted, live: new Map(), now: () => clock.now, heartbeatMs: HEARTBEAT_MS });
  return { rows, clock, writes, a: instance(), b: instance() };
}

afterEach(() => vi.useRealTimers());

describe('jobs de leitura no banco (S24)', () => {
  it('progresso, fim e resultado entregue uma vez — a outra instância responde depois que a leitura termina', async () => {
    const { clock, a, b } = cluster();
    const job = await startJob('job-00000001', 'u1', a);
    clock.now += 500;
    expect(await jobProgress('job-00000001', 'u1', a)).toMatchObject({ status: 'running', phase: 'preparing', outputTokens: 0, elapsedMs: 500 });
    job.report({ phase: 'reading', inputTokens: 21_000, outputTokens: 4_000 });
    // Na instância que roda: na hora. Na outra: só depois do batimento.
    expect(await jobProgress('job-00000001', 'u1', a)).toMatchObject({ phase: 'reading', inputTokens: 21_000, outputTokens: 4_000 });
    expect(await jobProgress('job-00000001', 'u1', b)).toMatchObject({ status: 'running', phase: 'preparing', outputTokens: 0 });
    await job.beat();
    expect(await jobProgress('job-00000001', 'u1', b)).toMatchObject({ status: 'running', phase: 'reading', inputTokens: 21_000, outputTokens: 4_000 });
    expect(await takeResult('job-00000001', 'u1', b)).toBeUndefined();
    clock.now += 1_500;
    await job.finish(ok);
    clock.now += 60_000;
    expect(await jobProgress('job-00000001', 'u1', b)).toMatchObject({ status: 'done', elapsedMs: 2_000 });
    expect(await takeResult('job-00000001', 'u1', b)).toEqual(ok);
    expect(await takeResult('job-00000001', 'u1', a)).toBeUndefined();
    expect(await jobProgress('job-00000001', 'u1', a)).toMatchObject({ status: 'unknown' });
  });

  it('o progresso vai ao banco com moderação: um batimento a cada HEARTBEAT_MS, não um por token', async () => {
    vi.useFakeTimers();
    const { writes, a, b } = cluster();
    const job = await startJob('job-00000002', 'u1', a);
    for (let t = 1; t <= 3_000; t++) job.report({ phase: 'reading', outputTokens: t });
    expect(writes.progress).toBe(0);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(writes.progress).toBe(1);
    expect(await jobProgress('job-00000002', 'u1', b)).toMatchObject({ outputTokens: 3_000 });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(writes.progress).toBe(4);
    await job.finish(ok);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(writes.progress).toBe(4);
  });

  it('só o dono vê, cancela e recolhe; job de outro é igual a inexistente', async () => {
    const { a, b } = cluster();
    const job = await startJob('job-00000003', 'u1', a);
    expect(await jobProgress('job-00000003', 'u2', a)).toMatchObject({ status: 'unknown' });
    expect(await jobProgress('job-00000003', 'u2', b)).toMatchObject({ status: 'unknown' });
    expect(await cancelJob('job-00000003', 'u2', a)).toBe(false);
    expect(await cancelJob('job-00000003', 'u2', b)).toBe(false);
    expect(job.signal.aborted).toBe(false);
    await job.finish(ok);
    expect(await takeResult('job-00000003', 'u2', b)).toBeUndefined();
    expect(await takeResult('job-00000003', undefined, b)).toBeUndefined();
    expect(await takeResult('job-00000003', 'u1', b)).toEqual(ok);
  });

  it('cancelar na instância que roda aborta na hora; noutra, marca no banco e o batimento aborta', async () => {
    const { a, b } = cluster();
    const here = await startJob('job-00000004', 'u1', a);
    expect(await cancelJob('job-00000004', 'u1', a)).toBe(true);
    expect(here.signal.aborted).toBe(true);
    await here.finish({ ok: false, reason: 'cancelled', message: 'Read cancelled.' });
    expect(await cancelJob('job-00000004', 'u1', a)).toBe(false);
    expect(await jobProgress('job-00000004', 'u1', b)).toMatchObject({ status: 'cancelled', message: 'Read cancelled.' });

    const there = await startJob('job-00000005', 'u1', a);
    expect(await cancelJob('job-00000005', 'u1', b)).toBe(true);
    expect(there.signal.aborted).toBe(false);
    await there.beat();
    expect(there.signal.aborted).toBe(true);
    expect(await cancelJob('nope-nope', 'u1', b)).toBe(false);
  });

  it('sobrevive a restart: o processo some, a linha fica; running sem batimento vira falha com mensagem', async () => {
    const { clock, a, b } = cluster();
    const done = await startJob('job-00000006', 'u1', a);
    await done.finish(ok);
    const dying = await startJob('job-00000007', 'u1', a);
    dying.report({ phase: 'reading', outputTokens: 9_000 });
    await dying.beat();
    // "restart": a instância a morre sem chamar finish; o cliente cai na b.
    a.live!.clear();
    clock.now += STALE_MS - 1;
    expect(await jobProgress('job-00000007', 'u1', b)).toMatchObject({ status: 'running', outputTokens: 9_000 });
    clock.now += 2;
    expect(await jobProgress('job-00000007', 'u1', b)).toMatchObject({ status: 'failed', message: LOST_MESSAGE });
    expect(await takeResult('job-00000007', 'u1', b)).toBeUndefined();
    expect(await takeResult('job-00000006', 'u1', b)).toEqual(ok);
  });

  it('abrir um job varre os do mesmo dono sem atividade há JOB_TTL_MS; os de outro dono e os recentes ficam', async () => {
    const { rows, clock, a } = cluster();
    await (await startJob('job-old-u1', 'u1', a)).finish(ok);
    await (await startJob('job-old-u2', 'u2', a)).finish(ok);
    clock.now += JOB_TTL_MS / 2;
    await (await startJob('job-mid-u1', 'u1', a)).finish(ok);
    clock.now += JOB_TTL_MS / 2 + 1;
    await startJob('job-new-u1', 'u1', a);
    expect([...rows.keys()].sort()).toEqual(['job-mid-u1', 'job-new-u1', 'job-old-u2']);
  });

  it('banco fora do ar: a leitura roda igual (a action devolve o resultado) e o cancelamento local funciona', async () => {
    const broken: Deps = { table: async () => Promise.reject(new Error('down')), live: new Map(), now: () => 0 };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const job = await startJob('job-00000008', 'u1', broken);
    expect(await cancelJob('job-00000008', 'u1', broken)).toBe(true);
    expect(job.signal.aborted).toBe(true);
    await job.beat();
    await job.finish(ok);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
