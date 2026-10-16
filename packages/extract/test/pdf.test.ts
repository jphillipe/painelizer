import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatPageText, listSheets, pageCount, readPageText, subsetPdf } from '../src/pdf';
import { classifySheet } from '../src/select';
import { makePdf, PAGE_H, PAGE_W } from './helpers/makePdf';

const RINGGOLD = 'C:/Users/Phillipe/Desktop/painelizer/docs/examples/26 Ringgold St  Providence RI Rev 5 Stamped (1) (1).pdf';

describe('readPageText — texto posicionado', () => {
  it('devolve dimensões da página e as linhas agrupadas por y, com x de cada trecho', async () => {
    const pdf = await makePdf();
    const pt = await readPageText(pdf, 1);
    expect(pt.page).toBe(1);
    expect(pt.width).toBe(PAGE_W);
    expect(pt.height).toBe(PAGE_H);

    // Dois textos na mesma linha (baseline y=700 → 92 do topo), em x crescente.
    const row = pt.lines.find((l) => l.y === PAGE_H - 700 && l.rotation === 0);
    expect(row?.runs).toEqual([
      { x: 100, text: `16' - 0"` },
      { x: 300, text: `8' - 5 7/8"` },
    ]);
  });

  it('marca a rotação das cotas verticais', async () => {
    const pt = await readPageText(await makePdf(), 1);
    const rotated = pt.lines.filter((l) => l.rotation === 90);
    expect(rotated).toHaveLength(1);
    expect(rotated[0]?.runs).toEqual([{ x: 50, text: `29' - 0"` }]);
    expect(rotated[0]?.y).toBe(PAGE_H - 300);
  });

  it('linhas vêm do topo para a base', async () => {
    const pt = await readPageText(await makePdf(), 1);
    const ys = pt.lines.map((l) => l.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('página fora do PDF é RangeError', async () => {
    const pdf = await makePdf();
    await expect(readPageText(pdf, 3)).rejects.toThrow(RangeError);
    await expect(readPageText(pdf, 0)).rejects.toThrow(RangeError);
  });

  it('não consome o buffer do chamador', async () => {
    const pdf = await makePdf();
    const before = pdf.byteLength;
    await readPageText(pdf, 1);
    await readPageText(pdf, 2);
    expect(pdf.byteLength).toBe(before);
  });
});

describe('formatPageText', () => {
  it('cabeçalho com a página e uma linha por grupo, determinístico', async () => {
    const pt = await readPageText(await makePdf(), 1);
    const text = formatPageText(pt);
    expect(text.split('\n')[0]).toBe(`# página 1 · ${PAGE_W}×${PAGE_H} pt · y cresce para baixo; [x] antecede cada trecho`);
    expect(text).toContain(`y=${PAGE_H - 700}  [100] 16' - 0"  [300] 8' - 5 7/8"`);
    expect(text).toContain(`y=${PAGE_H - 300} rot=90  [50] 29' - 0"`);
    expect(formatPageText(pt)).toBe(text);
  });
});

describe('listSheets / subsetPdf', () => {
  it('acha o número da folha pelo texto maior do carimbo', async () => {
    const sheets = await listSheets(await makePdf());
    expect(sheets).toEqual([
      { page: 1, sheet: 'A-100' },
      { page: 2, sheet: 'A-800' },
    ]);
  });

  it('subsetPdf recorta só as páginas pedidas, na ordem', async () => {
    const pdf = await makePdf();
    const only = await subsetPdf(pdf, [2]);
    expect(await pageCount(only)).toBe(1);
    expect(await listSheets(only)).toEqual([{ page: 1, sheet: 'A-800' }]);

    const swapped = await subsetPdf(pdf, [2, 1]);
    expect((await listSheets(swapped)).map((s) => s.sheet)).toEqual(['A-800', 'A-100']);
  });

  it('subsetPdf valida as páginas', async () => {
    const pdf = await makePdf();
    await expect(subsetPdf(pdf, [])).rejects.toThrow(RangeError);
    await expect(subsetPdf(pdf, [5])).rejects.toThrow(RangeError);
  });
});

describe.skipIf(!existsSync(RINGGOLD))('26 Ringgold St (docs/examples, fora do git)', () => {
  const data = () => new Uint8Array(readFileSync(RINGGOLD));

  it('15 páginas; o título do carimbo leva às folhas úteis (plantas, elevações, cortes, schedules)', async () => {
    const sheets = await listSheets(data());
    expect(sheets).toHaveLength(15);
    expect(sheets[2]).toMatchObject({ sheet: 'A-100', title: expect.stringContaining('Floor Plans') });
    expect(sheets[14]).toMatchObject({ sheet: 'A-800', title: expect.stringContaining('Schedules') });
    const useful = sheets.filter((s) => classifySheet(s, '', 1) !== 'skip').map((s) => s.page);
    expect(useful).toEqual(expect.arrayContaining([3, 6, 7, 9, 15]));
    expect(useful).not.toContain(1);
  }, 60_000);

  it('a A-100 traz as cotas da parede norte e as notas de convenção', async () => {
    const text = formatPageText(await readPageText(data(), 3));
    expect(text).toContain(`8' - 5 7/8"`);
    expect(text).toContain('ALL EXTERIOR DIMENSIONS ARE TAKEN FROM OUTSIDE');
    expect(text).toContain('OF THE DOOR.');
  }, 60_000);
});
