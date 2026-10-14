import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProject, type Project } from 'cli/project';
import { convert, derivedStudLengths, reviewReport, toProject } from '../src/convert';
import { ExtractionOutput } from '../src/schema';

const ROOT = 'C:/Users/Phillipe/Desktop/painelizer/';
const ringgold = ExtractionOutput.parse(JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')));
const corner = ExtractionOutput.parse(JSON.parse(readFileSync(new URL('./fixtures/corner-output.json', import.meta.url), 'utf8')));
const checkpoint = parseProject(readFileSync(ROOT + 'packages/cli/examples/ringgold-checkpoint.json', 'utf8'), 'checkpoint');

/** O que a extração tem obrigação de acertar: geometria, seção, papel e aberturas resolvidas. */
function essence(p: Project) {
  return p.walls.map((w) => ({
    id: w.id,
    length: w.length,
    height: w.height,
    section: w.section,
    exterior: w.exterior,
    bearing: w.bearing,
    openings: w.openings.map((o) => ({
      id: o.id,
      type: o.type,
      offset: o.offset,
      roughWidth: o.roughWidth,
      roughHeight: o.roughHeight,
      headerHeight: o.headerHeight,
    })),
  }));
}

describe('convert — Ringgold em formato solto', () => {
  const result = convert(ringgold, { studLength: [92.625, 104.625] });

  it('passa no parser do CLI sem problemas', () => {
    expect(result.problems).toEqual([]);
  });

  it('bate com ringgold-checkpoint.json nas 4 paredes e 5 aberturas', () => {
    const extracted = parseProject(JSON.stringify(result.project), 'extraído');
    expect(essence(extracted)).toEqual(essence(checkpoint));
    expect(extracted.config.openingTypes).toEqual(checkpoint.config.openingTypes);
    expect(extracted.config.building).toEqual(checkpoint.config.building);
  });

  it('medidas ficam como texto do desenho no JSON (o CLI converte)', () => {
    const walls = result.project['walls'] as Record<string, unknown>[];
    expect(walls[0]?.['length']).toBe(`16' - 0"`);
    expect(walls[0]?.['height']).toBe(`9' - 1 1/8"`);
    const openings = walls[2]?.['openings'] as Record<string, unknown>[];
    expect(openings[0]).toEqual({ id: 'S2-D1', tag: '1', center: `2' - 4 1/2"`, roughHeight: `6' - 10 1/2"`, headerHeight: `6' - 10 1/2"` });
  });

  it('campos nulos não aparecem no JSON; tipo da abertura só sem tag; frame só em porta', () => {
    const json = JSON.stringify(result.project);
    expect(json).not.toContain('null');
    expect(json).not.toContain('"type"');
    const types = (result.project['config'] as Record<string, unknown>)['openingTypes'] as Record<string, Record<string, unknown>>;
    expect(types['A2']).not.toHaveProperty('frame');
    expect(types['1']?.['frame']).toBe('hm');
    expect(types['A2']?.['sillHeight']).toBe(`1' - 11 3/4"`);
  });

  it('pré-cortes derivados da altura quando não informados: 9\'-1 1/8" − 4 1/2" = 104 5/8"', () => {
    expect(derivedStudLengths(ringgold)).toEqual([104.625]);
    const cfg = toProject(ringgold)['config'] as Record<string, unknown>;
    expect(cfg['studLength']).toEqual([104.625]);
  });
});

describe('convert — formato de planta', () => {
  const result = convert(corner, { date: '2026-10-14', revision: 'A' });

  it('vira projeto em planta válido, com ends, level e carimbo', () => {
    expect(result.problems).toEqual([]);
    const p = parseProject(JSON.stringify(result.project), 'canto');
    expect(p.walls).toEqual([]);
    expect(p.house?.walls.map((w) => w.id)).toEqual(['S1', 'W1', 'I1']);
    expect(p.house?.walls[0]?.ends).toEqual({ start: 'through' });
    expect(p.house?.walls[1]?.ends).toEqual({ start: 'butt' });
    expect(p.house?.walls[2]?.ends).toBeUndefined();
    expect(p.house?.walls[2]?.start).toEqual({ x: 72, y: 0 });
    expect(p.house?.walls[2]?.end).toEqual({ x: 72, y: 96 });
    expect(p.date).toBe('2026-10-14');
    expect(p.revision).toBe('A');
    expect(p.config.headerHeight).toBe(82.5);
    expect(p.config.building).toBeUndefined();
  });

  it('a altura comum vai para cada parede; stud 92 5/8" derivado', () => {
    const walls = result.project['walls'] as Record<string, unknown>[];
    expect(walls.every((w) => w['height'] === `8' - 1 1/8"`)).toBe(true);
    expect(derivedStudLengths(corner)).toEqual([92.625]);
  });

  it('uma parede sem start/end num projeto em planta é problema do CLI, não exceção', () => {
    const broken: ExtractionOutput = {
      ...corner,
      walls: corner.walls.map((w, i) => (i === 2 ? { ...w, start: null, end: null, length: `8' - 0"` } : w)),
    };
    const r = convert(broken);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/start\/end|planta/);
  });

  it('building só entra com neve e largura; só vento não basta', () => {
    const partial: ExtractionOutput = { ...corner, building: { ...corner.building, windSpeed: 120 } };
    const cfg = toProject(partial)['config'] as Record<string, unknown>;
    expect(cfg).not.toHaveProperty('building');
  });
});

describe('reviewReport', () => {
  it('lista paredes, aberturas e schedule com evidência e confiança', () => {
    const report = reviewReport(ringgold, convert(ringgold));
    expect(report).toContain('# Extração — 26 Ringgold St');
    expect(report).toContain('| S2 | 12\' - 0" | 2x6 | X1 | sim | sim | 0.90 |');
    expect(report).toContain('| S2-D1 | S2 | 1 | 2\' - 4 1/2" | ? × 6\' - 10 1/2" | 6\' - 10 1/2" | 0.90 |');
    expect(report).toContain('| A2 | window |');
    expect(report).toContain('- **X1** 2x6 externa');
    expect(report).toContain('## Notas do modelo');
  });

  it('"Revisar" aponta confiança baixa, posição ausente e problemas do CLI', () => {
    const shaky: ExtractionOutput = {
      ...corner,
      walls: corner.walls.map((w, i) =>
        i === 1
          ? {
              ...w,
              confidence: 0.5,
              openings: w.openings.map((o) => ({ ...o, center: null, confidence: 0.4 })),
            }
          : w,
      ),
    };
    const converted = convert(shaky);
    const report = reviewReport(shaky, converted);
    expect(report).toContain('- parede W1: confiança 0.50');
    expect(report).toContain('- abertura W1-J1 (W1): confiança 0.40');
    expect(report).toContain('- abertura W1-J1 (W1): sem posição');
    expect(report).toContain('- CLI: ');
  });

  it('sem nada abaixo do limiar, diz para conferir mesmo assim', () => {
    const report = reviewReport(corner, convert(corner));
    expect(report).toContain('Nada abaixo do limiar');
    expect(reviewReport(corner, convert(corner), { threshold: 0.95 })).toContain('- parede I1: confiança 0.90');
  });
});
