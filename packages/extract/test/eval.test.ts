import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateReading, formatEvalReport, type ReadingTruth } from '../src/eval';
import { ExtractionOutput } from '../src/schema';

const truth = JSON.parse(readFileSync(new URL('./eval/ringgold-truth.json', import.meta.url), 'utf8')) as ReadingTruth;
const fixture = ExtractionOutput.parse(JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')));

describe('evaluateReading — medida de uma leitura contra a verdade', () => {
  it('a verdade do Ringgold tem as 15 portas com tag e os mínimos', () => {
    expect(truth.doorTags).toEqual({ U2: 9, U3: 1, U1: 1, '1': 4 });
    expect(truth.interiorDoorsMin).toBe(11);
  });

  it('conta tags encontradas e posicionadas, fonte da posição e faltas', () => {
    const r = evaluateReading(fixture, truth);
    expect(r.walls).toEqual({ total: 4, interior: 1 });
    expect(r.openings.total).toBe(5);
    expect(r.openings.interior).toBe(1);
    // fixture antiga: sem positionSource → posição conta como cota
    expect(r.openings.bySource).toEqual({ dimension: 5, rule: 0, scaled: 0, none: 0 });
    expect(r.tags.find((t) => t.tag === 'U2')).toEqual({ tag: 'U2', expected: 9, found: 1, positioned: 1 });
    expect(r.tags.find((t) => t.tag === '1')).toEqual({ tag: '1', expected: 4, found: 1, positioned: 1 });
    expect(r.tagCoverage).toBeCloseTo(2 / 15, 6);
    expect(r.shortfalls).toContain('tag U2: 1 of 9 found');
    expect(r.shortfalls).toContain('doors in interior walls: 1 of at least 11');
    expect(r.shortfalls).toContain('rooms listed: 0 of at least 15');
    expect(r.problems).toBe(0);
    expect(r.warnings['HEADER_JACKS_BELOW_TABLE']).toBe(2);
  });

  it('leitura completa não tem faltas; escala e sem posição aparecem nas contas', () => {
    const wall = fixture.walls.find((w) => w.id === 'I1')!;
    const door = (id: string, patch: Partial<(typeof wall.openings)[number]> = {}) => ({ ...wall.openings[0]!, id, tag: 'U2', ...patch });
    const full: ExtractionOutput = {
      ...fixture,
      walls: [
        ...fixture.walls.filter((w) => w.id !== 'I1'),
        {
          ...wall,
          openings: [
            ...Array.from({ length: 9 }, (_, i) => door(`I1-U2-${i + 1}`, i === 8 ? { positionSource: 'scaled', confidence: 0.4 } : { positionSource: 'dimension' })),
            door('I1-U3-1', { tag: 'U3', positionSource: 'rule' }),
            door('I1-U1-1', { tag: 'U1', center: null, offset: null, positionSource: null }),
            door('I1-OP-1', { tag: null, type: 'door', roughWidth: '36"', roughHeight: '80"' }),
          ],
        },
      ],
      openingTypes: [...fixture.openingTypes, { ...fixture.openingTypes[0]!, tag: 'U3', kind: 'door' }, { ...fixture.openingTypes[0]!, tag: 'U1', kind: 'door' }],
      rooms: Array.from({ length: 15 }, (_, i) => ({ name: `Room ${i + 1}`, level: 1, doors: [`I1-U2-${(i % 9) + 1}`], note: null })),
    };
    // Mais 3 portas "1" nas externas para fechar a tag 1 (a fixture já tem S2-D1).
    full.walls = full.walls.map((w) => (w.id === 'S1' ? { ...w, openings: [...w.openings, door('S1-1-1', { tag: '1' }), door('S1-1-2', { tag: '1' }), door('S1-1-3', { tag: '1' })] } : w));
    const r = evaluateReading(full, truth);
    expect(r.tagCoverage).toBe(1);
    expect(r.openings.bySource).toMatchObject({ rule: 1, scaled: 1, none: 1 });
    expect(r.openings.unplaced).toEqual(['I1-U1-1']);
    expect(r.openings.untagged).toBe(1);
    expect(r.shortfalls).toEqual(['tag U1: 1 with no position']);
    const text = formatEvalReport(r, 'depois.json');
    expect(text.split('\n')[0]).toBe('# depois.json');
    expect(text).toContain('door tags: 100 %');
    expect(text).toContain('scaled 1');
    expect(text).toContain('shortfalls:\n  - tag U1: 1 with no position');
  });

  it('relatório é estável (mesma entrada, mesmo texto)', () => {
    const a = formatEvalReport(evaluateReading(fixture, truth));
    expect(formatEvalReport(evaluateReading(fixture, truth))).toBe(a);
    expect(a).toContain('# 26 Ringgold St — 1st Floor Plan (A-100)');
  });
});
