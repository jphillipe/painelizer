import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { parseProject } from 'cli/project';
import { textFromDraft, wallById, type ProjectDraft } from './draft';
import { canRedo, canUndo, commit, editorReducer, HISTORY_LIMIT, initialEditorState, isReviewed, NEW_WALL_LENGTH, reviewedCount, selectedWallIds, toggledWall, viewedUnderlay, wallsSelection, type EditorAction, type EditorState } from './state';

const loaded = (): EditorState => editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
const loose = (): EditorState => editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[2]!.text, source: 'sample' });
const run = (s: EditorState, ...actions: EditorAction[]): EditorState => actions.reduce(editorReducer, s);
const draftOf = (s: EditorState): ProjectDraft => {
  if (s.draft === undefined) throw new Error('no draft');
  return s.draft;
};

describe('editorReducer: carga e seleção', () => {
  it('load abre o draft, zera histórico e seleção, e sobe a revisão', () => {
    const s = loaded();
    expect(s.draft?.walls).toHaveLength(5);
    expect(s.source).toBe('sample');
    expect(s.revision).toBe(1);
    expect(s.dirty).toBe(false);
    expect(s.loadProblems).toEqual([]);
    const again = editorReducer({ ...s, selection: { kind: 'wall', wallId: 'W01' }, dirty: true }, { type: 'load', text: EXAMPLES[2]!.text, source: 'file' });
    expect(again.selection).toEqual({ kind: 'none' });
    expect(again.dirty).toBe(false);
    expect(again.revision).toBe(2);
  });

  it('JSON inválido: sem draft, com loadError', () => {
    const s = editorReducer(initialEditorState, { type: 'load', text: '{', source: 'file' });
    expect(s.draft).toBeUndefined();
    expect(s.loadError).toMatch(/Invalid JSON/);
  });

  it('reset e select; edição sem draft é ignorada', () => {
    const s = editorReducer(loaded(), { type: 'select', selection: { kind: 'wall', wallId: 'W02' } });
    expect(s.selection).toEqual({ kind: 'wall', wallId: 'W02' });
    const r = editorReducer(s, { type: 'reset' });
    expect(r.draft).toBeUndefined();
    expect(r.selection).toEqual({ kind: 'none' });
    expect(editorReducer(r, { type: 'addWall' })).toBe(r);
  });
});

describe('S47: a seleção carrega o campo a focar', () => {
  const opening = { kind: 'opening', wallId: 'W01', openingId: 'J1' } as const;

  it('select com focus grava os ids; sem focus, limpa', () => {
    const s = editorReducer(loaded(), { type: 'select', selection: opening, focus: ['o-J1-center', 'o-J1-offset'] });
    expect(s.selection).toEqual(opening);
    expect(s.focus).toEqual({ fieldIds: ['o-J1-center', 'o-J1-offset'] });
    expect(editorReducer(s, { type: 'select', selection: opening }).focus).toBeUndefined();
  });

  it('o mesmo clique duas vezes dá um focus novo (o efeito roda de novo); editar não mexe nele', () => {
    const first = editorReducer(loaded(), { type: 'select', selection: opening, focus: ['o-J1-hby'] });
    const second = editorReducer(first, { type: 'select', selection: opening, focus: ['o-J1-hby'] });
    expect(second.focus).toEqual(first.focus);
    expect(second.focus).not.toBe(first.focus);
    const edited = editorReducer(second, { type: 'updateOpening', wallId: 'W01', openingId: 'J1', patch: { headerHeight: 80 } });
    expect(edited.focus).toBe(second.focus);
  });

  it('carregar outro projeto ou zerar apaga o focus', () => {
    const s = editorReducer(loaded(), { type: 'select', selection: opening, focus: ['o-J1-hby'] });
    expect(editorReducer(s, { type: 'load', text: EXAMPLES[2]!.text, source: 'file' }).focus).toBeUndefined();
    expect(editorReducer(s, { type: 'reset' }).focus).toBeUndefined();
  });
});

