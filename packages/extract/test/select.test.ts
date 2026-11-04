import { describe, expect, it } from 'vitest';
import { AUTO_PAGE_BUDGET, choosePages, classifySheet, fileNameCounts, pageKey, sheetFromFileName, sheetParts, type Candidate } from '../src/select';

describe('classifySheet', () => {
  it.each([
    // Ringgold (um PDF, título no carimbo)
    [{ sheet: 'A-100', title: 'Basement and 1st Floor Plans Ringgold St MultiFamily' }, '', 'plan'],
    [{ sheet: 'A-102', title: 'Roof Plan Ringgold St' }, '', 'skip'],
    [{ sheet: 'A-200', title: 'Exterior Elevations Ringgold St' }, '', 'elevation'],
    [{ sheet: 'A-400', title: 'Wall Sections Ringgold St' }, '', 'section'],
    [{ sheet: 'A-800', title: 'Wall Types, Schedules and Window Details Ringgold St' }, '', 'schedule'],
    [{ sheet: 'A-503', title: 'Details' }, '', 'skip'],
    [{ sheet: 'A-300', title: 'Perspective Views' }, '', 'skip'],
    // Horace (uma folha por arquivo, título no nome do arquivo)
    [{ sheet: 'A-101' }, 'A-101-1ST-FLOOR-PLAN---NEW-WING-Rev.2.pdf', 'plan'],
    [{ sheet: 'A-111' }, 'A-111-1ST-FLOOR-RCP---NEW-WING-Rev.2.pdf', 'skip'],
    [{ sheet: 'A-100' }, 'A-100-FOUNDATION-PLAN-NEW-WING-Rev.2.pdf', 'skip'],
    [{ sheet: 'A-311' }, 'A-311-WALL-SECTIONS---NEW-WING-Rev.2.pdf', 'section'],
    [{ sheet: 'A-401' }, 'A-401-ENLARGED-UNIT-PLANS---NEW-WING-Rev.2.pdf', 'enlarged'],
    [{ sheet: 'A-452' }, 'A-452-ENLARGED-BATHROOM-PLANS-&-ELEVATIONS-Rev.2.pdf', 'skip'],
    [{ sheet: 'A-507' }, 'A-507-EXTERIOR-PLAN-DETAILS-Rev.2.pdf', 'skip'],
    [{ sheet: 'A-602' }, 'A-602-INTERIOR-PARTITION-TYPES-Rev.2.pdf', 'schedule'],
    [{ sheet: 'A-603' }, 'A-603-FLOOR-&-ROOF-ASSEMBLIES-Rev.2.pdf', 'schedule'],
    [{ sheet: 'A-606' }, 'A-606-DOOR-SCHEDULE-NEW-WING-&-UNITS-Rev.2.pdf', 'schedule'],
    [{ sheet: 'A-613' }, 'A-613-FINISH-SCHEDULE-AND-DETAILS-Rev.2.pdf', 'skip'],
    [{ sheet: 'S-002' }, 'S-002-GENERAL-NOTES-Rev.2.pdf', 'structural'],
    [{ sheet: 'S-104' }, 'S-104-SECOND-FLOOR-FRAMING-PLAN--AREA-A-Rev.2.pdf', 'structural'],
    [{ sheet: 'S-401' }, 'S-401-FOUNDATION-DETAILS-Rev.2.pdf', 'skip'],
    [{ sheet: 'S-505' }, 'S-505-FRAMING-DETAILS-Rev.2.pdf', 'skip'],
    [{ sheet: 'H-201' }, 'H-201-EXTERIOR-ELEVATIONS-Rev.2.pdf', 'elevation'],
    [{ sheet: 'A-421' }, 'A-421-COMMON-AREA-INT.-ELEVATIONS-Rev.2.pdf', 'skip'],
    [{ sheet: 'E-101' }, 'E-101-FIRST-FLOOR-POWER-PLAN.pdf', 'skip'],
    [{ sheet: 'G-000' }, 'G-000-COVER-SHEET-Rev.2.pdf', 'skip'],
    // Sem título: pela numeração
    [{ sheet: 'A-201' }, '', 'elevation'],
    [{ sheet: 'A-301' }, '', 'section'],
    [{ sheet: 'A-901' }, '', 'skip'],
    // Matilda (2026-11-03): números sem hífen no arquiteto (A202), com ponto no estrutural (SA1.1); o título manda
    [{ sheet: 'A202', title: 'FIRST LEVEL FLOOR PLAN' }, '', 'plan'],
    [{ sheet: 'A201', title: 'CELLAR LEVEL FLOOR PLAN' }, '', 'plan'],
    [{ sheet: 'A205', title: 'ROOF LEVEL PLAN' }, '', 'skip'],
    [{ sheet: 'A011', title: 'DIAGRAM AND EGRESS PLANS' }, '', 'skip'],
    [{ sheet: 'A101', title: 'CONSTRUCTION SITE SAFETY PLAN' }, '', 'skip'],
    [{ sheet: 'A020', title: 'INSULATION DIAGRAMS' }, '', 'skip'],
    [{ sheet: 'A030', title: 'WALL TYPES AND CEILING TYPES' }, '', 'schedule'],
    [{ sheet: 'A401', title: 'TRANSVERSE SECTION' }, '', 'section'],
    [{ sheet: 'A531', title: 'STAIR DETAIL PLANS' }, '', 'skip'],
    [{ sheet: 'SA0.0', title: 'NOTES' }, '', 'structural'],
    [{ sheet: 'SA1.1', title: 'APARTMENT FIRST LEVEL PLAN' }, '', 'structural'],
    [{ sheet: 'SA1.4', title: 'APARTMENT ROOF LEVEL PLAN' }, '', 'skip'],
    [{ sheet: 'SA2.0', title: 'APARTMENT ELEVATIONS' }, '', 'skip'],
    [{ sheet: 'SA5.0', title: 'TYPICAL WOOD DETAILS' }, '', 'skip'],
    [{ sheet: 'M202', title: 'FIRST LEVEL MECHANICAL PLAN' }, '', 'skip'],
    [{ sheet: 'E202' }, '', 'skip'],
    [{ sheet: 'A101' }, '', 'plan'],
    [{ sheet: 'A1.02' }, '', 'plan'],
  ] as const)('%o %s → %s', (info, file, expected) => {
    expect(classifySheet(info, file)).toBe(expected);
  });

  it('com pavimento pedido, planta de outro pavimento cai para otherPlan; sem ordinal continua plan', () => {
    expect(classifySheet({ sheet: 'A-101' }, 'A-101-1ST-FLOOR-PLAN.pdf', 1)).toBe('plan');
    expect(classifySheet({ sheet: 'A-102' }, 'A-102-2ND-FLOOR-PLAN.pdf', 1)).toBe('otherPlan');
    expect(classifySheet({ sheet: 'A-100', title: 'Basement and 1st Floor Plans' }, '', 1)).toBe('plan');
    expect(classifySheet({ sheet: 'A-101', title: 'Floor Plans' }, '', 2)).toBe('plan');
    // Porão e cellar são o nível 0: com o pavimento 1 pedido, a planta do cellar é otherPlan (Matilda).
    expect(classifySheet({ sheet: 'A201', title: 'CELLAR LEVEL FLOOR PLAN' }, '', 1)).toBe('otherPlan');
    expect(classifySheet({ sheet: 'A201', title: 'CELLAR LEVEL FLOOR PLAN' }, '', 0)).toBe('plan');
    expect(classifySheet({ sheet: 'A204', title: 'THIRD LEVEL PLAN' }, '', 3)).toBe('plan');
    expect(classifySheet({ sheet: 'A204', title: 'THIRD LEVEL PLAN' }, '', 1)).toBe('otherPlan');
  });

  it('sheetParts: disciplina e série em qualquer grafia', () => {
    expect(sheetParts('A-101')).toEqual({ discipline: 'A', series: '1' });
    expect(sheetParts('A202')).toEqual({ discipline: 'A', series: '2' });
    expect(sheetParts('SA1.1')).toEqual({ discipline: 'SA', series: '1' });
    expect(sheetParts('S-002')).toEqual({ discipline: 'S', series: '0' });
    expect(sheetParts('FP-101')).toEqual({ discipline: 'FP', series: '1' });
    expect(sheetParts('1 of 3')).toBeUndefined();
  });
});

