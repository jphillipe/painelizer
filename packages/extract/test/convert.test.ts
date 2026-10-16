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

  it('passa no parser e no motor; o caso P30 (porta e janela a 8 1/4" na S2) chega ao revisor como aviso', () => {
    // A extração não escolhe jacks (é do motor/engenheiro): o motor aplica a hipótese P30 (1 jack por lado nas
    // duas, como o checkpoint) e o aviso tem que chegar ao humano pelo relatório, não sumir.
    expect(result.problems).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    for (const w of result.warnings) {
      expect(w).toMatch(/^1-S2-P1 HEADER_JACKS_BELOW_TABLE: parede S2, abertura S2-(D1|A): 1 jack por lado .*8\.25".*hipótese P30/);
    }
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
    expect(p.config.building).toEqual({ groundSnowLoad: 30, buildingWidth: 336 });
    // Sem vento no fixture: o motor avisa (kings não conferidos) e o aviso chega ao revisor.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^1-W1-P1 WIND_SPEED_MISSING: /);
    expect(result.problems).toEqual([]);
  });

  it('parede portante com janela e sem neve/largura: o motor reclama e o relatório mostra', () => {
    const noLoads: ExtractionOutput = {
      ...corner,
      building: { groundSnowLoad: null, buildingWidth: null, windSpeed: null, exposure: null, species: null },
    };
    const r = convert(noLoads);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^motor: parede W1, abertura W1-J1: .*config\.building/);
    expect(reviewReport(noLoads, r)).toContain('- motor: parede W1, abertura W1-J1');
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
    const partial: ExtractionOutput = {
      ...corner,
      building: { groundSnowLoad: null, buildingWidth: null, windSpeed: 120, exposure: 'B', species: null },
    };
    const cfg = toProject(partial)['config'] as Record<string, unknown>;
    expect(cfg).not.toHaveProperty('building');
    const full = toProject(corner)['config'] as Record<string, unknown>;
    expect(full['building']).toEqual({ groundSnowLoad: 30, buildingWidth: `28' - 0"` });
  });
});