describe('commit, undo, redo', () => {
  it('commit empilha, undo volta, redo refaz; seleção de peça sumida é corrigida', () => {
    const s0 = editorReducer(loaded(), { type: 'select', selection: { kind: 'wall', wallId: 'W05' } });
    const s1 = commit(s0, { ...draftOf(s0), walls: draftOf(s0).walls.slice(0, 4) });
    expect(s1.draft?.walls).toHaveLength(4);
    expect(s1.selection).toEqual({ kind: 'none' });
    expect(s1.dirty).toBe(true);
    expect(canUndo(s1)).toBe(true);
    const s2 = editorReducer(s1, { type: 'undo' });
    expect(s2.draft?.walls).toHaveLength(5);
    expect(canRedo(s2)).toBe(true);
    expect(s2.revision).toBe(s1.revision + 1);
    const s3 = editorReducer(s2, { type: 'redo' });
    expect(s3.draft?.walls).toHaveLength(4);
    expect(canRedo(s3)).toBe(false);
    expect(editorReducer(initialEditorState, { type: 'undo' })).toBe(initialEditorState);
  });

  it('transação: commits com o mesmo txn são um só undo; outro txn ou endTransaction fecham a anterior', () => {
    let s = loaded();
    for (let i = 0; i < 10; i += 1) s = commit(s, { ...draftOf(s), name: `n${i}` }, 'drag-1');
    expect(s.past).toHaveLength(1);
    expect(s.draft?.name).toBe('n9');
    s = commit(s, { ...draftOf(s), name: 'other' }, 'drag-2');
    expect(s.past).toHaveLength(2);
    s = editorReducer(s, { type: 'endTransaction' });
    s = commit(s, { ...draftOf(s), name: 'again' }, 'drag-2');
    expect(s.past).toHaveLength(3);
    s = commit(s, { ...draftOf(s), name: 'plain' });
    expect(s.past).toHaveLength(4);
    expect(s.txn).toBeUndefined();
    const u = editorReducer(s, { type: 'undo' });
    expect(u.draft?.name).toBe('again');
    expect(editorReducer(editorReducer(u, { type: 'undo' }), { type: 'undo' }).draft?.name).toBe('n9');
  });

  it('histórico limitado', () => {
    let s = loaded();
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) s = commit(s, { ...draftOf(s), name: `n${i}` });
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });

  it('abertura selecionada que some volta para a parede', () => {
    const s0 = editorReducer(loaded(), { type: 'select', selection: { kind: 'opening', wallId: 'W01', openingId: 'P1' } });
    const walls = draftOf(s0).walls.map((w) => (w.id === 'W01' ? { ...w, openings: w.openings.filter((o) => o.id !== 'P1') } : w));
    const s1 = commit(s0, { ...draftOf(s0), walls });
    expect(s1.selection).toEqual({ kind: 'wall', wallId: 'W01' });
  });
});

describe('edição de projeto e config', () => {
  it('updateProject / updateConfig: patch com undefined apaga a chave', () => {
    const s = run(loaded(), { type: 'updateProject', patch: { name: 'Nova', revision: undefined } }, { type: 'updateConfig', patch: { studSpacing: 24, headerHeight: undefined } });
    const d = draftOf(s);
    expect(d.name).toBe('Nova');
    expect('revision' in d).toBe(false);
    expect(d.config.studSpacing).toBe(24);
    expect('headerHeight' in d.config).toBe(false);
    expect(s.past).toHaveLength(2);
    expect(s.dirty).toBe(true);
  });

  it('updateBuilding cria, altera e remove o bloco', () => {
    const s = run(loaded(), { type: 'updateBuilding', patch: { windSpeed: 140 } });
    expect(draftOf(s).config.building).toMatchObject({ groundSnowLoad: 50, windSpeed: 140 });
    const cleared = run(s, { type: 'updateBuilding', patch: { groundSnowLoad: undefined, buildingWidth: undefined, windSpeed: undefined, exposure: undefined } });
    expect('building' in draftOf(cleared).config).toBe(false);
  });
});

