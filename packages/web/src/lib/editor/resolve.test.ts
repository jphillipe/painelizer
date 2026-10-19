import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, type ProjectDraft } from './draft';
import { catalogTags, configFromDraft, headerMarks, openingWidth, resolveDraftOpening, sectionFromDraft } from './resolve';

const load = (text: string): ProjectDraft => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error('should open');
  return r.draft;
};

describe('resolve', () => {
  it('abertura por tag e centro vira RO e borda como no motor', () => {
    const d = load(EXAMPLES[2]!.text); // Ringgold: tags 1, A2, U2
    const n1 = d.walls[0]!.openings[0]!;
    const r = resolveDraftOpening(d, n1);
    if (!r.ok) throw new Error(r.message);
    expect(r.opening).toMatchObject({ id: 'N1-A', type: 'window', roughWidth: 58.5, roughHeight: 72.5 });
    expect(r.opening.offset).toBeCloseTo(101.875 - 58.5 / 2);
    expect(openingWidth(d, n1)).toBe(58.5);
    expect(catalogTags(d.config)).toEqual(['1', 'A2', 'U2']);
    expect(headerMarks(d.config)).toEqual([]);
  });

  it('tag fora do catálogo: mensagem do core; largura cai para a digitada ou 36', () => {
    const d = load(EXAMPLES[2]!.text);
    const r = resolveDraftOpening(d, { id: 'X', tag: 'ZZ', center: 10 });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('ZZ') });
    expect(openingWidth(d, { id: 'X', tag: 'ZZ', roughWidth: 40 })).toBe(40);
    expect(openingWidth(d, { id: 'X', tag: 'ZZ' })).toBe(36);
  });

  it('configFromDraft: defaults do CLI, catálogo e schedule convertidos; seção engenheirada', () => {
    const d = load(EXAMPLES[0]!.text); // casa-exemplo: J36, P30, HDR1
    const c = configFromDraft(d);
    expect(c).toMatchObject({ studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, headerHeight: 82.5 });
    expect(c.openingTypes?.['J36']).toMatchObject({ kind: 'window', width: 35.5 });
    expect(c.headerSchedule?.['HDR1']).toMatchObject({ section: '2x10', plies: 2, jackStuds: 1, kingStuds: 1 });
    expect(sectionFromDraft({ material: 'LVL', width: 1.75, depth: 9.25 })).toBe('LVL 1.75x9.25');
    expect(configFromDraft({ config: {}, walls: [] })).toEqual({ studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: [] });
  });
});
