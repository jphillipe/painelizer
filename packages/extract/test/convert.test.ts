import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProject, type Project } from 'cli/project';
import { convert, derivedStudLengths, reviewReport, toProject } from '../src/convert';
import { noticeText } from '../src/notices';
import { ExtractionOutput } from '../src/schema';

const ringgold = ExtractionOutput.parse(JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')));
const corner = ExtractionOutput.parse(JSON.parse(readFileSync(new URL('./fixtures/corner-output.json', import.meta.url), 'utf8')));
const checkpoint = parseProject(readFileSync(new URL('../../cli/examples/ringgold-checkpoint.json', import.meta.url), 'utf8'), 'checkpoint');

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
    for (const w of result.warnings.map(noticeText)) {
      expect(w).toMatch(/^1-S2-P1 HEADER_JACKS_BELOW_TABLE: Wall S2, opening S2-(D1|A): 1 jack stud per side .*8\.25".*hypothesis P30/);
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

  it('S35: os wall types lidos viram config.wallTypes (seção e posição, sem carga nem evidência) e cada parede leva a tag', () => {
    const cfg = result.project['config'] as Record<string, unknown>;
    expect(cfg['wallTypes']).toEqual({
      X1: { section: '2x6', exterior: true, description: 'Exterior wall, 2x6 @ 16" o.c., R-21, 1/2" plywood' },
      '1': { section: '2x4', exterior: false, description: 'Partition type 1 - interior wall, 2x4 @ 16" o.c., 5/8" GWB both sides, 1 HR' },
    });
    const walls = result.project['walls'] as Record<string, unknown>[];
    expect(walls.map((w) => w['wallType'])).toEqual(['X1', 'X1', 'X1', '1']);
    // O catálogo e a tag chegam ao motor; nada contradiz o tipo, então os avisos são os de antes (teste acima).
    const parsed = parseProject(JSON.stringify(result.project), 'extraído');
    expect(parsed.config.wallTypes).toEqual(cfg['wallTypes']);
    expect(parsed.walls.map((w) => w.wallType)).toEqual(['X1', 'X1', 'X1', '1']);
    expect(result.warnings.some((w) => w.code === 'WALL_TYPE_MISMATCH')).toBe(false);
  });

  it('S35: sem wall types lidos não há config.wallTypes; tag e descrição em branco ficam fora; parede que contradiz o tipo avisa', () => {
    expect(toProject({ ...ringgold, wallTypes: [] })['config']).not.toHaveProperty('wallTypes');
    const blank = toProject({
      ...ringgold,
      wallTypes: [
        { tag: ' X1 ', section: '2x6', exterior: true, description: '  ', evidence: 'A-800' },
        { tag: '', section: '2x4', exterior: false, description: 'no tag', evidence: '' },
      ],
    });
    expect((blank['config'] as Record<string, unknown>)['wallTypes']).toEqual({ X1: { section: '2x6', exterior: true } });

    // A leitura deu 2x6 numa parede marcada com o tipo 1 (2x4 na A-800): a parede manda e o revisor vê o aviso.
    const off = convert(
      { ...ringgold, walls: ringgold.walls.map((w) => (w.id === 'I1' ? { ...w, section: '2x6' as const } : w)) },
      { studLength: [92.625, 104.625] },
    );
    const mismatch = off.warnings.filter((w) => w.code === 'WALL_TYPE_MISMATCH');
    expect(off.problems).toEqual([]);
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]).toMatchObject({ wallId: 'I1', panelId: '1-I1-P1', params: { wallType: '1', field: 'section', wall: '2x6', type: '2x4' } });
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
    expect(noticeText(result.warnings[0]!)).toMatch(/^1-W1-P1 WIND_SPEED_MISSING: /);
    expect(result.problems).toEqual([]);
  });

  it('parede portante com janela e sem neve/largura: o motor reclama e o relatório mostra', () => {
    const noLoads: ExtractionOutput = {
      ...corner,
      building: { groundSnowLoad: null, buildingWidth: null, windSpeed: null, exposure: null, species: null },
    };
    const r = convert(noLoads);
    expect(r.problems).toHaveLength(1);
    expect(noticeText(r.problems[0]!)).toMatch(/^engine: Wall W1, opening W1-J1: .*config\.building/);
    expect(reviewReport(noLoads, r)).toContain('- engine: Wall W1, opening W1-J1');
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
    expect(noticeText(r.problems[0]!)).toMatch(/start\/end|plan/);
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
    expect(noticeText(r.problems[0]!)).toMatch(/^height: .*4 wall\(s\) with no height: N1, S1, S2, I1\)/);
    const walls = r.project['walls'] as Record<string, unknown>[];
    expect(walls[0]).not.toHaveProperty('height');
  });

  it('com wallHeight nas opções, as paredes ganham a altura e o pré-corte é derivado dela', () => {
    const r = convert(noHeight, { wallHeight: `9' - 1 1/8"` });
    expect(r.problems.map(noticeText).filter((p) => p.startsWith('height'))).toEqual([]);
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
    expect(r.problems.map(noticeText).filter((p) => p.includes('config.building'))).toEqual([]);
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
    expect(report).toContain('# Extraction — 26 Ringgold St');
    expect(report).toContain('| S2 | 12\' - 0" | 2x6 | X1 | yes | yes | 0.90 |');
    expect(report).toContain('| S2-D1 | S2 | 1 | 2\' - 4 1/2" | — | ? × 6\' - 10 1/2" | 6\' - 10 1/2" | 0.90 |');
    expect(report).toContain('| A2 | window |');
    expect(report).toContain('- **X1** 2x6 exterior');
    expect(report).toContain('## Model notes');
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
    expect(report).toContain('- wall W1: confidence 0.50');
    expect(report).toContain('- opening W1-J1 (W1): confidence 0.40');
    expect(report).toContain('- opening W1-J1 (W1): no position');
    // Abertura sem posição não trava mais o parser: sai do projeto e vira aviso (decisão de 2026-10-15).
    expect(converted.problems).toEqual([]);
    expect(report).toContain('- extraction OPENING_UNPLACED: Wall W1, opening W1-J1');
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
    expect(noticeText(r.warnings[0]!)).toBe(
      'extraction OPENING_UNPLACED: Wall S2, opening S2-D1 (1): the reading found no centerline dimension — the ' +
        "wall's panels come out WITHOUT this opening; frame it in the field or enter the position",
    );
    const s2 = (r.project['walls'] as { id: string; openings: { id: string }[] }[]).find((w) => w.id === 'S2')!;
    expect(s2.openings.map((o) => o.id)).toEqual(['S2-A']);
    // Sem a porta vizinha, a janela de S2 não precisa mais da hipótese P30.
    expect(r.warnings.map(noticeText).filter((w) => w.includes('hypothesis P30'))).toEqual([]);
  });

  it('avisos do motor ganham seção própria', () => {
    const r = convert(ringgold);
    const withWarning = { ...r, warnings: [{ source: 'engine' as const, panelId: '1-S2-P1', code: 'HEADER_JACKS_BELOW_TABLE', message: 'exemplo' }] };
    const report = reviewReport(ringgold, withWarning);
    expect(report).toContain('## Engine warnings\n\n- 1-S2-P1 HEADER_JACKS_BELOW_TABLE: exemplo');
    expect(reviewReport(ringgold, { ...r, warnings: [] })).not.toContain('## Engine warnings');
  });

  it('sem nada abaixo do limiar, diz para conferir mesmo assim', () => {
    const report = reviewReport(corner, convert(corner));
    expect(report).toContain('Nothing below the threshold');
    expect(reviewReport(corner, convert(corner), { threshold: 0.95 })).toContain('- wall I1: confidence 0.90');
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
    const w = r.warnings.map(noticeText).find((x) => x.startsWith('extraction DEFAULT_HEADER_HEIGHT'));
    expect(w).toContain('5 opening(s)');
    expect(w).toContain('N1-A, S1-A, S2-D1, S2-A, I1-U2');
  });

  it('peitoril do humano: as janelas saem do aviso, as portas continuam', () => {
    const r = convert(bare, { studLength: [92.625, 104.625], sillHeight: `2' - 0"` });
    const types = config(r)['openingTypes'] as Record<string, { sillHeight?: string }>;
    expect(types['A2']!.sillHeight).toBe(`2' - 0"`);
    expect(types['1']!.sillHeight).toBeUndefined();
    expect(r.warnings.map(noticeText).find((x) => x.startsWith('extraction DEFAULT_HEADER_HEIGHT'))).toMatch(/2 opening\(s\) .*: S2-D1, I1-U2 —/);
  });

  it('altura de header do humano: vale para o projeto e não há aviso', () => {
    const r = convert(bare, { studLength: [92.625, 104.625], headerHeight: `7' - 0"` });
    expect(config(r)['headerHeight']).toBe(`7' - 0"`);
    expect(r.warnings.map(noticeText).filter((x) => x.startsWith('extraction DEFAULT_HEADER_HEIGHT'))).toEqual([]);
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
    expect(r.warnings.map(noticeText)).toContain(
      `extraction DOOR_RO_HEIGHT_ASSUMED: Wall I1, opening I1-OP-1 (door): the reading gave the RO width (3' - 0") but not ` +
        `the height — RO from subfloor to the bottom of the header, 6' - 10 1/2" (P4); check it`,
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
    expect(r.warnings.map(noticeText).find((w) => w.startsWith('extraction OPENING_UNSIZED: Wall I1, opening I1-OP-1'))).toBeDefined();
  });

  it('janela sem tag e sem altura: fora (não há de onde tirar a altura)', () => {
    const r = convert(withOpening({ type: 'window' }), { studLength: [92.625, 104.625] });
    expect(opening(r)).toEqual([]);
  });
});
