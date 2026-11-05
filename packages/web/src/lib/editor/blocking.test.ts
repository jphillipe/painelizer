import { describe, expect, it } from 'vitest';
import { parseProject } from 'cli/project';
import { blockingEntryText, blockingFromType, blockingPresetOptions, withoutBlockingEntry } from './blocking';
import { draftFromJson, textFromDraft, type DraftConfig } from './draft';
import { splitWall } from './wall-ops';
import { editorReducer, initialEditorState } from './state';

const config: DraftConfig = {
  blockingPresets: { 'kitchen-base': { y: 35, label: 'Counter (ours)' }, hood: { y: 66 } },
  wallTypes: { 'WT-4': { section: '2x4', blocking: ['kitchen-base'] }, 'WT-2': { section: '2x4' } },
};

describe('blocking no editor (S36)', () => {
  it('presets: embutidos + do projeto, o do projeto substitui, em ordem de id', () => {
    const opts = blockingPresetOptions(config);
    expect(opts.map((o) => o.id)).toEqual([
      'bath-paper',
      'bath-shower',
      'bath-toilet',
      'bath-towel',
      'bath-valve',
      'hood',
      'kitchen-base',
      'kitchen-upper-bottom',
      'kitchen-upper-top',
    ]);
    expect(opts.find((o) => o.id === 'kitchen-base')).toEqual({ id: 'kitchen-base', y: 35, label: 'Counter (ours)', project: true });
    expect(opts.find((o) => o.id === 'hood')).toEqual({ id: 'hood', y: 66, label: 'hood', project: true });
    expect(opts.find((o) => o.id === 'bath-valve')).toMatchObject({ y: 42, label: 'Shower valve', project: false });
  });

  it('texto de cada item', () => {
    expect(blockingEntryText('bath-towel', {})).toBe('Towel bar · 4\'-0"');
    expect(blockingEntryText('nope', {})).toBe('nope · unknown preset');
    expect(blockingEntryText({ y: 54, from: 96, label: 'Rail' }, {})).toBe('Rail · 4\'-6" · 8\'-0" to end');
    expect(blockingEntryText({ y: 30 }, {})).toBe('Blocking · 2\'-6"');
  });

  it('o tipo dá as fileiras só para a parede sem as suas; tirar o último item não devolve as do tipo', () => {
    expect(blockingFromType(config, { wallType: 'WT-4' })).toEqual(['kitchen-base']);
    expect(blockingFromType(config, { wallType: 'WT-4', blocking: [] })).toBeUndefined();
    expect(blockingFromType(config, { wallType: 'WT-2' })).toBeUndefined();
    expect(withoutBlockingEntry(config, { wallType: 'WT-4', blocking: ['bath-towel'] }, 0)).toEqual([]);
    expect(withoutBlockingEntry(config, { wallType: 'WT-2', blocking: ['bath-towel'] }, 0)).toBeUndefined();
    expect(withoutBlockingEntry(config, { blocking: ['bath-towel', { y: 30 }] }, 0)).toEqual([{ y: 30 }]);
  });
});

describe('draft lê e escreve blocking (S36)', () => {
  const raw = {
    config: {
      studSpacing: 16,
      studLength: [92.625],
      fireBlockAt: 110,
      blockingPresets: { hood: { y: "5'-6\"", label: 'Range hood' } },
      wallTypes: { 'WT-4': { section: '2x4', exterior: false, bearing: false, blocking: ['kitchen-base', { y: 84 }] } },
    },
    walls: [
      { id: 'W01', length: 144, height: 97.125, section: '2x4', exterior: false, bearing: false, blocking: ['hood', { y: '3\'', from: 12, to: 48, label: 'Rail' }], openings: [] },
      { id: 'W02', length: 144, height: 97.125, wallType: 'WT-4', openings: [] },
    ],
  };

  it('sem problems; ida e volta pelo CLI com os mesmos valores', () => {
    const r = draftFromJson(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.problems).toEqual([]);
    expect(r.draft.config.blockingPresets).toEqual({ hood: { y: 66, label: 'Range hood' } });
    expect(r.draft.config.fireBlockAt).toBe(110);
    expect(r.draft.config.wallTypes?.['WT-4']?.blocking).toEqual(['kitchen-base', { y: 84 }]);
    expect(r.draft.walls[0]?.blocking).toEqual(['hood', { y: 36, from: 12, to: 48, label: 'Rail' }]);
    const text = textFromDraft(r.draft);
    const p = parseProject(text);
    expect(p.config.blockingPresets).toEqual({ hood: { y: 66, label: 'Range hood' } });
    expect(p.walls[0]?.blocking).toEqual(['hood', { y: 36, from: 12, to: 48, label: 'Rail' }]);
    expect(p.walls[1]?.blocking).toEqual(['kitchen-base', { y: 84 }]);
  });

  it('item ruim vira problem no caminho e sai da lista; os vizinhos ficam', () => {
    const bad = { ...raw, walls: [{ ...raw.walls[0], blocking: ['hood', 36, { y: 'x', label: 'L' }, ''] }] };
    const r = draftFromJson(bad);
    if (!r.ok) throw new Error('should open');
    expect(r.draft.walls[0]?.blocking).toEqual(['hood', { label: 'L' }]);
    expect(r.problems.map((p) => p.path)).toEqual(['walls[0].blocking[1]', 'walls[0].blocking[2].y', 'walls[0].blocking[3]']);
  });

  it('dividir a parede corta os trechos; mover o start mantém o trecho no lugar', () => {
    const r = draftFromJson({
      config: { studSpacing: 16, studLength: [92.625] },
      walls: [{ id: 'W01', start: { x: 0, y: 0 }, end: { x: 192, y: 0 }, height: 97.125, section: '2x4', exterior: false, bearing: false, blocking: ['hood', { y: 36, from: 40, to: 120 }, { y: 50, to: 20 }], openings: [] }],
    });
    if (!r.ok) throw new Error('should open');
    const s = splitWall(r.draft, 'W01', 96);
    if (!s.ok) throw new Error(s.reason);
    expect(s.draft.walls[0]?.blocking).toEqual(['hood', { y: 36, from: 40, to: 96 }, { y: 50, to: 20 }]);
    expect(s.draft.walls[1]?.blocking).toEqual(['hood', { y: 36, from: 0, to: 24 }]);

    const loaded = editorReducer(initialEditorState, { type: 'load', text: textFromDraft(r.draft), source: 'file' });
    const moved = editorReducer(loaded, { type: 'moveEndpoint', wallId: 'W01', end: 'start', point: { x: -10, y: 0 } });
    const w = moved.draft!.walls[0]!;
    expect(w.blocking).toEqual(['hood', { y: 36, from: 50, to: 130 }, { y: 50, to: 30 }]);
  });
});
