import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExtractError, ExtractInputError, finish, type ExtractRequest } from 'extract';
import type { UploadedFile } from './extract.service';

vi.mock('server-only', () => ({}));
const { extractModelOptions, fromFiles, fromRecorded, replayRecorded, toSource, preview } = await import('./extract.service');
const { jobProgress, memoryExtractJobsTable, takeResult } = await import('./extract-jobs');
const jobsDeps = () => ((table) => ({ table: async () => table, live: new Map() }))(memoryExtractJobsTable()) satisfies import('./extract-jobs').ExtractJobsDeps;

const ringgoldRaw = JSON.parse(
  readFileSync(new URL('../../../extract/test/fixtures/ringgold-output.json', import.meta.url), 'utf8'),
) as unknown;
const pdf: UploadedFile = { name: 'plan.pdf', type: 'application/pdf', bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]) };
const png: UploadedFile = { name: 'photo.PNG', type: '', bytes: Uint8Array.from([0x89, 0x50]) };

describe('toSource', () => {
  it('PDF pelo MIME ou pela extensão; imagem pela extensão quando o MIME vem vazio', () => {
    expect(toSource(pdf, [3, 15])).toEqual({ kind: 'pdf', name: 'plan.pdf', data: pdf.bytes, pages: [3, 15] });
    expect(toSource({ ...pdf, type: '' }, undefined)).toEqual({ kind: 'pdf', name: 'plan.pdf', data: pdf.bytes });
    expect(toSource(png, undefined)).toEqual({ kind: 'image', name: 'photo.PNG', data: png.bytes, mediaType: 'image/png' });
    expect(toSource({ name: 'a.dxf', type: '', bytes: new Uint8Array() }, undefined)).toMatch(/Unsupported file: a\.dxf/);
  });
});