describe('altura de parede informada pelo humano', () => {
  const noHeight: ExtractionOutput = { ...ringgold, wallHeight: null };

  it('sem cortes e sem altura informada: problema claro, sem passar pelo parser', () => {
    const r = convert(noHeight);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^altura: .*4 parede\(s\) sem altura: N1, S1, S2, I1\)/);
    const walls = r.project['walls'] as Record<string, unknown>[];
    expect(walls[0]).not.toHaveProperty('height');
  });

  it('com wallHeight nas opções, as paredes ganham a altura e o pré-corte é derivado dela', () => {
    const r = convert(noHeight, { wallHeight: `9' - 1 1/8"` });
    expect(r.problems.filter((p) => p.startsWith('altura'))).toEqual([]);
    const walls = r.project['walls'] as Record<string, unknown>[];
    expect(walls.every((w) => w['height'] === `9' - 1 1/8"`)).toBe(true);
    expect((r.project['config'] as Record<string, unknown>)['studLength']).toEqual([104.625]);
  });

  it('dados do estrutural informados entram só onde o modelo deixou null', () => {
    const noLoads: ExtractionOutput = {
      ...ringgold,
      building: { groundSnowLoad: null, buildingWidth: null, windSpeed: 130, exposure: null, species: null },
    };
    const r = convert(noLoads, { building: { groundSnowLoad: 30, buildingWidth: `29' - 0"`, windSpeed: 90, exposure: 'B' } });
    expect((r.project['config'] as Record<string, unknown>)['building']).toEqual({
      groundSnowLoad: 30,
      buildingWidth: `29' - 0"`,
      windSpeed: 130, // o lido vence
      exposure: 'B',
    });
    expect(r.problems.filter((p) => p.includes('config.building'))).toEqual([]);
  });

  it('pavimentos acima e apoio do piso entram só em parede portante sem o dado', () => {
    const blank: ExtractionOutput = { ...ringgold, walls: ringgold.walls.map((w) => ({ ...w, floorsSupported: null, floorSpan: null })) };
    const r = convert(blank, { floorsSupported: 2, floorSpan: 'center' });
    const walls = r.project['walls'] as Record<string, unknown>[];
    expect(walls[0]).toMatchObject({ id: 'N1', floorsSupported: 2, floorSpan: 'center' });
    expect(walls[3]).not.toHaveProperty('floorsSupported'); // I1 não é portante
    expect(walls[3]).not.toHaveProperty('floorSpan');
    const kept = convert(ringgold, { floorsSupported: 1, floorSpan: 'clear' });
    expect((kept.project['walls'] as Record<string, unknown>[])[0]).toMatchObject({ floorsSupported: 2, floorSpan: 'center' }); // o lido vence
  });

  it('a altura lida pelo modelo vence a informada', () => {
    const r = convert(ringgold, { wallHeight: `8' - 1 1/8"` });
    const walls = r.project['walls'] as Record<string, unknown>[];
    expect(walls[0]?.['height']).toBe(`9' - 1 1/8"`);
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
    // Abertura sem posição não trava mais o parser: sai do projeto e vira aviso (decisão de 2026-10-15).
    expect(converted.problems).toEqual([]);
    expect(report).toContain('- extração ABERTURA_SEM_POSICAO: parede W1, abertura W1-J1');
  });

  it('abertura sem posição: fora do projeto, um aviso por abertura, e o resto da parede sai em painéis', () => {
    const unplaced: ExtractionOutput = {
      ...ringgold,
      walls: ringgold.walls.map((w) =>
        w.id === 'S2' ? { ...w, openings: w.openings.map((o) => (o.id === 'S2-D1' ? { ...o, center: null, offset: null } : o)) } : w,
      ),
    };
    const r = convert(unplaced, { studLength: [92.625, 104.625] });
    expect(r.problems).toEqual([]);
    expect(r.warnings[0]).toBe(
      'extração ABERTURA_SEM_POSICAO: parede S2, abertura S2-D1 (1): a leitura não achou a cota do eixo — os ' +
        'painéis da parede saem SEM esta abertura; enquadre na obra ou informe a posição',
    );
    const s2 = (r.project['walls'] as { id: string; openings: { id: string }[] }[]).find((w) => w.id === 'S2')!;
    expect(s2.openings.map((o) => o.id)).toEqual(['S2-A']);
    // Sem a porta vizinha, a janela de S2 não precisa mais da hipótese P30.
    expect(r.warnings.filter((w) => w.includes('hipótese P30'))).toEqual([]);
  });

  it('avisos do motor ganham seção própria', () => {
    const r = convert(ringgold);
    const withWarning = { ...r, warnings: ['1-S2-P1 HEADER_JACKS_BELOW_TABLE: exemplo'] };
    const report = reviewReport(ringgold, withWarning);
    expect(report).toContain('## Avisos do motor\n\n- 1-S2-P1 HEADER_JACKS_BELOW_TABLE: exemplo');
    expect(reviewReport(ringgold, { ...r, warnings: [] })).not.toContain('## Avisos do motor');
  });

  it('sem nada abaixo do limiar, diz para conferir mesmo assim', () => {
    const report = reviewReport(corner, convert(corner));
    expect(report).toContain('Nada abaixo do limiar');
    expect(reviewReport(corner, convert(corner), { threshold: 0.95 })).toContain('- parede I1: confiança 0.90');
  });
});