describe('choosePages', () => {
  const c = (source: number, page: number, category: Candidate['category'], bytes = 1000): Candidate => ({ source, page, category, bytes });

  it('fica com tudo que não é skip quando cabe, na ordem dos arquivos e páginas', () => {
    const r = choosePages([c(0, 15, 'schedule'), c(0, 3, 'plan'), c(0, 1, 'skip'), c(0, 6, 'elevation')]);
    expect(r.chosen.map((x) => x.page)).toEqual([3, 6, 15]);
    expect(r.dropped).toEqual([]);
  });

  it('orçamento de páginas: entram por importância (planta, schedule, estrutural, elevação, corte…)', () => {
    const all = [c(0, 1, 'section'), c(0, 2, 'elevation'), c(0, 3, 'structural'), c(0, 4, 'schedule'), c(0, 5, 'plan')];
    const r = choosePages(all, { maxPages: 3, maxBytes: Infinity });
    expect(r.chosen.map((x) => x.page)).toEqual([3, 4, 5]);
    expect(r.dropped.map((x) => x.page)).toEqual([1, 2]);
  });

  it('orçamento de bytes: página grande demais fica de fora, as menores seguem entrando', () => {
    const r = choosePages([c(0, 1, 'plan', 600), c(1, 1, 'schedule', 900), c(2, 1, 'elevation', 300)], { maxPages: 10, maxBytes: 1000 });
    expect(r.chosen.map((x) => x.source)).toEqual([0, 2]);
    expect(r.dropped.map((x) => x.source)).toEqual([1]);
  });

  it(`padrão: ${AUTO_PAGE_BUDGET} páginas`, () => {
    const many = Array.from({ length: AUTO_PAGE_BUDGET + 5 }, (_, i) => c(i, 1, 'elevation', 10));
    expect(choosePages(many).chosen).toHaveLength(AUTO_PAGE_BUDGET);
  });
});