describe('fromFiles', () => {
  it('sem chave: no_key antes de tocar nos arquivos', async () => {
    const extract = vi.fn();
    const r = await fromFiles([pdf], {}, { extract, hasKey: () => false });
    expect(r).toMatchObject({ ok: false, reason: 'no_key' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('sem arquivos ou com arquivo não suportado: input', async () => {
    const deps = { extract: vi.fn(), hasKey: () => true };
    expect(await fromFiles([], {}, deps)).toMatchObject({ ok: false, reason: 'input' });
    expect(await fromFiles([{ name: 'x.dwg', type: '', bytes: new Uint8Array() }], {}, deps)).toMatchObject({ ok: false, reason: 'input' });
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it('com chave: monta as fontes, repassa dicas e páginas, e devolve a revisão', async () => {
    let seen: ExtractRequest | undefined;
    const extract = vi.fn(async (req: ExtractRequest) => {
      seen = req;
      return { ...finish(ringgoldRaw, undefined, 'fake', { inputTokens: 5, outputTokens: 2 }), pagesSent: [{ name: 'plan.pdf', pages: [3, 15] }] };
    });
    const r = await fromFiles([pdf, png], { pages: [3, 15], hints: { level: 1, extra: 'ignore garage' } }, { extract, hasKey: () => true });
    expect(seen?.sources?.map((s) => s.kind)).toEqual(['pdf', 'image']);
    expect(seen?.hints).toEqual({ level: 1, extra: 'ignore garage' });
    if (!r.ok) throw new Error(r.message);
    expect(r.projectName).toBe('26 Ringgold St');
    expect(r.walls.map((w) => w.id)).toEqual(['N1', 'S1', 'S2', 'I1']);
    expect(r.walls[0]).toMatchObject({ geometry: `16' - 0"`, section: '2x6', exterior: true, bearing: true, confidence: 0.9 });
    expect(r.walls[2]?.openings).toEqual([
      { id: 'S2-D1', kind: '1', position: `2' - 4 1/2"`, confidence: 0.9 },
      { id: 'S2-A', kind: 'A2', position: `7' - 1"`, confidence: 0.9 },
    ]);
    expect(r.openingTypes.map((t) => t.tag)).toEqual(['1', 'A2', 'U2']);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toHaveLength(2); // P30 na S2: 1 jack por lado nas duas aberturas, com aviso
    expect(JSON.parse(r.projectText)).toMatchObject({ name: '26 Ringgold St' });
    expect(r.pagesSent).toEqual([{ name: 'plan.pdf', pages: [3, 15] }]);
    expect(r.model).toBe('fake');
  });

  it('S25: proveniência e uso com cache chegam à leitura; modelo e effort do ambiente vão para a chamada', async () => {
    const provenance = { promptHash: '0123456789abcdef', model: 'claude-opus-5-5', effort: 'high' as const, maxTokens: 128000, tiles: false as const };
    const usage = { inputTokens: 20_989, outputTokens: 70_240, cacheCreationInputTokens: 6_000 };
    let seenOpts: unknown;
    const extract = vi.fn(async (_req: ExtractRequest, opts: unknown) => {
      seenOpts = opts;
      return { ...finish(ringgoldRaw, undefined, 'claude-opus-5-5', usage), provenance };
    });
    const before = { model: process.env['EXTRACT_MODEL'], effort: process.env['EXTRACT_EFFORT'] };
    process.env['EXTRACT_MODEL'] = 'claude-sonnet-5-5';
    process.env['EXTRACT_EFFORT'] = 'medium';
    try {
      const r = await fromFiles([pdf], {}, { extract, hasKey: () => true });
      if (!r.ok) throw new Error(r.message);
      expect(seenOpts).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' });
      expect(r.provenance).toEqual(provenance);
      expect(r.usage).toEqual(usage);
      const { reconvert } = await import('./extract.service');
      const again = reconvert(r.output, r.given, { model: r.model, pagesSent: r.pagesSent, provenance: r.provenance });
      expect(again.ok && again.provenance).toEqual(provenance);
    } finally {
      for (const [k, v] of [['EXTRACT_MODEL', before.model], ['EXTRACT_EFFORT', before.effort]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('ExtractError vira extraction com a frase do código e o texto cru em detail; RangeError vira input', async () => {
    const bad = { extract: vi.fn(async () => { throw new ExtractError('resposta fora do schema', '{"x":1}', { code: 'SCHEMA_MISMATCH' }); }), hasKey: () => true };
    expect(await fromFiles([pdf], {}, bad)).toEqual({ ok: false, reason: 'extraction', message: 'The AI response does not match the expected format. Try again.', detail: 'resposta fora do schema', code: 'SCHEMA_MISMATCH', rawText: '{"x":1}' });
    const page = { extract: vi.fn(async () => { throw new ExtractInputError('PAGE_OUT_OF_RANGE', 'página 9 fora do PDF (3 páginas)', { page: 9, pages: 3 }); }), hasKey: () => true };
    expect(await fromFiles([pdf], {}, page)).toEqual({ ok: false, reason: 'input', message: 'Page 9 is not in the PDF (it has 3 pages).', detail: 'página 9 fora do PDF (3 páginas)', code: 'PAGE_OUT_OF_RANGE' });
    const range = { extract: vi.fn(async () => { throw new RangeError('página 9 fora do PDF'); }), hasKey: () => true };
    expect(await fromFiles([pdf], {}, range)).toEqual({ ok: false, reason: 'input', message: 'The files could not be read. See Details.', detail: 'página 9 fora do PDF' });
  });
});

describe('reconvert (dados do projeto na revisão, sem IA)', () => {
  it('reaplica altura e estrutural a uma leitura sem cortes; mantém modelo e páginas', async () => {
    const noHeight = { ...(ringgoldRaw as Record<string, unknown>), wallHeight: null };
    const first = fromRecorded(noHeight);
    if (!first.ok) throw new Error(first.message);
    expect(first.problems[0]).toMatchObject({ source: 'project', code: 'WALL_HEIGHT_MISSING' });
    const { reconvert } = await import('./extract.service');
    const second = reconvert(first.output, { ...first.given, wallHeight: `9' - 1 1/8"` }, { model: 'm', pagesSent: [{ name: 'p.pdf', pages: [3] }] });
    if (!second.ok) throw new Error(second.message);
    expect(second.problems.filter((p) => p.code === 'WALL_HEIGHT_MISSING')).toEqual([]);
    expect(second.given.wallHeight).toBe(`9' - 1 1/8"`);
    expect(second.model).toBe('m');
    expect(second.pagesSent).toEqual([{ name: 'p.pdf', pages: [3] }]);
    const walls = (JSON.parse(second.projectText) as { walls: { height?: string }[] }).walls;
    expect(walls).toHaveLength(4);
    expect(walls.every((w) => w.height === `9' - 1 1/8"`)).toBe(true);
  });
});

describe('fromRecorded', () => {
  it('resposta gravada válida vira revisão sem chave', () => {
    const r = fromRecorded(ringgoldRaw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model).toBe('recorded');
  });

  it('fora do schema vira extraction', () => {
    expect(fromRecorded({ projectName: 'x' })).toMatchObject({ ok: false, reason: 'extraction' });
  });
});

describe('replayRecorded (S23, A9: finishResponse com guarda de devTools)', () => {
  const sample = (id: string): string | undefined => (id === 'ringgold-reading' ? JSON.stringify(ringgoldRaw) : undefined);
  it('sample pelo id funciona sempre; JSON colado só com dev tools', () => {
    expect(replayRecorded({ sampleId: 'ringgold-reading' }, { devTools: false, sample }).ok).toBe(true);
    expect(replayRecorded({ sampleId: 'nope' }, { devTools: true, sample })).toMatchObject({ ok: false, reason: 'input' });
    const pasted = JSON.stringify(ringgoldRaw);
    expect(replayRecorded({ responseJson: pasted }, { devTools: false, sample })).toMatchObject({ ok: false, reason: 'input', message: expect.stringContaining('development server') });
    expect(replayRecorded({ responseJson: pasted }, { devTools: true, sample }).ok).toBe(true);
    expect(replayRecorded({ responseJson: '{' }, { devTools: true, sample })).toMatchObject({ ok: false, reason: 'input' });
    expect(replayRecorded({}, { devTools: true, sample })).toMatchObject({ ok: false, reason: 'input' });
  });
});

describe('M7: prévia, páginas por arquivo, job e cancelamento', () => {

  it('preview monta as fontes (páginas por arquivo vencem as gerais) e devolve páginas, folhas fora e tamanho sem chave', async () => {
    let seen: ExtractRequest | undefined;
    const fakePreview = vi.fn(async (req: ExtractRequest) => {
      seen = req;
      return {
        pagesSent: [{ name: 'plan.pdf', pages: [3, 15] }],
        pagesDropped: [{ source: 0, name: 'plan.pdf', page: 7, sheet: 'A-201', category: 'elevation' as const }],
        duplicates: [],
        sheets: [
          { source: 0, name: 'plan.pdf', page: 3, sheet: 'A-100', title: 'First Floor Plan', category: 'plan' as const },
          { source: 0, name: 'plan.pdf', page: 15, sheet: 'A-800' },
        ],
        encodedBytes: 1234,
        images: 1,
        tiles: { count: 6, encodedBytes: 900, pages: [{ name: 'plan.pdf', page: 3, tiles: 6, dpi: 164 }], skipped: [] },
        textChars: 16_730,
        warnings: [],
      };
    });
    const r = await preview([pdf, png], { pages: [1], pagesByFile: { 'plan.pdf': [3, 15] } }, { extract: vi.fn(), preview: fakePreview, hasKey: () => false });
    expect(seen?.sources?.[0]).toMatchObject({ kind: 'pdf', pages: [3, 15] });
    expect(r).toMatchObject({ ok: true, pagesTotal: 2, images: 1, encodedBytes: 1234, tiles: { count: 6, encodedBytes: 900 }, textChars: 16_730 });
    if (!r.ok) throw new Error('prévia falhou');
    expect(r.files[0]).toEqual({ name: 'plan.pdf', kind: 'pdf', pages: [{ page: 3, sheet: 'A-100', title: 'First Floor Plan', category: 'plan' }, { page: 15, sheet: 'A-800' }], dropped: [{ page: 7, sheet: 'A-201', category: 'elevation' }] });
    expect(r.files[1]).toMatchObject({ name: 'photo.PNG', kind: 'image', pages: [] });
    expect(await preview([], {}, { extract: vi.fn(), preview: fakePreview, hasKey: () => true })).toMatchObject({ ok: false });
    const failing = vi.fn(async () => {
      throw new RangeError('nenhuma folha útil');
    });
    expect(await preview([pdf], {}, { extract: vi.fn(), preview: failing, hasKey: () => true })).toEqual({ ok: false, message: 'The files could not be read. See Details.', detail: 'nenhuma folha útil' });
  });

  it('S25: dois arquivos com o mesmo nome — cada um fica com as páginas da sua fonte (índice, não nome)', async () => {
    const twin = { ...pdf };
    const fakePreview = vi.fn(async () => ({
      pagesSent: [
        { name: 'plan.pdf', pages: [1] },
        { name: 'plan.pdf', pages: [2] },
      ],
      pagesDropped: [],
      duplicates: [],
      sheets: [
        { source: 0, name: 'plan.pdf', page: 1, sheet: 'A-100' },
        { source: 1, name: 'plan.pdf', page: 2, sheet: 'A-800' },
      ],
      encodedBytes: 10,
      images: 0,
      tiles: { count: 0, encodedBytes: 0, pages: [], skipped: [] },
      textChars: 100,
      warnings: [],
    }));
    const r = await preview([pdf, twin], {}, { extract: vi.fn(), preview: fakePreview, hasKey: () => true });
    if (!r.ok) throw new Error('prévia falhou');
    expect(r.files.map((f) => f.pages.map((p) => p.sheet))).toEqual([['A-100'], ['A-800']]);
  });

  it('S25: EXTRACT_MODEL e EXTRACT_EFFORT do ambiente; vazio ou effort inválido ficam no padrão', () => {
    expect(extractModelOptions({})).toEqual({});
    expect(extractModelOptions({ EXTRACT_MODEL: ' claude-sonnet-5-5 ', EXTRACT_EFFORT: 'XHIGH' })).toEqual({ model: 'claude-sonnet-5-5', effort: 'xhigh' });
    expect(extractModelOptions({ EXTRACT_MODEL: '', EXTRACT_EFFORT: 'turbo' })).toEqual({});
  });

  it('com jobId: registra o job do dono, repassa signal e progresso, e guarda o resultado (com os desenhos) para ser recolhido', async () => {
    const table = memoryExtractJobsTable();
    const jobs = { table: async () => table, live: new Map() };
    const drawings = [{ name: 'plan.pdf', path: 'up-1/plan.pdf', size: 4, type: 'application/pdf' }];
    const extract = vi.fn(async (_req: ExtractRequest, opts: { signal?: AbortSignal; onProgress?: (p: { phase: 'reading'; outputTokens: number }) => void }) => {
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      opts.onProgress?.({ phase: 'reading', outputTokens: 5000 });
      void jobProgress('job-abcdefgh', 'u1', jobs).then((p) => expect(p).toMatchObject({ status: 'running', phase: 'reading', outputTokens: 5000 }));
      return finish(ringgoldRaw, undefined, 'fake', { inputTokens: 1, outputTokens: 2 });
    });
    const r = await fromFiles([pdf], { jobId: 'job-abcdefgh', owner: 'u1', drawings }, { extract: extract as never, hasKey: () => true, jobs });
    expect(r).toMatchObject({ ok: true, drawings });
    expect(await jobProgress('job-abcdefgh', 'u1', jobs)).toMatchObject({ status: 'done' });
    expect(await jobProgress('job-abcdefgh', 'u2', jobs)).toMatchObject({ status: 'unknown' });
    expect(await takeResult('job-abcdefgh', 'u2', jobs)).toBeUndefined();
    expect(await takeResult('job-abcdefgh', 'u1', jobs)).toEqual(r);
    expect(await takeResult('job-abcdefgh', 'u1', jobs)).toBeUndefined();
  });

  it('chamada abortada vira `cancelled` (não erro) e o job termina como cancelado', async () => {
    const jobs = jobsDeps();
    const extract = vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const r = await fromFiles([pdf], { jobId: 'job-cancel01' }, { extract, hasKey: () => true, jobs });
    expect(r).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(await jobProgress('job-cancel01', undefined, jobs)).toMatchObject({ status: 'cancelled' });
  });

  it('erro inesperado sobe para a action, mas o job não fica `running` com batimento eterno', async () => {
    const jobs = jobsDeps();
    const extract = vi.fn(async () => {
      throw new TypeError('bug');
    });
    await expect(fromFiles([pdf], { jobId: 'job-boom0001' }, { extract, hasKey: () => true, jobs })).rejects.toThrow('bug');
    expect(await jobProgress('job-boom0001', undefined, jobs)).toMatchObject({ status: 'failed' });
    expect(jobs.live.size).toBe(0);
  });
});

describe('S26: a leitura gravada do Ringgold sai com códigos em inglês e frases em inglês', () => {
  it('avisos e problemas da conversão: código novo, frase sem português', async () => {
    const { englishMessage } = await import('@/lib/messages.en');
    const sample = JSON.parse(readFileSync(new URL('../samples/ringgold-st-multifamily-reading.json', import.meta.url), 'utf8')) as unknown;
    const r = fromRecorded(sample);
    if (!r.ok) throw new Error(r.message);
    expect(r.warnings.length).toBeGreaterThan(0);
    for (const n of [...r.warnings, ...r.problems]) {
      expect(n.code, n.message).not.toMatch(/ABERTURA|ALTURA|COMODO|FOLHA|RECORTES|CARIMBO/);
      const text = englishMessage(n);
      expect(text, n.code).toBeDefined();
      expect(text, n.code).not.toMatch(/\b(parede|abertura|não|leitura|hipótese)\b|ção/);
    }
  });
});