describe('edição de paredes', () => {
  it('updateWall e renameWall (colisão e vazio são no-op; seleção acompanha)', () => {
    const s0 = editorReducer(loaded(), { type: 'select', selection: { kind: 'opening', wallId: 'W02', openingId: 'J2' } });
    const s1 = run(s0, { type: 'updateWall', wallId: 'W02', patch: { bearing: false, floorsSupported: undefined } });
    expect(wallById(draftOf(s1), 'W02')).toMatchObject({ bearing: false });
    expect('floorsSupported' in wallById(draftOf(s1), 'W02')!).toBe(false);
    expect(editorReducer(s1, { type: 'renameWall', wallId: 'W02', newId: 'W01' })).toBe(s1);
    expect(editorReducer(s1, { type: 'renameWall', wallId: 'W02', newId: '  ' })).toBe(s1);
    const s2 = editorReducer(s1, { type: 'renameWall', wallId: 'W02', newId: 'E1' });
    expect(wallById(draftOf(s2), 'E1')?.openings).toHaveLength(2);
    expect(s2.selection).toEqual({ kind: 'opening', wallId: 'E1', openingId: 'J2' });
  });

  it('moveEndpoint em end não mexe nas aberturas; em start desloca offsets, centros e studs extras', () => {
    const s0 = loaded();
    const s1 = editorReducer(s0, { type: 'moveEndpoint', wallId: 'W01', end: 'end', point: { x: 400, y: 0 } });
    expect(wallById(draftOf(s1), 'W01')).toMatchObject({ end: { x: 400, y: 0 } });
    expect(wallById(draftOf(s1), 'W01')?.openings.map((o) => o.offset)).toEqual([168, 336]);
    const withExtra = commit(s1, { ...draftOf(s1), walls: draftOf(s1).walls.map((w) => (w.id === 'W01' ? { ...w, extraStuds: [{ x: 100 }], openings: [...w.openings, { id: 'C', tag: 'x', center: 200 }] } : w)) });
    const s2 = editorReducer(withExtra, { type: 'moveEndpoint', wallId: 'W01', end: 'start', point: { x: 24, y: 0 } });
    const w = wallById(draftOf(s2), 'W01')!;
    expect(w.start).toEqual({ x: 24, y: 0 });
    expect(w.openings.map((o) => o.offset ?? o.center)).toEqual([144, 312, 176]);
    expect(w.extraStuds).toEqual([{ x: 76 }]);
    // Parede vertical (W02: start (480,0) → end (480,336)): mover start para cima desloca pelo eixo y.
    const s3 = editorReducer(s0, { type: 'moveEndpoint', wallId: 'W02', end: 'start', point: { x: 480, y: 12 } });
    expect(wallById(draftOf(s3), 'W02')?.openings.map((o) => o.offset)).toEqual([60, 204]);
  });

  it('moveEndpoint rejeita parede menor que 1" e parede solta; txn coalesce', () => {
    const s0 = loaded();
    expect(editorReducer(s0, { type: 'moveEndpoint', wallId: 'W01', end: 'end', point: { x: 0.5, y: 0 } })).toBe(s0);
    const l = loose();
    expect(editorReducer(l, { type: 'moveEndpoint', wallId: 'N1', end: 'end', point: { x: 1, y: 0 } })).toBe(l);
    let s = s0;
    for (let x = 400; x <= 460; x += 10) s = editorReducer(s, { type: 'moveEndpoint', wallId: 'W01', end: 'end', point: { x, y: 0 }, txn: 'd' });
    expect(s.past).toHaveLength(1);
    expect(wallById(draftOf(s), 'W01')?.end).toEqual({ x: 460, y: 0 });
    expect(wallById(draftOf(editorReducer(s, { type: 'undo' })), 'W01')?.end).toEqual({ x: 480, y: 0 });
  });

  it('setWallLength: solta muda length; em planta move end pelo eixo', () => {
    const l = editorReducer(loose(), { type: 'setWallLength', wallId: 'N1', length: 120 });
    expect(wallById(draftOf(l), 'N1')?.length).toBe(120);
    const p = editorReducer(loaded(), { type: 'setWallLength', wallId: 'W03', length: 240 });
    expect(wallById(draftOf(p), 'W03')).toMatchObject({ start: { x: 480, y: 336 }, end: { x: 240, y: 336 } });
    const s0 = loaded();
    expect(editorReducer(s0, { type: 'setWallLength', wallId: 'W03', length: 0 })).toBe(s0);
  });

  it('addWall em planta continua da ponta end virando 90°, copia os dados e seleciona; solta ganha length', () => {
    const s = editorReducer(loaded(), { type: 'addWall', afterWallId: 'W01' });
    const d = draftOf(s);
    expect(d.walls.map((w) => w.id)).toEqual(['W01', 'W06', 'W02', 'W03', 'W04', 'W05']);
    const nw = wallById(d, 'W06')!;
    expect(nw).toMatchObject({ start: { x: 480, y: 0 }, end: { x: 480, y: NEW_WALL_LENGTH }, section: '2x6', exterior: true, bearing: true, height: 97.125, floorsSupported: 0, openings: [] });
    expect(s.selection).toEqual({ kind: 'wall', wallId: 'W06' });
    const l = editorReducer(loose(), { type: 'addWall' });
    expect(draftOf(l).walls.at(-1)).toMatchObject({ id: 'S3', length: NEW_WALL_LENGTH, section: '2x4', exterior: false, bearing: false }); // padrão dominante S1/S2; copia da última (I1)
    const empty = editorReducer(editorReducer(initialEditorState, { type: 'load', text: JSON.stringify({ config: { studSpacing: 16, studLength: [92.625] }, walls: [] }), source: 'file' }), { type: 'addWall' });
    expect(draftOf(empty).walls[0]).toMatchObject({ id: 'W1', start: { x: 0, y: 0 }, end: { x: NEW_WALL_LENGTH, y: 0 }, height: 97.125 });
  });

  it('removeWall limpa a seleção; id inexistente é no-op', () => {
    const s0 = editorReducer(loaded(), { type: 'select', selection: { kind: 'wall', wallId: 'W05' } });
    const s1 = editorReducer(s0, { type: 'removeWall', wallId: 'W05' });
    expect(draftOf(s1).walls).toHaveLength(4);
    expect(s1.selection).toEqual({ kind: 'none' });
    expect(editorReducer(s1, { type: 'removeWall', wallId: 'W05' })).toBe(s1);
  });
});

