/**
 * Regras de 2026-10-30 para aberturas internas: posição estimada pela escala entra no projeto com aviso,
 * cômodo sem porta vira aviso, e o schema aceita leituras gravadas antes de `positionSource`/`rooms`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert, estimatedOpenings, reviewReport, roomsWithoutDoors } from '../src/convert';
import { ExtractionOutput, type OpeningOut } from '../src/schema';

const base = ExtractionOutput.parse(JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')));

function withOpening(patch: Partial<OpeningOut>, wallId = 'I1'): ExtractionOutput {
  const walls = base.walls.map((w) => {
    if (w.id !== wallId) return w;
    const first = w.openings[0];
    if (first === undefined) throw new Error('fixture sem abertura na parede ' + wallId);
    return { ...w, openings: [{ ...first, ...patch }, ...w.openings.slice(1)] };
  });
  return { ...base, walls };
}

describe('schema — compatibilidade com leituras antigas', () => {
  it('leitura gravada sem positionSource nem rooms continua válida, com defaults', () => {
    const raw = JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    expect(raw).not.toHaveProperty('rooms');
    const parsed = ExtractionOutput.parse(raw);
    expect(parsed.rooms).toEqual([]);
    for (const w of parsed.walls) for (const o of w.openings) expect(o.positionSource).toBeNull();
  });

  it('positionSource só aceita dimension, rule ou scaled', () => {
    expect(() => ExtractionOutput.parse(withOpening({ positionSource: 'guess' as never }))).toThrow();
    expect(ExtractionOutput.parse(withOpening({ positionSource: 'rule' })).walls.find((w) => w.id === 'I1')?.openings[0]?.positionSource).toBe('rule');
  });
});

describe('posição estimada pela escala (scaled)', () => {
  it('fica no projeto e gera ABERTURA_ESTIMADA; com cota ou regra não avisa', () => {
    const scaled = withOpening({ positionSource: 'scaled', confidence: 0.45 });
    const warnings = estimatedOpenings(scaled);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^extração ABERTURA_ESTIMADA: parede I1, abertura I1-U2/);
    expect(warnings[0]).toContain('confiança 0.45');
    const converted = convert(scaled);
    const i1 = (converted.project['walls'] as { id: string; openings: unknown[] }[]).find((w) => w.id === 'I1');
    expect(i1?.openings).toHaveLength(1);
    expect(converted.warnings.some((w) => w.includes('ABERTURA_ESTIMADA'))).toBe(true);
    expect(converted.warnings.some((w) => w.includes('ABERTURA_SEM_POSICAO'))).toBe(false);

    expect(estimatedOpenings(withOpening({ positionSource: 'dimension' }))).toEqual([]);
    expect(estimatedOpenings(withOpening({ positionSource: 'rule' }))).toEqual([]);
  });

  it('scaled sem posição nenhuma continua ABERTURA_SEM_POSICAO (fora do projeto), não estimada', () => {
    const out = withOpening({ positionSource: 'scaled', center: null, offset: null });
    expect(estimatedOpenings(out)).toEqual([]);
    expect(convert(out).warnings.some((w) => w.includes('ABERTURA_SEM_POSICAO: parede I1'))).toBe(true);
  });

  it('o relatório marca a estimada em "Revisar" e mostra a fonte na tabela de aberturas', () => {
    const out = withOpening({ positionSource: 'scaled', confidence: 0.4 });
    const report = reviewReport(out, convert(out));
    expect(report).toContain('| id | parede | tag/tipo | eixo | fonte |');
    expect(report).toContain('| scaled |');
    expect(report).toContain('abertura I1-U2 (I1): posição estimada pela escala');
  });
});

describe('cômodos sem porta', () => {
  const withRooms = (rooms: ExtractionOutput['rooms']): ExtractionOutput => ({ ...base, rooms });

  it('cômodo com doors vazio vira COMODO_SEM_PORTA com a nota; com porta não avisa', () => {
    const out = withRooms([
      { name: 'Bedroom 2', level: 1, doors: ['I1-U2'], note: null },
      { name: 'Bathroom', level: 1, doors: [], note: 'símbolo não visível' },
      { name: 'Vestibule', level: null, doors: [], note: null },
    ]);
    const warnings = roomsWithoutDoors(out);
    expect(warnings).toEqual([
      'extração COMODO_SEM_PORTA: Bathroom (pavimento 1): nenhuma porta encontrada — símbolo não visível; confira na planta e adicione a abertura na parede certa',
      'extração COMODO_SEM_PORTA: Vestibule: nenhuma porta encontrada; confira na planta e adicione a abertura na parede certa',
    ]);
    expect(convert(out).warnings.filter((w) => w.includes('COMODO_SEM_PORTA'))).toHaveLength(2);
  });

  it('o relatório ganha a seção Cômodos e lista os sem porta em Revisar', () => {
    const out = withRooms([
      { name: 'Bedroom 2', level: 1, doors: ['I1-U2'], note: null },
      { name: 'Closet', level: 1, doors: [], note: 'vão aberto' },
    ]);
    const report = reviewReport(out, convert(out));
    expect(report).toContain('## Cômodos');
    expect(report).toContain('| Bedroom 2 | 1 | I1-U2 |  |');
    expect(report).toContain('| Closet | 1 | **nenhuma** | vão aberto |');
    expect(report).toContain('- cômodo Closet: sem porta');
  });

  it('sem rooms o relatório não tem a seção', () => {
    expect(reviewReport(base, convert(base))).not.toContain('## Cômodos');
  });
});