describe('alturas: projeto, humano, padrão da fábrica (P2)', () => {
  // Ringgold sem nenhuma altura: portas sem headerHeight, tipos de janela sem peitoril.
  const bare: ExtractionOutput = {
    ...ringgold,
    headerHeight: null,
    openingTypes: ringgold.openingTypes.map((t) => ({ ...t, sillHeight: null })),
    walls: ringgold.walls.map((w) => ({ ...w, openings: w.openings.map((o) => ({ ...o, headerHeight: null })) })),
  };
  const config = (r: ReturnType<typeof convert>) => r.project['config'] as Record<string, unknown>;

  it('nada no projeto nem do humano: topo do RO a 82 1/2" e um aviso com as aberturas', () => {
    const r = convert(bare, { studLength: [92.625, 104.625] });
    expect(config(r)['headerHeight']).toBe(`6' - 10 1/2"`);
    const w = r.warnings.find((x) => x.startsWith('extração ALTURA_PADRAO'));
    expect(w).toContain('5 abertura(s)');
    expect(w).toContain('N1-A, S1-A, S2-D1, S2-A, I1-U2');
  });

  it('peitoril do humano: as janelas saem do aviso, as portas continuam', () => {
    const r = convert(bare, { studLength: [92.625, 104.625], sillHeight: `2' - 0"` });
    const types = config(r)['openingTypes'] as Record<string, { sillHeight?: string }>;
    expect(types['A2']!.sillHeight).toBe(`2' - 0"`);
    expect(types['1']!.sillHeight).toBeUndefined();
    expect(r.warnings.find((x) => x.startsWith('extração ALTURA_PADRAO'))).toMatch(/2 abertura\(s\) .*: S2-D1, I1-U2 —/);
  });

  it('altura de header do humano: vale para o projeto e não há aviso', () => {
    const r = convert(bare, { studLength: [92.625, 104.625], headerHeight: `7' - 0"` });
    expect(config(r)['headerHeight']).toBe(`7' - 0"`);
    expect(r.warnings.filter((x) => x.startsWith('extração ALTURA_PADRAO'))).toEqual([]);
  });

  it('a leitura vence o humano', () => {
    const read = { ...bare, headerHeight: `6' - 8"` };
    expect(config(convert(read, { headerHeight: `7' - 0"` }))['headerHeight']).toBe(`6' - 8"`);
    const sill = { ...bare, openingTypes: bare.openingTypes.map((t) => (t.kind === 'window' ? { ...t, sillHeight: `1' - 6"` } : t)) };
    const types = config(convert(sill, { sillHeight: `2' - 0"` }))['openingTypes'] as Record<string, { sillHeight?: string }>;
    expect(types['A2']!.sillHeight).toBe(`1' - 6"`);
  });
});

describe('abertura sem tag com medida incompleta', () => {
  const withOpening = (o: Partial<ExtractionOutput['walls'][number]['openings'][number]>): ExtractionOutput => ({
    ...ringgold,
    walls: ringgold.walls.map((w) =>
      w.id === 'I1'
        ? { ...w, openings: [{ ...w.openings[0]!, id: 'I1-OP-1', tag: null, type: 'door', roughWidth: `3' - 0"`, roughHeight: null, headerHeight: null, ...o }] }
        : w,
    ),
  });
  const opening = (r: ReturnType<typeof convert>) =>
    (r.project['walls'] as { id: string; openings: Record<string, unknown>[] }[]).find((w) => w.id === 'I1')!.openings;

  it('vão (porta sem tag) com largura e sem altura: RO até a base do header do projeto, com aviso', () => {
    const r = convert(withOpening({}), { studLength: [92.625, 104.625] });
    expect(r.problems).toEqual([]);
    expect(opening(r)[0]).toMatchObject({ id: 'I1-OP-1', roughWidth: `3' - 0"`, roughHeight: `6' - 10 1/2"` });
    expect(r.warnings).toContain(
      `extração ALTURA_RO_PORTA: parede I1, abertura I1-OP-1 (door): a leitura deu a largura do RO (3' - 0") mas não ` +
        `a altura — RO do subfloor até a base do header, 6' - 10 1/2" (P4); confira`,
    );
  });

  it('com altura de header informada, o vão vai até ela', () => {
    const r = convert(withOpening({}), { studLength: [92.625, 104.625], headerHeight: `7' - 0"` });
    expect(opening(r)[0]).toMatchObject({ roughHeight: `7' - 0"` });
  });

  it('sem tag e sem largura: fora do projeto, com aviso', () => {
    const r = convert(withOpening({ roughWidth: null }), { studLength: [92.625, 104.625] });
    expect(r.problems).toEqual([]);
    expect(opening(r)).toEqual([]);
    expect(r.warnings.find((w) => w.startsWith('extração ABERTURA_SEM_MEDIDA: parede I1, abertura I1-OP-1'))).toBeDefined();
  });

  it('janela sem tag e sem altura: fora (não há de onde tirar a altura)', () => {
    const r = convert(withOpening({ type: 'window' }), { studLength: [92.625, 104.625] });
    expect(opening(r)).toEqual([]);
  });
});