describe('edição de aberturas', () => {
  it('addOpening sem catálogo: janela 36x48 no meio; com catálogo: primeira tag no centro', () => {
    const s = editorReducer(loaded(), { type: 'addOpening', wallId: 'W04' });
    const o = wallById(draftOf(s), 'W04')?.openings.at(-1);
    expect(o).toEqual({ id: 'W04-O1', type: 'window', offset: 150, roughWidth: 36, roughHeight: 48 });
    expect(s.selection).toEqual({ kind: 'opening', wallId: 'W04', openingId: 'W04-O1' });
    const c = editorReducer(loose(), { type: 'addOpening', wallId: 'I1' });
    expect(wallById(draftOf(c), 'I1')?.openings.at(-1)).toEqual({ id: 'I1-O1', tag: '1', center: 92 });
  });

  it('addOpening com preset (abertura que a leitura não posicionou): id e tag da leitura; id ocupado ou tag desconhecida caem no padrão', () => {
    const tags = Object.keys(draftOf(loose()).config.openingTypes ?? {});
    const p = editorReducer(loose(), { type: 'addOpening', wallId: 'I1', preset: { id: 'I1-U2-1', tag: tags[1] } });
    expect(wallById(draftOf(p), 'I1')?.openings.at(-1)).toEqual({ id: 'I1-U2-1', tag: tags[1], center: 92 });
    expect(p.selection).toEqual({ kind: 'opening', wallId: 'I1', openingId: 'I1-U2-1' });
    const taken = wallById(draftOf(loose()), 'I1')!.openings[0]?.id ?? 'I1-O1';
    const q = editorReducer(p, { type: 'addOpening', wallId: 'I1', preset: { id: taken, tag: 'NOPE' } });
    expect(wallById(draftOf(q), 'I1')?.openings.at(-1)).toMatchObject({ id: 'I1-O1', tag: tags[0] });
  });

  it('updateOpening, renameOpening, moveOpening (center ou offset conforme a forma)', () => {
    const s0 = run(loaded(), { type: 'select', selection: { kind: 'opening', wallId: 'W01', openingId: 'J1' } });
    const s1 = editorReducer(s0, { type: 'updateOpening', wallId: 'W01', openingId: 'J1', patch: { jackStuds: 2, header: undefined } });
    const j1 = wallById(draftOf(s1), 'W01')!.openings.find((o) => o.id === 'J1')!;
    expect(j1.jackStuds).toBe(2);
    expect('header' in j1).toBe(false);
    expect(editorReducer(s1, { type: 'renameOpening', wallId: 'W01', openingId: 'J1', newId: 'P1' })).toBe(s1);
    const s2 = editorReducer(s1, { type: 'renameOpening', wallId: 'W01', openingId: 'J1', newId: 'JAN' });
    expect(s2.selection).toEqual({ kind: 'opening', wallId: 'W01', openingId: 'JAN' });
    const s3 = editorReducer(s2, { type: 'moveOpening', wallId: 'W01', openingId: 'JAN', s0: 300, roughWidth: 36 });
    expect(wallById(draftOf(s3), 'W01')?.openings.find((o) => o.id === 'JAN')).toMatchObject({ offset: 300 });
    const c = editorReducer(loose(), { type: 'moveOpening', wallId: 'N1', openingId: 'N1-A', s0: 60, roughWidth: 58.5 });
    expect(wallById(draftOf(c), 'N1')?.openings[0]).toMatchObject({ center: 89.25 });
    expect(wallById(draftOf(c), 'N1')?.openings[0]?.offset).toBeUndefined();
  });

  it('removeOpening tira a abertura e a seleção volta para a parede', () => {
    const s0 = run(loaded(), { type: 'select', selection: { kind: 'opening', wallId: 'W02', openingId: 'J2' } });
    const s1 = editorReducer(s0, { type: 'removeOpening', wallId: 'W02', openingId: 'J2' });
    expect(wallById(draftOf(s1), 'W02')?.openings.map((o) => o.id)).toEqual(['J3']);
    expect(s1.selection).toEqual({ kind: 'wall', wallId: 'W02' });
    expect(editorReducer(s1, { type: 'removeOpening', wallId: 'W02', openingId: 'J2' })).toBe(s1);
  });

  it('o draft editado continua serializável e o texto muda', () => {
    const s = run(loaded(), { type: 'addWall' }, { type: 'addOpening', wallId: 'W06' });
    expect(textFromDraft(draftOf(s))).not.toBe(EXAMPLES[1]!.text);
    expect(JSON.parse(textFromDraft(draftOf(s)))).toMatchObject({ walls: expect.arrayContaining([expect.objectContaining({ id: 'W06' })]) });
  });
});

describe('M5: moveWalls e setReviewed', () => {
  it('moveWalls desloca as duas pontas; offsets das aberturas ficam (a abertura vai junto); parede solta não move', () => {
    const s = loaded();
    const before = wallById(draftOf(s), 'W01')!;
    const moved = editorReducer(s, { type: 'moveWalls', wallIds: ['W01'], dx: 12, dy: -1 });
    const w = wallById(draftOf(moved), 'W01')!;
    expect(w.start).toEqual({ x: before.start!.x + 12, y: before.start!.y - 1 });
    expect(w.end).toEqual({ x: before.end!.x + 12, y: before.end!.y - 1 });
    expect(w.openings).toEqual(before.openings);
    expect(moved.dirty).toBe(true);
    expect(editorReducer(s, { type: 'moveWalls', wallIds: ['W01'], dx: 0, dy: 0 })).toBe(s);
    const l = loose();
    expect(editorReducer(l, { type: 'moveWalls', wallIds: ['N1'], dx: 1, dy: 0 })).toBe(l);
    // Um nudge com txn repetido é um undo só.
    let t = s;
    for (let i = 0; i < 5; i += 1) t = editorReducer(t, { type: 'moveWalls', wallIds: ['W01'], dx: 1, dy: 0, txn: 'nudge' });
    expect(t.past).toHaveLength(1);
    expect(wallById(draftOf(t), 'W01')!.start!.x).toBe(before.start!.x + 5);
  });

  it('setReviewed grava `$reviewed` no extra (sobrevive à serialização), desmarcar apaga; repetir é no-op', () => {
    const s = editorReducer(loaded(), { type: 'setReviewed', wallId: 'W02', reviewed: true });
    expect(isReviewed(wallById(draftOf(s), 'W02')!)).toBe(true);
    expect(reviewedCount(draftOf(s).walls)).toBe(1);
    expect(JSON.parse(textFromDraft(draftOf(s))).walls[1].$reviewed).toBe(true);
    expect(editorReducer(s, { type: 'setReviewed', wallId: 'W02', reviewed: true })).toBe(s);
    const off = editorReducer(s, { type: 'setReviewed', wallId: 'W02', reviewed: false });
    expect(isReviewed(wallById(draftOf(off), 'W02')!)).toBe(false);
    expect(wallById(draftOf(off), 'W02')!.extra).toBeUndefined();
  });
});

