import { describe, expect, it } from 'vitest';
import { buildUserContent, SYSTEM_PROMPT } from '../src/prompt';
import { readPageText, renderPageTiles, subsetPdf } from '../src/pdf';
import { DEFAULT_TILE_OPTIONS, planTiles } from '../src/tiles';
import { makePdf, PAGE_H, PAGE_W } from './helpers/makePdf';

const PNG_1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe('SYSTEM_PROMPT — convenções do CLI e do framing', () => {
  it('diz como converter face externa para eixo e como cotar aberturas', () => {
    expect(SYSTEM_PROMPT).toContain('2 3/4" para 2x6');
    expect(SYSTEM_PROMPT).toContain('1 3/4" para 2x4');
    expect(SYSTEM_PROMPT).toContain('EIXO da abertura');
    expect(SYSTEM_PROMPT).toContain('`center`');
  });

  it('janelas em par são uma abertura só, com tipo próprio no schedule (P28)', () => {
    expect(SYSTEM_PROMPT).toContain('são UMA abertura');
    expect(SYSTEM_PROMPT).toContain('`A2` = 2 × A');
  });

  it('proíbe inventar cota e escolher header', () => {
    expect(SYSTEM_PROMPT).toMatch(/nunca invente cota/i);
    expect(SYSTEM_PROMPT).toContain('Não escolher header, jacks ou kings');
  });

  it('pede o texto livre do JSON (notes, evidence…) em inglês', () => {
    expect(SYSTEM_PROMPT).toMatch(/Todo texto livre do JSON \(`notes`, `evidence`.*\) vai em inglês/);
  });

  it('define a escala de confiança e fala de imagens sem texto posicionado', () => {
    expect(SYSTEM_PROMPT).toContain('0.7–0.9');
    expect(SYSTEM_PROMPT).toContain('imagem sem texto posicionado');
  });
});

describe('buildUserContent', () => {
  it('PDF como document, um bloco de texto por página com o nome do arquivo, e a instrução final', async () => {
    const pdf = await makePdf();
    const subset = await subsetPdf(pdf, [1, 2]);
    const pages = [await readPageText(pdf, 1), await readPageText(pdf, 2)];
    const content = buildUserContent({ pdfs: [{ name: 'A-100.pdf', pdf: subset, pages }] });

    expect(content).toHaveLength(4);
    const doc = content[0];
    expect(doc?.type).toBe('document');
    if (doc?.type !== 'document' || doc.source.type !== 'base64') throw new Error('esperado document base64');
    expect(doc.source.media_type).toBe('application/pdf');
    expect(doc.source.data).toBe(Buffer.from(subset).toString('base64'));
    expect(doc.source.data).not.toContain('\n');
    expect(doc.title).toBe('A-100.pdf');

    const p1 = content[1];
    expect(p1?.type === 'text' && p1.text.startsWith('## A-100.pdf\n# página 1 ·')).toBe(true);
    const p2 = content[2];
    expect(p2?.type === 'text' && p2.text.startsWith('## A-100.pdf\n# página 2 ·')).toBe(true);
    const last = content[3];
    expect(last?.type === 'text' && last.text.startsWith('Extraia as paredes')).toBe(true);
  });

  it('imagens entram depois dos PDFs, cada uma precedida do nome', async () => {
    const pdf = await makePdf();
    const content = buildUserContent({
      pdfs: [{ name: 'p.pdf', pdf: await subsetPdf(pdf, [1]), pages: [await readPageText(pdf, 1)] }],
      images: [{ name: 'foto.png', data: PNG_1x1, mediaType: 'image/png' }],
    });
    expect(content.map((b) => b.type)).toEqual(['document', 'text', 'text', 'image', 'text']);
    const label = content[2];
    expect(label?.type === 'text' && label.text).toBe('## imagem: foto.png');
    const img = content[3];
    if (img?.type !== 'image' || img.source.type !== 'base64') throw new Error('esperado image base64');
    expect(img.source.media_type).toBe('image/png');
    expect(img.source.data).toBe(Buffer.from(PNG_1x1).toString('base64'));
  });

  it('só imagens também vale; nada é RangeError', () => {
    const only = buildUserContent({ pdfs: [], images: [{ name: 'a.jpg', data: PNG_1x1, mediaType: 'image/jpeg' }] });
    expect(only.map((b) => b.type)).toEqual(['text', 'image', 'text']);
    expect(() => buildUserContent({ pdfs: [] })).toThrow(RangeError);
  });

  it('dicas do humano entram antes da instrução', async () => {
    const pdf = await makePdf();
    const content = buildUserContent({
      pdfs: [{ name: 'p.pdf', pdf, pages: [await readPageText(pdf, 1)] }],
      hints: { level: 2, projectName: 'Casa X', extra: 'Ignore a garagem.' },
    });
    const last = content[content.length - 1];
    expect(last?.type === 'text' && last.text).toBe(
      'Pavimento pedido: 2.\nNome do projeto: Casa X.\nIgnore a garagem.\n\n' +
        'Extraia as paredes do pavimento, com aberturas, tipos de parede e schedules, no formato pedido. ' +
        'Explique em `evidence` cada conta e em `notes` tudo que ficou em dúvida.',
    );
  });

  it('é determinístico', async () => {
    const pdf = await makePdf();
    const input = { pdfs: [{ name: 'p.pdf', pdf, pages: [await readPageText(pdf, 1)] }] };
    expect(JSON.stringify(buildUserContent(input))).toBe(JSON.stringify(buildUserContent(input)));
  });
});

