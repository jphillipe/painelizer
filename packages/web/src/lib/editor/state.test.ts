import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { textFromDraft, wallById, type ProjectDraft } from './draft';
import { canRedo, canUndo, commit, editorReducer, HISTORY_LIMIT, initialEditorState, isReviewed, NEW_WALL_LENGTH, reviewedCount, type EditorAction, type EditorState } from './state';

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
    const j1 = wallById(draftOf(s1), 'W01')?.openings.find((o) => o.id === 'J1')!;
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

describe('M5: moveWall e setReviewed', () => {
  it('moveWall desloca as duas pontas; offsets das aberturas ficam (a abertura vai junto); parede solta não move', () => {
    const s = loaded();
    const before = wallById(draftOf(s), 'W01')!;
    const moved = editorReducer(s, { type: 'moveWall', wallId: 'W01', dx: 12, dy: -1 });
    const w = wallById(draftOf(moved), 'W01')!;
    expect(w.start).toEqual({ x: before.start!.x + 12, y: before.start!.y - 1 });
    expect(w.end).toEqual({ x: before.end!.x + 12, y: before.end!.y - 1 });
    expect(w.openings).toEqual(before.openings);
    expect(moved.dirty).toBe(true);
    expect(editorReducer(s, { type: 'moveWall', wallId: 'W01', dx: 0, dy: 0 })).toBe(s);
    const l = loose();
    expect(editorReducer(l, { type: 'moveWall', wallId: 'N1', dx: 1, dy: 0 })).toBe(l);
    // Um nudge com txn repetido é um undo só.
    let t = s;
    for (let i = 0; i < 5; i += 1) t = editorReducer(t, { type: 'moveWall', wallId: 'W01', dx: 1, dy: 0, txn: 'nudge' });
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