describe('M6: underlay', () => {
  const u = { version: 1 as const, source: { name: 'a.pdf', page: 1 }, image: 'data:image/png;base64,AA', width: 10, height: 10, scale: 1, origin: { x: 0, y: 0 }, rotation: 0 as const, opacity: 0.35, visible: true };
  it('addDrawings (S32) acrescenta em `$drawings` sem repetir caminho, com histórico', () => {
    const a = { name: 'A.pdf', path: 'u1/A.pdf', size: 3, type: 'application/pdf' };
    const b = { name: 'B.png', path: 'u1/B.png', size: 4, type: 'image/png' };
    const s1 = editorReducer(loaded(), { type: 'addDrawings', drawings: [a] });
    expect(s1.draft?.extra?.['$drawings']).toEqual([a]);
    const s2 = editorReducer(s1, { type: 'addDrawings', drawings: [a, b] });
    expect(s2.draft?.extra?.['$drawings']).toEqual([a, b]);
    expect(editorReducer(s2, { type: 'addDrawings', drawings: [b] })).toBe(s2);
    expect(editorReducer(s2, { type: 'addDrawings', drawings: [] })).toBe(s2);
    const undone = editorReducer(s2, { type: 'undo' });
    expect(undone.draft?.extra?.['$drawings']).toEqual([a]);
  });

  it('setUnderlay grava em `$underlay` com histórico (sem a vista); remover apaga a chave', () => {
    const s = editorReducer(loaded(), { type: 'setUnderlay', underlay: u });
    expect(draftOf(s).extra?.['$underlay']).toMatchObject({ source: { name: 'a.pdf' } });
    expect(draftOf(s).extra?.['$underlay']).not.toHaveProperty('opacity');
    expect(draftOf(s).extra?.['$underlay']).not.toHaveProperty('visible');
    expect(s.dirty).toBe(true);
    expect(canUndo(s)).toBe(true);
    const gone = editorReducer(s, { type: 'setUnderlay', underlay: undefined });
    expect(draftOf(gone).extra?.['$underlay']).toBeUndefined();
  });

  it('S23 (A5): "Hide" e a opacidade são vista — draft, revisão, dirty e histórico não mudam', () => {
    const s = { ...editorReducer(loaded(), { type: 'setUnderlay', underlay: u }), dirty: false };
    const viewed = editorReducer(s, { type: 'setUnderlayView', opacity: 0.6, visible: false });
    expect(viewed.draft).toBe(s.draft);
    expect(viewed.revision).toBe(s.revision);
    expect(viewed.dirty).toBe(false);
    expect(viewed.past).toBe(s.past);
    expect(viewedUnderlay(viewed)).toMatchObject({ opacity: 0.6, visible: false });
    expect(editorReducer(viewed, { type: 'setUnderlayView', opacity: 0.6 })).toBe(viewed);
    // Calibrar o mesmo desenho mantém a vista e não a escreve no arquivo; desenho novo volta ao padrão.
    const rotatedState = editorReducer(viewed, { type: 'setUnderlay', underlay: { ...viewedUnderlay(viewed)!, rotation: 90 } });
    expect(viewedUnderlay(rotatedState)).toMatchObject({ rotation: 90, opacity: 0.6, visible: false });
    expect(draftOf(rotatedState).extra?.['$underlay']).not.toHaveProperty('visible');
    const replaced = editorReducer(viewed, { type: 'setUnderlay', underlay: { ...u, image: 'data:image/png;base64,BB' } });
    expect(viewedUnderlay(replaced)).toMatchObject({ opacity: 0.35, visible: true });
    expect(editorReducer(loaded(), { type: 'setUnderlayView', opacity: 0.5 })).toEqual(loaded());
    // Arquivo de antes da S23 com a vista dentro: vale como vista inicial.
    const legacy = editorReducer(initialEditorState, { type: 'load', source: 'file', text: JSON.stringify({ ...JSON.parse(textFromDraft(draftOf(loaded()))), $underlay: { ...u, visible: false } }) });
    expect(viewedUnderlay(legacy)?.visible).toBe(false);
  });
});