describe('sheetFromFileName', () => {
  it('aceita o número sem hífen', () => {
    expect(sheetFromFileName('A201_first_level.pdf')).toBe('A201');
    expect(sheetFromFileName('A2010.pdf')).toBeUndefined();
  });

  it.each([
    ['A-101-1ST-FLOOR-PLAN---NEW-WING-Rev.2.pdf', 'A-101'],
    ['A-605A-WINDOW-SCHEDULE-Rev.2.pdf', 'A-605A'],
    ['s-104-framing.pdf', 'S-104'],
    ['ID1.08-FURNITURE-PLAN-Rev.0.pdf', undefined],
    ['planta.pdf', undefined],
    ['A-1012-x.pdf', undefined],
  ])('%s → %s', (name, sheet) => {
    expect(sheetFromFileName(name)).toBe(sheet);
  });
});

describe('choosePages — mesma folha em dois arquivos', () => {
  const c = (source: number, sheet: string, titled: boolean): Candidate => ({ source, page: 1, category: 'plan', bytes: 10, sheet, titled });

  it('fica uma só, a que tem título no carimbo (a cópia da segurança sai)', () => {
    const r = choosePages([c(0, 'A-101', false), c(1, 'A-101', true), c(2, 'A-102', false)]);
    expect(r.chosen.map((x) => x.source)).toEqual([1, 2]);
    expect(r.dropped).toEqual([]);
  });

  it('sem título em nenhuma: a primeira', () => {
    expect(choosePages([c(3, 'A-101', false), c(4, 'A-101', false)]).chosen.map((x) => x.source)).toEqual([3]);
  });
});

