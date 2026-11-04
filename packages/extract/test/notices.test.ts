import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert } from '../src/convert';
import { EXTRACT_WARNING_CODES, LEGACY_EXTRACT_CODES, legacyNotice, noticeText, readingNotices } from '../src/notices';
import { ExtractionOutput } from '../src/schema';

const ringgold = ExtractionOutput.parse(JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')));

describe('códigos do extract (S26)', () => {
  it('todo código antigo (português) mapeia para um código novo em inglês, sem repetir', () => {
    const news = Object.values(LEGACY_EXTRACT_CODES);
    expect(new Set(news).size).toBe(news.length);
    for (const c of news) expect(EXTRACT_WARNING_CODES).toContain(c);
    for (const c of EXTRACT_WARNING_CODES) expect(c).toMatch(/^[A-Z][A-Z_]+$/);
  });

  it('a conversão só emite códigos em inglês, com parede, abertura e parâmetros nos avisos de abertura', () => {
    const noPosition: ExtractionOutput = {
      ...ringgold,
      walls: ringgold.walls.map((w) => (w.id === 'S2' ? { ...w, openings: w.openings.map((o) => (o.id === 'S2-D1' ? { ...o, center: null, offset: null } : o)) } : w)),
    };
    const r = convert(noPosition);
    const unplaced = r.warnings.find((w) => w.code === 'OPENING_UNPLACED');
    expect(unplaced).toMatchObject({ source: 'extraction', wallId: 'S2', openingId: 'S2-D1', params: { tag: '1' } });
    for (const w of r.warnings) expect(Object.keys(LEGACY_EXTRACT_CODES)).not.toContain(w.code);
  });
});

describe('legacyNotice — avisos gravados como texto antes da S26', () => {
  it('extração com código antigo: código novo, parede, abertura e tag do prefixo', () => {
    const n = legacyNotice('extração ABERTURA_SEM_POSICAO: parede I9, abertura I9-U2-1 (U2): a leitura não achou a cota do eixo — …');
    expect(n).toMatchObject({ source: 'extraction', code: 'OPENING_UNPLACED', wallId: 'I9', openingId: 'I9-U2-1', params: { tag: 'U2' } });
    expect(n.message).toMatch(/^parede I9, abertura I9-U2-1 \(U2\): a leitura/);
  });

  it('aviso do motor: painel → parede, abertura do texto, hipótese fora da frase', () => {
    const n = legacyNotice('1-S2-P1 HEADER_JACKS_BELOW_TABLE: parede S2, abertura S2-A: 1 jack por lado em vez de 2 — só 6" até o RO de S2-D1 (hipótese P30)');
    expect(n).toMatchObject({ source: 'engine', code: 'HEADER_JACKS_BELOW_TABLE', panelId: '1-S2-P1', wallId: 'S2', openingId: 'S2-A', hypothesis: 'P30' });
    expect(n.message).not.toContain('hipótese');
  });

  it('problemas: parser com caminho, motor, altura', () => {
    expect(legacyNotice('parser: Ringgold.walls[2].openings[0].center: medida inválida')).toMatchObject({ source: 'parser', code: 'PROJECT_INVALID', path: 'walls[2].openings[0].center' });
    expect(legacyNotice('motor: parede W1: algo')).toMatchObject({ source: 'engine', code: 'ENGINE_INTERNAL', message: 'parede W1: algo' });
    expect(legacyNotice('altura: os desenhos não trazem cortes')).toMatchObject({ source: 'project', code: 'WALL_HEIGHT_MISSING' });
  });

  it('readingNotices aceita lista mista (texto antigo + objetos novos) e descarta o resto', () => {
    const fresh = { source: 'extraction', code: 'SHEET_DUPLICATE', message: 'x', params: { count: 1 } };
    const list = readingNotices(['extração SEM_CARIMBO: nenhum número', fresh, 42, null]);
    expect(list.map((n) => n.code)).toEqual(['NO_TITLE_BLOCK', 'SHEET_DUPLICATE']);
    expect(readingNotices(undefined)).toEqual([]);
  });

  it('noticeText de um aviso lido do legado volta ao formato de texto com o código novo', () => {
    const n = legacyNotice('extração ALTURA_PADRAO: 3 abertura(s) sem altura');
    expect(noticeText(n)).toBe('extração DEFAULT_HEADER_HEIGHT: 3 abertura(s) sem altura');
  });
});