describe('S29: quebras de painel', () => {
  it('setPanelBreaks guarda a lista ordenada, a 1/16" e sem repetição; undefined volta ao automático', () => {
    const s = run(loaded(), { type: 'setPanelBreaks', wallId: 'W01', breaks: [320, 160.01, 160] });
    expect(wallById(draftOf(s), 'W01')?.panelBreaks).toEqual([160, 320]);
    expect(JSON.parse(textFromDraft(draftOf(s))).walls[0].panelBreaks).toEqual([160, 320]);
    const back = run(s, { type: 'setPanelBreaks', wallId: 'W01', breaks: undefined });
    expect(wallById(draftOf(back), 'W01')).not.toHaveProperty('panelBreaks');
    // [] é "um painel só", não o automático.
    expect(wallById(draftOf(run(s, { type: 'setPanelBreaks', wallId: 'W01', breaks: [] })), 'W01')?.panelBreaks).toEqual([]);
    expect(run(s, { type: 'setPanelBreaks', wallId: 'nope', breaks: [1] })).toBe(s);
  });

  it('um arraste (mesmo txn) é um undo só', () => {
    const s = run(
      loaded(),
      { type: 'setPanelBreaks', wallId: 'W01', breaks: [144], txn: 't' },
      { type: 'setPanelBreaks', wallId: 'W01', breaks: [160], txn: 't' },
      { type: 'setPanelBreaks', wallId: 'W01', breaks: [176], txn: 't' },
      { type: 'endTransaction' },
    );
    expect(wallById(draftOf(s), 'W01')?.panelBreaks).toEqual([176]);
    expect(wallById(draftOf(run(s, { type: 'undo' })), 'W01')).not.toHaveProperty('panelBreaks');
  });

  it('mover o start ao longo do eixo desloca as quebras (medidas do start), como as aberturas', () => {
    const s0 = run(loaded(), { type: 'setPanelBreaks', wallId: 'W01', breaks: [160] });
    const w = wallById(draftOf(s0), 'W01')!;
    const dx = Math.sign(w.end!.x - w.start!.x) || 0;
    const dy = Math.sign(w.end!.y - w.start!.y) || 0;
    // Start recua 16" no próprio eixo: a quebra fica no mesmo lugar em planta, 16" mais longe do start.
    const s = run(s0, { type: 'moveEndpoint', wallId: 'W01', end: 'start', point: { x: w.start!.x - 16 * dx, y: w.start!.y - 16 * dy } });
    expect(wallById(draftOf(s), 'W01')?.panelBreaks).toEqual([176]);
  });
});

describe('S29: catálogo editável', () => {
  const casa = (): EditorState => editorReducer(initialEditorState, { type: 'load', text: EXAMPLES.find((e) => e.id === 'casa-exemplo')!.text, source: 'sample' });
  const tags = (s: EditorState): string[] => draftOf(s).walls.flatMap((w) => w.openings.map((o) => o.tag ?? '-'));
  const marks = (s: EditorState): string[] => draftOf(s).walls.flatMap((w) => w.openings.map((o) => o.headerMark ?? '-'));

  it('setOpeningType cria, substitui e apaga; catálogo vazio sai do config', () => {
    const s = run(casa(), { type: 'setOpeningType', tag: 'J24', value: { kind: 'window', width: 24, height: 36 } });
    expect(Object.keys(draftOf(s).config.openingTypes ?? {})).toEqual(['J36', 'P30', 'J24']);
    const r = run(s, { type: 'setOpeningType', tag: 'J24', value: { kind: 'window', width: 30, height: 36 } });
    expect(draftOf(r).config.openingTypes?.['J24']?.width).toBe(30);
    const empty = run(r, { type: 'setOpeningType', tag: 'J24', value: undefined }, { type: 'setOpeningType', tag: 'J36', value: undefined }, { type: 'setOpeningType', tag: 'P30', value: undefined });
    expect(draftOf(empty).config).not.toHaveProperty('openingTypes');
  });

  it('renameOpeningType troca a tag na mesma posição e em todas as aberturas que a usam', () => {
    const before = tags(casa());
    const s = run(casa(), { type: 'renameOpeningType', tag: 'P30', newTag: ' D30 ' });
    expect(Object.keys(draftOf(s).config.openingTypes ?? {})).toEqual(['J36', 'D30']);
    expect(tags(s)).toEqual(before.map((t) => (t === 'P30' ? 'D30' : t)));
    expect(before).toContain('P30');
    // Para uma tag que já existe, para a mesma, vazia ou inexistente: nada muda.
    expect(run(s, { type: 'renameOpeningType', tag: 'D30', newTag: 'J36' })).toBe(s);
    expect(run(s, { type: 'renameOpeningType', tag: 'D30', newTag: '  ' })).toBe(s);
    expect(run(s, { type: 'renameOpeningType', tag: 'nope', newTag: 'X' })).toBe(s);
  });

  it('header schedule: criar, renomear em cascata (headerMark) e apagar', () => {
    const before = marks(casa());
    const s = run(casa(), { type: 'setHeaderEntry', mark: 'HDR2', value: { section: '2x12', plies: 2 } }, { type: 'renameHeaderEntry', mark: 'HDR1', newMark: 'H-A' });
    expect(Object.keys(draftOf(s).config.headerSchedule ?? {})).toEqual(['H-A', 'HDR2']);
    expect(marks(s)).toEqual(before.map((m) => (m === 'HDR1' ? 'H-A' : m)));
    expect(before.filter((m) => m === 'HDR1')).toHaveLength(2);
    expect(Object.keys(draftOf(run(s, { type: 'setHeaderEntry', mark: 'HDR2', value: undefined })).config.headerSchedule ?? {})).toEqual(['H-A']);
  });
});

