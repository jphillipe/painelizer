import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExtractError, finish, type ExtractRequest } from 'extract';
import type { UploadedFile } from './extract.service';

vi.mock('server-only', () => ({}));
const { fromFiles, fromRecorded, toSource, preview } = await import('./extract.service');
const { registry, jobProgress, takeResult } = await import('./extract-jobs');

const ringgoldRaw = JSON.parse(
  readFileSync('C:/Users/Phillipe/Desktop/painelizer/packages/extract/test/fixtures/ringgold-output.json', 'utf8'),
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

  it('ExtractError vira extraction com o texto cru; RangeError vira input', async () => {
    const bad = { extract: vi.fn(async () => { throw new ExtractError('resposta fora do schema', '{"x":1}'); }), hasKey: () => true };
    expect(await fromFiles([pdf], {}, bad)).toEqual({ ok: false, reason: 'extraction', message: 'resposta fora do schema', rawText: '{"x":1}' });
    const range = { extract: vi.fn(async () => { throw new RangeError('página 9 fora do PDF'); }), hasKey: () => true };
    expect(await fromFiles([pdf], {}, range)).toEqual({ ok: false, reason: 'input', message: 'página 9 fora do PDF' });
  });
});

describe('reconvert (dados do projeto na revisão, sem IA)', () => {
  it('reaplica altura e estrutural a uma leitura sem cortes; mantém modelo e páginas', async () => {
    const noHeight = { ...(ringgoldRaw as Record<string, unknown>), wallHeight: null };
    const first = fromRecorded(noHeight);
    if (!first.ok) throw new Error(first.message);
    expect(first.problems[0]).toMatch(/^altura:/);
    const { reconvert } = await import('./extract.service');
    const second = reconvert(first.output, { ...first.given, wallHeight: `9' - 1 1/8"` }, { model: 'm', pagesSent: [{ name: 'p.pdf', pages: [3] }] });
    if (!second.ok) throw new Error(second.message);
    expect(second.problems.filter((p) => p.startsWith('altura'))).toEqual([]);
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

describe('M7: prévia, páginas por arquivo, job e cancelamento', () => {

  it('preview monta as fontes (páginas por arquivo vencem as gerais) e devolve páginas, folhas fora e tamanho sem chave', async () => {
    let seen: ExtractRequest | undefined;
    const fakePreview = vi.fn(async (req: ExtractRequest) => {
      seen = req;
      return { pagesSent: [{ name: 'plan.pdf', pages: [3, 15] }], pagesDropped: [{ name: 'plan.pdf', page: 7, sheet: 'A-201', category: 'elevation' as const }], sheets: [{ name: 'plan.pdf', page: 3, sheet: 'A-100', title: 'First Floor Plan' }, { name: 'plan.pdf', page: 15, sheet: 'A-800' }], encodedBytes: 1234, images: 1 };
    });
    const r = await preview([pdf, png], { pages: [1], pagesByFile: { 'plan.pdf': [3, 15] } }, { extract: vi.fn(), preview: fakePreview, hasKey: () => false });
    expect(seen?.sources?.[0]).toMatchObject({ kind: 'pdf', pages: [3, 15] });
    expect(r).toMatchObject({ ok: true, pagesTotal: 2, images: 1, encodedBytes: 1234 });
    if (!r.ok) throw new Error('prévia falhou');
    expect(r.files[0]).toEqual({ name: 'plan.pdf', kind: 'pdf', pages: [{ page: 3, sheet: 'A-100', title: 'First Floor Plan' }, { page: 15, sheet: 'A-800' }], dropped: [{ page: 7, sheet: 'A-201', category: 'elevation' }] });
    expect(r.files[1]).toMatchObject({ name: 'photo.PNG', kind: 'image', pages: [] });
    expect(await preview([], {}, { extract: vi.fn(), preview: fakePreview, hasKey: () => true })).toMatchObject({ ok: false });
    const failing = vi.fn(async () => {
      throw new RangeError('nenhuma folha útil');
    });
    expect(await preview([pdf], {}, { extract: vi.fn(), preview: failing, hasKey: () => true })).toEqual({ ok: false, message: 'nenhuma folha útil' });
  });

  it('com jobId: registra o job, repassa signal e progresso, e guarda o resultado para ser recolhido', async () => {
    registry().clear();
    const extract = vi.fn(async (_req: ExtractRequest, opts: { signal?: AbortSignal; onProgress?: (p: { phase: 'reading'; outputTokens: number }) => void }) => {
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      opts.onProgress?.({ phase: 'reading', outputTokens: 5000 });
      expect(jobProgress('job-abcdefgh')).toMatchObject({ status: 'running', phase: 'reading', outputTokens: 5000 });
      return finish(ringgoldRaw, undefined, 'fake', { inputTokens: 1, outputTokens: 2 });
    });
    const r = await fromFiles([pdf], { jobId: 'job-abcdefgh' }, { extract: extract as never, hasKey: () => true });
    expect(r.ok).toBe(true);
    expect(jobProgress('job-abcdefgh')).toMatchObject({ status: 'done' });
    expect(takeResult('job-abcdefgh')).toBe(r);
    expect(takeResult('job-abcdefgh')).toBeUndefined();
  });

  it('chamada abortada vira `cancelled` (não erro) e o job termina como cancelado', async () => {
    registry().clear();
    const extract = vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const r = await fromFiles([pdf], { jobId: 'job-cancel01' }, { extract, hasKey: () => true });
    expect(r).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(jobProgress('job-cancel01')).toMatchObject({ status: 'cancelled' });
  });
});
