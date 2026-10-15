import { describe, expect, it } from 'vitest';
import { buildUserContent, SYSTEM_PROMPT } from '../src/prompt';
import { readPageText, subsetPdf } from '../src/pdf';
import { makePdf } from './helpers/makePdf';

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