describe('S35: tipos de parede no catálogo', () => {
  const casa = (): EditorState => editorReducer(initialEditorState, { type: 'load', text: EXAMPLES.find((e) => e.id === 'casa-exemplo')!.text, source: 'sample' });
  const types = (s: EditorState): string[] => draftOf(s).walls.map((w) => w.wallType ?? '-');

  it('setWallType cria, substitui e apaga; catálogo vazio sai do config; um undo por edição', () => {
    const s = run(casa(), { type: 'setWallType', tag: ' WT-3 ', value: { section: '2x4', exterior: false, bearing: true } });
    expect(Object.keys(draftOf(s).config.wallTypes ?? {})).toEqual(['WT-1S', 'WT-2', 'WT-3']);
    const r = run(s, { type: 'setWallType', tag: 'WT-3', value: { section: '2x6' } });
    expect(draftOf(r).config.wallTypes?.['WT-3']).toEqual({ section: '2x6' });
    expect(Object.keys(draftOf(run(r, { type: 'undo' })).config.wallTypes?.['WT-3'] ?? {})).toEqual(['section', 'exterior', 'bearing']);
    const empty = run(r, { type: 'setWallType', tag: 'WT-3', value: undefined }, { type: 'setWallType', tag: 'WT-2', value: undefined }, { type: 'setWallType', tag: 'WT-1S', value: undefined });
    expect(draftOf(empty).config).not.toHaveProperty('wallTypes');
    // Tag em branco não cria linha.
    expect(draftOf(run(casa(), { type: 'setWallType', tag: '  ', value: {} })).config.wallTypes).toEqual(draftOf(casa()).config.wallTypes);
  });

  it('renameWallType troca a tag na mesma posição e em todas as paredes que a usam', () => {
    const before = types(casa());
    const s = run(casa(), { type: 'renameWallType', tag: 'WT-1S', newTag: ' EXT ' });
    expect(Object.keys(draftOf(s).config.wallTypes ?? {})).toEqual(['EXT', 'WT-2']);
    expect(types(s)).toEqual(before.map((t) => (t === 'WT-1S' ? 'EXT' : t)));
    expect(before.filter((t) => t === 'WT-1S')).toHaveLength(5);
    // As paredes que só traziam a tag continuam completas pelo tipo renomeado.
    expect(() => parseProject(textFromDraft(draftOf(s)), 'p')).not.toThrow();
    // Para uma tag que já existe, para a mesma, vazia ou inexistente: nada muda.
    expect(run(s, { type: 'renameWallType', tag: 'EXT', newTag: 'WT-2' })).toBe(s);
    expect(run(s, { type: 'renameWallType', tag: 'EXT', newTag: '  ' })).toBe(s);
    expect(run(s, { type: 'renameWallType', tag: 'nope', newTag: 'X' })).toBe(s);
  });

  it('updateWall e updateWalls gravam e apagam a tag; a parede só com a tag não ganha seção no arquivo', () => {
    const s = run(casa(), { type: 'updateWall', wallId: 'W01', patch: { wallType: undefined } }, { type: 'updateWalls', wallIds: ['W03', 'W04'], patch: { wallType: 'WT-1S' } });
    expect(types(s)).toEqual(['-', 'WT-1S', 'WT-1S', 'WT-1S', 'WT-1S', 'WT-1S', 'WT-1S']);
    expect(wallById(draftOf(s), 'W05')).not.toHaveProperty('section');
  });
});

