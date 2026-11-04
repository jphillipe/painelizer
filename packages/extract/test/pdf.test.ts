import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { formatPageText, listSheets, pageCount, readPageText, renderPageTiles, subsetPdf } from '../src/pdf';
import { DEFAULT_TILE_OPTIONS, planTiles } from '../src/tiles';
import { classifySheet } from '../src/select';
import { makeLabeledPdf, makePdf, PAGE_H, PAGE_W } from './helpers/makePdf';

const RINGGOLD = new URL('../../../docs/examples/26 Ringgold St  Providence RI Rev 5 Stamped (1) (1).pdf', import.meta.url);

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

  it('carimbo com rótulo (Matilda): número sem hífen ou com ponto, título abaixo do rótulo, sem o carimbo de rascunho', async () => {
    const sheets = await listSheets(await makeLabeledPdf());
    expect(sheets).toEqual([
      { page: 1, sheet: 'A202', title: 'FIRST LEVEL FLOOR PLAN' },
      { page: 2, sheet: 'SA1.1', title: 'APARTMENT FIRST LEVEL PLAN' },
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

describe('renderPageTiles — recortes em alta resolução', () => {
  const pngSize = (bytes: Uint8Array) => {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  };

  it('PNG do tamanho da grade, com desenho dentro (não em branco), determinístico', async () => {
    const pdf = await makePdf();
    const grid = planTiles({ width: PAGE_W, height: PAGE_H }, 200, DEFAULT_TILE_OPTIONS);
    const tiles = await renderPageTiles(pdf, 1, grid);
    expect(tiles).toHaveLength(1);
    const [t] = tiles;
    if (!t) throw new Error('esperado recorte');
    expect(t.mediaType).toBe('image/png');
    expect(Array.from(t.data.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(pngSize(t.data)).toEqual({ width: t.width, height: t.height });
    expect(t).toMatchObject({ x0: 0, y0: 0, x1: PAGE_W, y1: PAGE_H });

    // O retângulo do makePdf (x 120–420, y 380–392 do topo) sai escuro; o canto superior esquerdo fica branco.
    const img = await loadImage(Buffer.from(t.data));
    const canvas = createCanvas(t.width, t.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const at = (x: number, y: number) => ctx.getImageData(Math.round(x * grid.scale), Math.round(y * grid.scale), 1, 1).data;
    const dark = at(270, 386);
    const white = at(10, 10);
    expect(dark[0]).toBeLessThan(120);
    expect(white[0]).toBe(255);

    const again = await renderPageTiles(pdf, 1, grid);
    expect(Buffer.from(again[0]!.data).equals(Buffer.from(t.data))).toBe(true);
  }, 30_000);

  it('grade com vários recortes: cada um na sua região, JPEG quando pedido', async () => {
    const pdf = await makePdf();
    const grid = planTiles({ width: PAGE_W, height: PAGE_H }, 200, { ...DEFAULT_TILE_OPTIONS, maxPerPage: 4 }, 4);
    const forced: typeof grid = grid.tiles.length > 1 ? grid : { ...grid, rows: 2, cols: 1, tiles: [
      { row: 1, col: 1, x0: 0, y0: 0, x1: PAGE_W, y1: 420, width: Math.round(PAGE_W * grid.scale), height: Math.round(420 * grid.scale) },
      { row: 2, col: 1, x0: 0, y0: 372, x1: PAGE_W, y1: PAGE_H, width: Math.round(PAGE_W * grid.scale), height: Math.round((PAGE_H - 372) * grid.scale) },
    ] };
    const tiles = await renderPageTiles(pdf, 1, forced, 'jpeg');
    expect(tiles).toHaveLength(forced.tiles.length);
    for (const t of tiles) {
      expect(t.mediaType).toBe('image/jpeg');
      expect(Array.from(t.data.slice(0, 2))).toEqual([0xff, 0xd8]);
    }
    // O retângulo (y 380–392 do topo) está nos dois recortes da grade forçada: ambos têm pixels escuros.
    const first = tiles[0]!;
    const img = await loadImage(Buffer.from(first.data));
    const canvas = createCanvas(first.width, first.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(Math.round(270 * forced.scale), Math.round((386 - first.y0) * forced.scale), 1, 1).data;
    expect(px[0]).toBeLessThan(140);
  }, 30_000);

  it('página fora do PDF é RangeError e o buffer do chamador fica intacto', async () => {
    const pdf = await makePdf();
    const grid = planTiles({ width: PAGE_W, height: PAGE_H }, 200, DEFAULT_TILE_OPTIONS);
    await expect(renderPageTiles(pdf, 9, grid)).rejects.toThrow(RangeError);
    const before = pdf.byteLength;
    await renderPageTiles(pdf, 2, grid);
    expect(pdf.byteLength).toBe(before);
  }, 30_000);
});
