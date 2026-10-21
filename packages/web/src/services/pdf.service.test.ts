import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLES } from 'cli/examples';
import { planOf, sheetsOf } from '@/lib/files';

vi.mock('server-only', () => ({}));
const { generate } = await import('./panels.service');
const { sheetsPdf, rasterize, LETTER, toBase64 } = await import('./pdf.service');

describe('PDF das folhas (M9)', () => {
  it('rasteriza uma folha do motor em PNG com a largura pedida', () => {
    const r = generate(EXAMPLES[1]!.text);
    if (!r.ok) throw new Error('fixture');
    const sheet = sheetsOf(r.files, r.panels)[0]!;
    const png = rasterize(sheet.svg, 800);
    // Assinatura PNG e largura 800 no IHDR.
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(new DataView(png.buffer, png.byteOffset + 16, 4).getUint32(0)).toBe(800);
  });

  it('28x40: planta + 12 folhas viram 13 páginas carta paisagem com rodapé "x de 13"', async () => {
    const r = generate(EXAMPLES[1]!.text);
    if (!r.ok) throw new Error('fixture');
    const plan = planOf(r.files)!;
    const pages = [{ label: 'Panel plan', svg: plan }, ...sheetsOf(r.files, r.panels).map((s) => ({ label: s.panelId, svg: s.svg }))];
    const bytes = await sheetsPdf(pages, { projectName: r.projectName, dpi: 96 });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(13);
    const first = doc.getPage(0);
    expect(first.getWidth()).toBe(LETTER.width);
    expect(first.getHeight()).toBe(LETTER.height);
    expect(doc.getTitle()).toContain('Casa 28x40');
    expect(toBase64(bytes).startsWith('JVBERi0')).toBe(true);
  }, 60_000);

  it('sem folhas é erro de entrada', async () => {
    await expect(sheetsPdf([], { projectName: 'x' })).rejects.toThrow(RangeError);
  });
});
