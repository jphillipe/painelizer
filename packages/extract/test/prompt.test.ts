import { describe, expect, it } from 'vitest';
import { buildUserContent, SYSTEM_PROMPT } from '../src/prompt';
import { readPageText, subsetPdf } from '../src/pdf';
import { makePdf } from './helpers/makePdf';

describe('SYSTEM_PROMPT — convenções do CLI e do framing', () => {
  it('diz como converter face externa para eixo e como cotar aberturas', () => {
    expect(SYSTEM_PROMPT).toContain('2 3/4" para 2x6');
    expect(SYSTEM_PROMPT).toContain('1 3/4" para 2x4');
    expect(SYSTEM_PROMPT).toContain('EIXO da abertura');
    expect(SYSTEM_PROMPT).toContain('`center`');
  });

  it('proíbe inventar cota e escolher header', () => {
    expect(SYSTEM_PROMPT).toMatch(/nunca invente cota/i);
    expect(SYSTEM_PROMPT).toContain('Não escolher header, jacks ou kings');
  });

  it('define a escala de confiança', () => {
    expect(SYSTEM_PROMPT).toContain('0.7–0.9');
  });
});

describe('buildUserContent', () => {
  it('PDF como document, um bloco de texto por página e a instrução final', async () => {
    const pdf = await makePdf();
    const subset = await subsetPdf(pdf, [1, 2]);
    const pages = [await readPageText(pdf, 1), await readPageText(pdf, 2)];
    const content = buildUserContent({ pdf: subset, pages });

    expect(content).toHaveLength(4);
    const doc = content[0];
    expect(doc?.type).toBe('document');
    if (doc?.type !== 'document' || doc.source.type !== 'base64') throw new Error('esperado document base64');
    expect(doc.source.media_type).toBe('application/pdf');
    expect(doc.source.data).toBe(Buffer.from(subset).toString('base64'));
    expect(doc.source.data).not.toContain('\n');

    const p1 = content[1];
    expect(p1?.type === 'text' && p1.text.startsWith('# página 1 ·')).toBe(true);
    const p2 = content[2];
    expect(p2?.type === 'text' && p2.text.startsWith('# página 2 ·')).toBe(true);
    const last = content[3];
    expect(last?.type === 'text' && last.text.startsWith('Extraia as paredes')).toBe(true);
  });

  it('dicas do humano entram antes da instrução', async () => {
    const pdf = await makePdf();
    const content = buildUserContent({
      pdf,
      pages: [await readPageText(pdf, 1)],
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
    const pages = [await readPageText(pdf, 1)];
    expect(JSON.stringify(buildUserContent({ pdf, pages }))).toBe(JSON.stringify(buildUserContent({ pdf, pages })));
  });
});
