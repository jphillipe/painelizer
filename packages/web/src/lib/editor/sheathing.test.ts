import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { parseProject } from 'cli/project';
import { draftFromText, textFromDraft, type ProjectDraft } from './draft';
import { patchSheathing, sheathingStatus, wallSheathingChoice } from './sheathing';
import { joinBlocker, splitWall } from './wall-ops';

const load = (text: string): ProjectDraft => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error(r.problems.map((p) => p.text).join('\n'));
  expect(r.problems).toEqual([]);
  return r.draft;
};

describe('S38: sheathing no editor', () => {
  it('escolha da parede: segue (vazio), ligado, desligado, ajuste do arquivo', () => {
    expect(wallSheathingChoice(undefined)).toBeUndefined();
    expect(wallSheathingChoice(true)).toBe('on');
    expect(wallSheathingChoice(false)).toBe('off');
    expect(wallSheathingChoice({ side: 'both' })).toBe('custom');
  });

  it('status: a parede manda, depois o tipo, depois config.sheathing.walls (default: as externas)', () => {
    const none = { config: {} };
    expect(sheathingStatus(none, { exterior: true })).toMatchObject({ on: false, source: 'none' });
    const project = { config: { sheathing: {} } };
    expect(sheathingStatus(project, { exterior: true })).toMatchObject({ on: true, source: 'project' });
    expect(sheathingStatus(project, { exterior: false })).toMatchObject({ on: false, source: 'project' });
    expect(sheathingStatus({ config: { sheathing: { walls: 'all' } } }, { exterior: false }).on).toBe(true);
    expect(sheathingStatus({ config: { sheathing: { walls: 'none' } } }, { exterior: true }).on).toBe(false);
    const typed = { config: { sheathing: {}, wallTypes: { WT: { exterior: true, sheathing: false } } } };
    expect(sheathingStatus(typed, { wallType: 'WT' })).toMatchObject({ on: false, source: 'type' });
    expect(sheathingStatus(typed, { wallType: 'WT', sheathing: true })).toMatchObject({ on: true, source: 'wall' });
    // Posição vinda do tipo conta para a regra das externas.
    expect(sheathingStatus({ config: { sheathing: {}, wallTypes: { X: { exterior: true } } } }, { wallType: 'X' }).on).toBe(true);
  });

  it('patch: só o que veio muda; aninhado vazio some; "auto" do arquivo fica até o campo ser preenchido', () => {
    const cur = { thickness: 0.5, overhang: { corner: 'auto' as const, floorTop: 12 }, walls: 'all' as const };
    expect(patchSheathing(cur, { floorTop: undefined })).toEqual({ thickness: 0.5, overhang: { corner: 'auto' }, walls: 'all' });
    expect(patchSheathing(cur, { corner: 4 })).toEqual({ thickness: 0.5, overhang: { corner: 4, floorTop: 12 }, walls: 'all' });
    expect(patchSheathing(undefined, { sheetHeight: 108, nail: '10d' })).toEqual({ sheet: { height: 108 }, nailing: { nail: '10d' } });
    expect(patchSheathing(undefined, { walls: undefined })).toEqual({});
  });

  it('draft: config, tipo e parede passam e voltam iguais; campo ruim vira problem no caminho', () => {
    const raw = JSON.parse(EXAMPLES[0]!.text) as { config: Record<string, unknown>; walls: Record<string, unknown>[] };
    raw.config['sheathing'] = { thickness: '7/16"', sheet: { height: "9'" }, side: 'both', overhang: { corner: 'auto', floorBottom: 10.875 }, nailing: { nail: '8d' }, walls: 'all' };
    raw.walls[0]!['sheathing'] = false;
    raw.walls[1]!['sheathing'] = { overhang: { floorTop: 12 } };
    const text = JSON.stringify(raw);
    const draft = load(text);
    expect(draft.config.sheathing).toEqual({
      thickness: 0.4375,
      sheet: { height: 108 },
      side: 'both',
      overhang: { corner: 'auto', floorBottom: 10.875 },
      nailing: { nail: '8d' },
      walls: 'all',
    });
    expect(draft.walls[0]!.sheathing).toBe(false);
    expect(draft.walls[1]!.sheathing).toEqual({ overhang: { floorTop: 12 } });
    expect(parseProject(textFromDraft(draft), 'p')).toEqual(parseProject(text, 'p'));
    expect(textFromDraft(load(textFromDraft(draft)))).toBe(textFromDraft(draft));

    raw.config['sheathing'] = { side: 'outside', thickness: 0.5 };
    const bad = draftFromText(JSON.stringify(raw));
    expect(bad.ok && bad.problems.map((p) => p.path)).toEqual(['config.sheathing.side']);
    expect(bad.ok && bad.draft.config.sheathing).toEqual({ thickness: 0.5 });
  });

  it('dividir leva a regra aos dois pedaços; juntar exige a mesma', () => {
    const raw = JSON.parse(EXAMPLES[1]!.text) as { walls: Record<string, unknown>[] };
    raw.walls[0]!['sheathing'] = true;
    const d = load(JSON.stringify(raw));
    const r = splitWall(d, d.walls[0]!.id, 240);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.wallIds.map((id) => r.draft.walls.find((w) => w.id === id)!);
    expect(a!.sheathing).toBe(true);
    expect(b!.sheathing).toBe(true);
    expect(joinBlocker(r.draft, a!.id, b!.id)).toBeUndefined();
    const changed = { ...r.draft, walls: r.draft.walls.map((w) => (w.id === b!.id ? { ...w, sheathing: false } : w)) };
    expect(joinBlocker(changed, a!.id, b!.id)).toMatch(/differ in sheathing/);
  });
});