describe('S30: seleção múltipla e operações de parede', () => {
  it('toggledWall põe e tira; uma parede volta a `wall`, nenhuma a `none`; abertura conta como a parede dela', () => {
    const one = toggledWall({ kind: 'none' }, 'W01');
    expect(one).toEqual({ kind: 'wall', wallId: 'W01' });
    const two = toggledWall(one, 'W03');
    expect(two).toEqual({ kind: 'walls', wallIds: ['W01', 'W03'] });
    expect(toggledWall(two, 'W01')).toEqual({ kind: 'wall', wallId: 'W03' });
    expect(toggledWall({ kind: 'wall', wallId: 'W01' }, 'W01')).toEqual({ kind: 'none' });
    expect(toggledWall({ kind: 'opening', wallId: 'W02', openingId: 'J2' }, 'W04')).toEqual({ kind: 'walls', wallIds: ['W02', 'W04'] });
    expect(selectedWallIds({ kind: 'project' })).toEqual([]);
    expect(wallsSelection(['W01', 'W01'])).toEqual({ kind: 'wall', wallId: 'W01' });
  });

  it('removeWalls apaga todas num undo só; a seleção some', () => {
    const s = run(loaded(), { type: 'select', selection: { kind: 'walls', wallIds: ['W01', 'W05'] } }, { type: 'removeWalls', wallIds: ['W01', 'W05'] });
    expect(draftOf(s).walls.map((w) => w.id)).toEqual(['W02', 'W03', 'W04']);
    expect(s.past).toHaveLength(1);
    expect(s.selection).toEqual({ kind: 'none' });
    expect(editorReducer(s, { type: 'removeWalls', wallIds: ['W99'] })).toBe(s);
  });

  it('seleção múltipla encolhe quando uma das paredes some', () => {
    const s = run(loaded(), { type: 'select', selection: { kind: 'walls', wallIds: ['W01', 'W05'] } }, { type: 'removeWall', wallId: 'W05' });
    expect(s.selection).toEqual({ kind: 'wall', wallId: 'W01' });
  });

  it('moveWalls desloca o conjunto; updateWalls muda o campo comum em todas', () => {
    const s = run(loaded(), { type: 'moveWalls', wallIds: ['W01', 'W02'], dx: 12, dy: 6, txn: 't' }, { type: 'moveWalls', wallIds: ['W01', 'W02'], dx: 1, dy: 0, txn: 't' });
    expect(s.past).toHaveLength(1);
    expect([wallById(draftOf(s), 'W01')!.start, wallById(draftOf(s), 'W02')!.end]).toEqual([{ x: 13, y: 6 }, { x: 493, y: 342 }]);
    const u = editorReducer(loaded(), { type: 'updateWalls', wallIds: ['W03', 'W05'], patch: { height: 109.125, section: '2x4' } });
    expect(draftOf(u).walls.map((w) => w.height)).toEqual([97.125, 97.125, 109.125, 97.125, 109.125]);
    expect(wallById(draftOf(u), 'W03')!.section).toBe('2x4');
  });

  it('addWall com segmento ("Draw wall"): pontas a 1/16", propriedades da parede de referência; segmento curto é no-op', () => {
    const s = editorReducer(loaded(), { type: 'addWall', afterWallId: 'W05', segment: { start: { x: 264, y: 168.01 }, end: { x: 480, y: 168.01 } } });
    const w = wallById(draftOf(s), 'W06')!;
    expect([w.start, w.end, w.section, w.exterior]).toEqual([{ x: 264, y: 168 }, { x: 480, y: 168 }, '2x4', false]);
    expect(s.selection).toEqual({ kind: 'wall', wallId: 'W06' });
    const l = loaded();
    expect(editorReducer(l, { type: 'addWall', segment: { start: { x: 0, y: 0 }, end: { x: 0.5, y: 0 } } })).toBe(l);
  });

  it('duplicateWalls, splitWall e joinWalls selecionam o resultado; recusa não muda o estado', () => {
    const dup = editorReducer(loaded(), { type: 'duplicateWalls', wallIds: ['W01', 'W02'] });
    expect(dup.selection).toEqual({ kind: 'walls', wallIds: ['W06', 'W07'] });
    const split = editorReducer(loaded(), { type: 'splitWall', wallId: 'W01', at: 240 });
    expect(split.selection).toEqual({ kind: 'walls', wallIds: ['W01', 'W06'] });
    const joined = editorReducer(split, { type: 'joinWalls', wallIds: ['W01', 'W06'] });
    expect(joined.selection).toEqual({ kind: 'wall', wallId: 'W01' });
    expect(draftOf(joined).walls).toEqual(draftOf(loaded()).walls);
    expect(joined.past).toHaveLength(2);
    const s = loaded();
    expect(editorReducer(s, { type: 'splitWall', wallId: 'W01', at: 180 })).toBe(s);
    expect(editorReducer(s, { type: 'joinWalls', wallIds: ['W01', 'W02'] })).toBe(s);
  });
});

describe('Correção da S30: reducer estável sob reaplicação', () => {
  it('o mesmo estado com a mesma ação devolve o mesmo resultado (o React reaplica a fila ao rebasear)', () => {
    const action: EditorAction = { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' };
    const first = editorReducer(initialEditorState, action);
    const replayed = editorReducer(initialEditorState, action);
    expect(replayed).toBe(first);
    expect(replayed.draft).toBe(first.draft);
    const edit: EditorAction = { type: 'moveWalls', wallIds: ['W01'], dx: 1, dy: 0 };
    expect(editorReducer(first, edit)).toBe(editorReducer(first, edit));
    // Ação nova (outro dispatch) com o mesmo conteúdo continua calculando de novo, e cada carga conta.
    const other = editorReducer(initialEditorState, { ...action });
    expect(other).not.toBe(first);
    expect([first.loads, editorReducer(first, { ...action }).loads, editorReducer(first, { type: 'reset' }).loads]).toEqual([1, 2, 2]);
  });
});

describe('S37: posts ao mover o start', () => {
  it('ficam no lugar em planta, como os studs extras', () => {
    const s0 = loaded();
    const withPost = commit(s0, { ...draftOf(s0), walls: draftOf(s0).walls.map((w) => (w.id === 'W01' ? { ...w, posts: [{ x: 100, section: '4x4' as const }] } : w)) });
    const s1 = editorReducer(withPost, { type: 'moveEndpoint', wallId: 'W01', end: 'start', point: { x: 24, y: 0 } });
    expect(wallById(draftOf(s1), 'W01')?.posts).toEqual([{ x: 76, section: '4x4' }]);
  });
});
