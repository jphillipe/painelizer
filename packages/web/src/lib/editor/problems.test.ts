import { describe, expect, it } from 'vitest';
import { parseProject, ProjectError } from 'cli/project';
import { frameWalls, noticeOf, type EngineError, type HouseWall } from 'core';
import { legacyNotice } from 'extract/notices';
import type { Notice } from '@/types/panels';
import { byWall, countIssues, draftIssues, hasOriginal, idIndex, issueFromNotice, issueMessage, parseEngineResult, type IdIndex } from './problems';
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

describe('issueFromNotice (S26): parede e abertura pelos campos do aviso, nunca pelo texto', () => {
  it('erro do motor com parede e abertura: localiza, frase em inglês, original intacto', () => {
    const n: Notice = { source: 'engine', code: 'OPENING_OFF_PLATE', message: 'parede W01, abertura J1: RO de 0" a 36" do start não cabe na plate (de 2.75" a 480" do start)', wallId: 'W01', openingId: 'J1', params: { from: 0, to: 36, s0: 2.75, s1: 480 } };
    const i = issueFromNotice(n, 'problem', ids);
    expect(i).toMatchObject({ severity: 'problem', source: 'engine', code: 'OPENING_OFF_PLATE', wallId: 'W01', openingId: 'J1', text: n.message });
    expect(issueMessage(i)).toBe('Wall W01, opening J1: the rough opening from 0" to 36" (measured from start) does not fit on the plate (2.75" to 480").');
    expect(hasOriginal(i)).toBe(true);
  });

  it('erro de planta real (frameWalls): parede, alsoWalls e família plan.open', () => {
    const wall = (id: string, x0: number, y0: number, x1: number, y1: number): HouseWall => ({ id, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [] });
    let notice: Notice | undefined;
    try {
      frameWalls({ walls: [wall('N1', 0, 50, 200, 50), wall('S1', 100, 0, 100, 200)] });
    } catch (e) {
      notice = { source: 'engine', stage: 'plan', ...noticeOf(e as EngineError) };
    }
    const crossing = issueFromNotice(notice!, 'problem', ids);
    expect(crossing).toMatchObject({ source: 'engine', code: 'WALLS_CROSS', kind: 'plan.open', wallId: 'N1', alsoWalls: ['S1'] });
    expect([...byWall([crossing]).keys()]).toEqual(['N1', 'S1']);
    expect(issueMessage(crossing)).toBe('Walls N1 and S1 cross at (100, 50) — split one of them at the crossing.');
  });

  it('abertura de outra parede define a parede; abertura fora do draft fica só em cited', () => {
    expect(issueFromNotice({ code: 'DOOR_RO_HEIGHT_MISMATCH', message: 'x', openingId: 'S2-D1' }, 'warning', ids)).toMatchObject({ wallId: 'S2', openingId: 'S2-D1' });
    const ghost = issueFromNotice({ code: 'OPENING_UNPLACED', message: 'x', source: 'extraction', wallId: 'I12-U3', openingId: 'I12-U3-9' }, 'warning', ids);
    expect(ghost).toMatchObject({ wallId: 'I12-U3', cited: { wallId: 'I12-U3', openingId: 'I12-U3-9' } });
    expect(ghost.openingId).toBeUndefined();
  });

  it('parser: caminho walls[i].openings[j] (estrutural) vale pelo índice', () => {
    const a = issueFromNotice({ source: 'parser', code: 'PROJECT_INVALID', message: 'project.walls[2].openings[1].center: medida inválida "x"', path: 'walls[2].openings[1].center', params: { path: 'walls[2].openings[1].center' } }, 'problem', ids);
    expect(a).toMatchObject({ source: 'parser', wallId: 'S2', openingId: 'S2-D1', path: 'walls[2].openings[1].center' });
    expect(issueMessage(a)).toBe('The project file has an invalid value at walls[2].openings[1].center.');
  });

  it('erro de verdade do parser: ProjectError traz o caminho', () => {
    const text = JSON.stringify({ name: 'x', config: { studSpacing: 16, studLength: [92.625] }, walls: [{ id: 'A1', length: 96, height: 97, section: '2x4', exterior: false, bearing: false }, { id: 'B2', length: 96, height: -1, section: '2x4', exterior: false, bearing: false }] });
    let error: ProjectError | undefined;
    try {
      parseProject(text, 'project');
    } catch (e) {
      error = e as ProjectError;
    }
    expect(error!.path).toBe('project.walls[1].height');
    const i = issueFromNotice({ source: 'parser', code: 'PROJECT_INVALID', message: error!.message, path: 'walls[1].height' }, 'problem', { walls: ['A1', 'B2'], openings: new Map() });
    expect(i).toMatchObject({ source: 'parser', wallId: 'B2', path: 'walls[1].height' });
  });

  it('dado do projeto inteiro não aponta parede; HEADER_DATA_MISSING entra na família do draft', () => {
    expect(issueFromNotice({ source: 'project', code: 'WALL_HEIGHT_MISSING', message: 'x', params: { count: 2, wallIds: ['N1', 'S1'] } }, 'problem', ids)).toMatchObject({ source: 'project', kind: 'wall.height' });
    expect(issueFromNotice({ source: 'engine', stage: 'bom', code: 'PIECE_OVER_STOCK', message: 'x', params: { length: 300, max: 240 } }, 'problem', ids).source).toBe('project');
    const h = issueFromNotice({ code: 'HEADER_DATA_MISSING', message: 'x', wallId: 'S2', openingId: 'S2-D1', params: { missing: 'floorsSupported' } }, 'problem', ids);
    expect(h).toMatchObject({ kind: 'wall.floorsSupported', wallId: 'S2' });
  });
});

describe('avisos do motor e da leitura', () => {
  it('painel → parede quando o aviso não traz a parede; hipótese fica no campo', () => {
    const [w] = parseEngineResult({ warnings: [{ source: 'engine', panelId: '1-S2-P1', code: 'HEADER_JACKS_BELOW_TABLE', message: 'x', openingId: 'S2-D1', hypothesis: 'P30', params: { reason: 'neighbor', wanted: 2, gap: 6, neighborId: 'S2-1-2' } }] }, ids);
    expect(w).toMatchObject({ severity: 'warning', source: 'engine', code: 'HEADER_JACKS_BELOW_TABLE', panelId: '1-S2-P1', wallId: 'S2', openingId: 'S2-D1', hypothesis: 'P30' });
    expect(issueMessage(w!)).toBe('Wall S2, opening S2-D1: 1 jack stud per side instead of 2 — only 6" to the rough opening of S2-1-2.');
  });

  it('aviso de leitura gravado como texto (antes da S26): código novo, ids do prefixo, frase em inglês', () => {
    const n = legacyNotice('extração ABERTURA_SEM_POSICAO: parede I12-U3, abertura I12-U3-1 (U2): a leitura não achou a cota');
    const w = issueFromNotice(n as Notice, 'warning', ids);
    expect(w).toMatchObject({ source: 'extraction', code: 'OPENING_UNPLACED', wallId: 'I12-U3', cited: { openingId: 'I12-U3-1' } });
    expect(issueMessage(w)).toMatch(/^Wall I12-U3, opening I12-U3-1: the AI found this U2 opening/);
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
    expect(issues.find((i) => i.text.startsWith('opening K'))).toMatchObject({ wallId: 'W1', openingId: 'K', source: 'draft', kind: 'opening.headerMark' });
    expect(issues.find((i) => i.text === 'wall W1: duplicate id')).toMatchObject({ kind: 'wall.duplicateId' });
    expect(issues.every((i) => typeof i.kind === 'string')).toBe(true);
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