describe('SYSTEM_PROMPT — recortes e aberturas internas (2026-10-30)', () => {
  it('explica os recortes e amarra ao texto posicionado', () => {
    expect(SYSTEM_PROMPT).toContain('## Recortes');
    expect(SYSTEM_PROMPT).toContain('`## recorte …`');
    expect(SYSTEM_PROMPT).toContain('mesmas coordenadas do texto posicionado');
  });

  it('cobra toda porta, com a fonte da posição e a estimativa pela escala como último recurso', () => {
    expect(SYSTEM_PROMPT).toContain('## Aberturas internas e sem cota');
    expect(SYSTEM_PROMPT).toContain('`positionSource`');
    for (const k of ['`dimension`', '`rule`', '`scaled`']) expect(SYSTEM_PROMPT).toContain(k);
    expect(SYSTEM_PROMPT).toContain('Uma porta nunca fica de fora nem sem posição por falta de cota');
    expect(SYSTEM_PROMPT).toContain('Não omitir aberturas porque faltou cota');
  });

  it('pede o destino de cada tag de porta, as plantas ampliadas e a autochecagem por cômodo', () => {
    expect(SYSTEM_PROMPT).toContain('todas as tags de porta encontradas e o destino de cada uma');
    expect(SYSTEM_PROMPT).toContain('ENLARGED UNIT PLANS');
    expect(SYSTEM_PROMPT).toContain('`rooms`');
    expect(SYSTEM_PROMPT).toContain('todo quarto, banheiro e closet tem porta');
  });
});

describe('buildUserContent — recortes', () => {
  it('cada recorte entra depois do texto do PDF: legenda e imagem, antes das imagens do usuário', async () => {
    const pdf = await makePdf();
    const grid = planTiles({ width: PAGE_W, height: PAGE_H }, 200, DEFAULT_TILE_OPTIONS);
    const [tile] = await renderPageTiles(pdf, 1, grid);
    if (!tile) throw new Error('esperado recorte');
    const content = buildUserContent({
      pdfs: [{ name: 'p.pdf', pdf: await subsetPdf(pdf, [1]), pages: [await readPageText(pdf, 1)], tiles: [{ page: 1, sheet: 'A-100', title: '1st Floor Plan', grid, tile }] }],
      images: [{ name: 'foto.png', data: PNG_1x1, mediaType: 'image/png' }],
    });
    expect(content.map((b) => b.type)).toEqual(['document', 'text', 'text', 'image', 'text', 'image', 'text']);
    const caption = content[2];
    expect(caption?.type === 'text' && caption.text).toBe(
      `## recorte p.pdf · A-100 1st Floor Plan · linha 1/1, coluna 1/1 · região x 0–${PAGE_W} pt, y 0–${PAGE_H} pt da página 1 ` +
        `(mesmas coordenadas do texto posicionado; y cresce para baixo) · ${tile.width}×${tile.height} px, ${grid.dpi} dpi`,
    );
    const img = content[3];
    if (img?.type !== 'image' || img.source.type !== 'base64') throw new Error('esperado image base64');
    expect(img.source.media_type).toBe('image/png');
    expect(img.source.data).toBe(Buffer.from(tile.data).toString('base64'));
    const user = content[4];
    expect(user?.type === 'text' && user.text).toBe('## imagem: foto.png');
  }, 30_000);

  it('sem tiles nada muda', async () => {
    const pdf = await makePdf();
    const content = buildUserContent({ pdfs: [{ name: 'p.pdf', pdf, pages: [await readPageText(pdf, 1)], tiles: [] }] });
    expect(content.map((b) => b.type)).toEqual(['document', 'text', 'text']);
  });
});
