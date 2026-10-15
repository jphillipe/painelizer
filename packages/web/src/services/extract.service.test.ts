import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExtractError, finish, type ExtractRequest } from 'extract';
import type { UploadedFile } from './extract.service';

vi.mock('server-only', () => ({}));
const { fromFiles, fromRecorded, toSource } = await import('./extract.service');

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
    expect(r.problems).toHaveLength(1); // P30 na S2
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