describe('classifySheet — nome do arquivo só em PDF de 1 página ou página sem título (S25, B1)', () => {
  const name = 'Ringgold-Bath-Schedule-Set.pdf';

  it('PDF multi-folha: "Bath"/"Schedule" no nome não mexem nas páginas com título reconhecível', () => {
    expect(classifySheet({ sheet: 'A-101', title: 'FIRST FLOOR PLAN' }, name, undefined, 12)).toBe('plan');
    expect(classifySheet({ sheet: 'A-201', title: 'EXTERIOR ELEVATIONS' }, name, undefined, 12)).toBe('elevation');
    expect(classifySheet({ sheet: 'S-101', title: 'FOUNDATION PLAN' }, name, undefined, 12)).toBe('skip');
    // Antes: SCHEDULE no nome era testado primeiro e todas viravam `schedule`.
    expect(classifySheet({ sheet: 'A-101', title: 'FIRST FLOOR PLAN' }, name)).toBe('schedule');
  });

  it('PDF multi-folha: página sem título (ou com título sem termo conhecido) ainda usa o nome', () => {
    expect(classifySheet({ sheet: 'A-201' }, name, undefined, 12)).toBe('schedule');
    expect(classifySheet({ sheet: 'A-201', title: 'RINGGOLD ST MULTIFAMILY' }, 'Cover.pdf', undefined, 12)).toBe('skip');
    expect(classifySheet({ sheet: 'A-201', title: 'RINGGOLD ST MULTIFAMILY' }, 'set.pdf', undefined, 12)).toBe('elevation');
  });

  it('PDF de 1 página (Horace): o nome entra mesmo com título no carimbo', () => {
    expect(classifySheet({ sheet: 'A-452', title: 'ENLARGED PLANS & ELEVATIONS' }, 'A-452-ENLARGED-BATHROOM-PLANS-&-ELEVATIONS-Rev.2.pdf', undefined, 1)).toBe('skip');
    expect(classifySheet({ sheet: 'A-606', title: 'NEW WING & UNITS' }, 'A-606-DOOR-SCHEDULE-NEW-WING-&-UNITS-Rev.2.pdf', undefined, 1)).toBe('schedule');
  });

  it('fileNameCounts', () => {
    expect(fileNameCounts({ title: 'FIRST FLOOR PLAN' }, 'x-bath.pdf', 3)).toBe(false);
    expect(fileNameCounts({}, 'x-bath.pdf', 3)).toBe(true);
    expect(fileNameCounts({ title: 'FIRST FLOOR PLAN' }, 'x-bath.pdf', 1)).toBe(true);
    expect(fileNameCounts({ title: 'FIRST FLOOR PLAN' }, '', 1)).toBe(false);
  });
});

describe('choosePages — cópias descartadas viram lista (S25, B8)', () => {
  const c = (source: number, page: number, sheet: string, titled: boolean, category: Candidate['category'] = 'plan'): Candidate => ({ source, page, category, bytes: 10, sheet, titled });

  it('devolve cada cópia descartada com a página que foi no lugar', () => {
    const kept = c(1, 1, 'A-101', true);
    const r = choosePages([c(0, 1, 'A-101', false), kept, c(2, 1, 'A-102', false), c(3, 4, 'A-102', false)]);
    expect(r.chosen.map((x) => [x.source, x.page])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(r.duplicates.map((d) => [d.dropped.source, d.dropped.page, d.kept.source, d.kept.page])).toEqual([
      [0, 1, 1, 1],
      [3, 4, 2, 1],
    ]);
  });

  it('página `skip` com o mesmo número não é cópia (não ia de qualquer jeito)', () => {
    const r = choosePages([c(0, 1, 'A-101', true), c(1, 1, 'A-101', false, 'skip')]);
    expect(r.duplicates).toEqual([]);
  });
});

describe('pageKey', () => {
  it('índice da fonte e página', () => {
    expect(pageKey(2, 15)).toBe('2:15');
  });
});
