import { describe, expect, it } from 'vitest';
import { parseProject } from 'cli/project';
import { byWall, countIssues, draftIssues, idIndex, idsInMessage, parseProblem, parseWarning, type IdIndex } from './problems';
import { draftFromJson, type ProjectDraft } from './draft';

const ids: IdIndex = {
  walls: ['N1', 'S1', 'S2', 'I1', 'I12-U3', 'W01'],
  openings: new Map([
    ['N1', ['N1-A-1']],
    ['S1', ['S1-A-1']],
    ['S2', ['S2-1-2', 'S2-D1']],
    ['I1', []],
    ['I12-U3', ['I12-U3-1']],
    ['W01', ['P1', 'J1']],
  ]),
};

describe('parseProblem: mensagens reais do motor e do parser', () => {
  it('frame.ts: parede e abertura', () => {
    const i = parseProblem(`parede W01, abertura J1: RO de 0" a 36" do start não cabe na plate (de 2.75" a 480" do start)`, ids);
    expect(i).toMatchObject({ severity: 'problem', source: 'engine', wallId: 'W01', openingId: 'J1' });
  });

  it('build.ts: prefixo "parede X:" e "planta:"', () => {
    expect(parseProblem('parede S2: header fora da tabela R602.7(1) para a abertura S2-D1 (vão 58.5")', ids)).toMatchObject({ wallId: 'S2' });
    expect(parseProblem('planta: paredes N1 e S1 se cruzam em (10, 20) — divida uma delas', ids)).toMatchObject({ source: 'engine', wallId: 'N1' });
  });

  it('connections.ts: id com hífen não casa dentro de outro id', () => {
    const i = parseProblem('paredes I12-U3 (end) e S2 (start): conflito de ends', ids);
    expect(i.wallId).toBe('I12-U3');
    expect(idsInMessage('abertura S2-D1 fora', ids)).toEqual({ wallId: 'S2', openingId: 'S2-D1' });
    expect(idsInMessage('o painel 1-S2-P1 passa', ids)).toEqual({});
  });

  it('parser: caminho walls[i].openings[j] vale pelo índice, com o nome do projeto como fonte', () => {
    const a = parseProblem('project.walls[2].openings[1].center: medida inválida "x"', ids);
    expect(a).toMatchObject({ source: 'parser', wallId: 'S2', openingId: 'S2-D1', path: 'walls[2].openings[1].center' });
    const b = parseProblem('26 Ringgold St.walls[4].height: esperado medida > 0, recebido nada', ids);
    expect(b).toMatchObject({ source: 'parser', wallId: 'I12-U3', path: 'walls[4].height' });
    const c = parseProblem('parser: 26 Ringgold St.walls[0].openings: parede N1: tag "A" não está em config.openingTypes', ids);
    expect(c).toMatchObject({ source: 'parser', wallId: 'N1' });
    expect(parseProblem('project.walls: id duplicado "S1"', ids)).toMatchObject({ source: 'engine', wallId: 'S1' });
  });

  it('mensagens do parser de verdade localizam a parede', () => {
    const text = JSON.stringify({ name: 'x', config: { studSpacing: 16, studLength: [92.625] }, walls: [{ id: 'A1', length: 96, height: 97, section: '2x4', exterior: false, bearing: false }, { id: 'B2', length: 96, height: -1, section: '2x4', exterior: false, bearing: false }] });
    let message = '';
    try {
      parseProject(text, 'project');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(parseProblem(message, { walls: ['A1', 'B2'], openings: new Map() })).toMatchObject({ source: 'parser', wallId: 'B2', path: 'walls[1].height' });
  });

  it('altura: e extração: são do projeto / da extração', () => {
    expect(parseProblem('altura: os desenhos não trazem cortes (2 parede(s) sem altura: N1, S1); informe a altura', ids)).toMatchObject({ source: 'project' });
    expect(parseProblem('altura: …', ids).wallId).toBeUndefined();
    const w = parseWarning('extração ABERTURA_SEM_POSICAO: parede I12-U3, abertura I12-U3-1 (U2): a leitura não achou a cota', ids);
    expect(w).toMatchObject({ severity: 'warning', source: 'extraction', code: 'ABERTURA_SEM_POSICAO', wallId: 'I12-U3', openingId: 'I12-U3-1' });
    expect(parseWarning('extração ALTURA_PADRAO: portas sem altura: S2-D1, N1-A-1', ids)).toMatchObject({ source: 'extraction', code: 'ALTURA_PADRAO' });
  });

  it('motor: prefixo do convert', () => {
    expect(parseProblem('motor: parede S2: entre os RO de S2-1-2 e S2-D1 sobram 8.25"', ids)).toMatchObject({ source: 'engine', wallId: 'S2' });
  });
});

describe('parseWarning: avisos do motor', () => {
  it('painel → parede; abertura citada no texto', () => {
    const w = parseWarning('1-S2-P1 HEADER_JACKS_BELOW_TABLE: abertura S2-D1: 1 jack(s) de cada lado; a tabela pede 2 (hipótese P30)', ids);
    expect(w).toMatchObject({ severity: 'warning', source: 'engine', code: 'HEADER_JACKS_BELOW_TABLE', panelId: '1-S2-P1', wallId: 'S2', openingId: 'S2-D1' });
    expect(parseWarning('2-I12-U3-P3 OPENING_NUDGED: abertura I12-U3-1 deslocada 3/8"', ids)).toMatchObject({ wallId: 'I12-U3', openingId: 'I12-U3-1', panelId: '2-I12-U3-P3' });
    expect(parseWarning('1-W01-P2 FIRE_BLOCKING_REQUIRED: parede com mais de 10\' de altura', ids)).toMatchObject({ wallId: 'W01', code: 'FIRE_BLOCKING_REQUIRED' });
  });
});

describe('draftIssues', () => {
  function draft(raw: unknown): { draft: ProjectDraft; problems: { path: string; text: string }[] } {
    const r = draftFromJson(raw);
    if (!r.ok) throw new Error('should open');
    return r;
  }

  it('campos obrigatórios, catálogo, posição, ids repetidos', () => {
    const d = draft({
      config: { studSpacing: 16, studLength: [92.625], openingTypes: { A: { kind: 'window', width: 30, height: 40 } } },
      walls: [
        { id: 'W1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, section: '2x6', exterior: true, bearing: true, openings: [{ id: 'J', tag: 'B', center: 50 }, { id: 'J', type: 'window' }] },
        { id: 'W1', length: 96, height: 97, section: '2x4', exterior: false, bearing: false, openings: [{ id: 'K', tag: 'A', headerMark: 'H9', center: 10 }] },
      ],
    });
    const issues = draftIssues(d.draft, d.problems);
    const texts = issues.map((i) => i.text);
    expect(texts).toContain('walls: some walls are in plan (start/end) and some by length — use one format');
    expect(texts).toContain('wall W1: height is missing');
    expect(texts).toContain('wall W1: duplicate id');
    expect(texts).toContain('opening J: type "B" is not in the opening schedule');
    expect(texts).toContain('opening J: duplicate id (opening ids are unique in the project)');
    expect(texts).toContain('opening J: rough opening size is missing (no schedule tag)');
    expect(texts).toContain('opening J: position is missing (center or left edge)');
    expect(texts).toContain('opening K: header "H9" is not in the header schedule');
    expect(issues.find((i) => i.text.startsWith('opening K'))).toMatchObject({ wallId: 'W1', openingId: 'K', source: 'draft' });
    expect(countIssues(issues).problems).toBe(issues.length);
  });

  it('problemas da carga ganham a parede pelo caminho; projeto válido não tem issue', () => {
    const d = draft({ name: 'x', config: { studSpacing: 16, studLength: [92.625] }, walls: [{ id: 'A', length: 'bad', height: 97, section: '2x4', exterior: false, bearing: false }] });
    const issues = draftIssues(d.draft, d.problems);
    expect(issues[0]).toMatchObject({ source: 'draft', wallId: 'A', path: 'walls[0].length' });
    expect(issues[0]?.text).toMatch(/^walls\[0\]\.length: Not a measure/);
    expect(byWall(issues).get('A')).toHaveLength(2); // o da carga + "length is missing"
    const ok = draft({ name: 'x', config: { studSpacing: 16, studLength: [92.625] }, walls: [{ id: 'A', length: 96, height: 97, section: '2x4', exterior: false, bearing: false }] });
    expect(draftIssues(ok.draft, ok.problems)).toEqual([]);
    expect(idIndex(ok.draft)).toEqual({ walls: ['A'], openings: new Map([['A', []]]) });
  });
});
