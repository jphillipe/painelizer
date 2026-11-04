import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, isReviewed, textFromDraft, wallById, type DraftWall, type ProjectDraft } from './draft';
import { planGeometry } from './geometry';
import { DUPLICATE_OFFSET, duplicateWalls, joinBlocker, joinWalls, splitWall, suggestSplit } from './wall-ops';

const load = (i: number): ProjectDraft => {
  const r = draftFromText(EXAMPLES[i]!.text);
  if (!r.ok) throw new Error('should open');
  return r.draft;
};
const house = (): ProjectDraft => load(1);
const ringgold = (): ProjectDraft => load(2);
const ok = (r: ReturnType<typeof splitWall>): ProjectDraft => {
  if (!r.ok) throw new Error(r.reason);
  return r.draft;
};
const withWall = (d: ProjectDraft, id: string, f: (w: DraftWall) => DraftWall): ProjectDraft => ({
  ...d,
  walls: d.walls.map((w) => (w.id === id ? f(w) : w)),
});

describe('S30: dividir parede', () => {
  it('W01 da casa 28x40 em 20′: cada abertura vai ao pedaço dela, o segundo ganha id novo logo depois e a casa continua fechando', () => {
    const r = splitWall(house(), 'W01', 240);
    expect(r.ok && r.wallIds).toEqual(['W01', 'W06']);
    const d = ok(r);
    expect(d.walls.map((w) => w.id)).toEqual(['W01', 'W06', 'W02', 'W03', 'W04', 'W05']);
    const [a, b] = [wallById(d, 'W01')!, wallById(d, 'W06')!];
    expect([a.start, a.end, b.start, b.end]).toEqual([
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 0 },
      { x: 480, y: 0 },
    ]);
    expect(a.openings.map((o) => [o.id, o.offset])).toEqual([['P1', 168]]);
    expect(b.openings.map((o) => [o.id, o.offset])).toEqual([['J1', 96]]);
    expect({ section: b.section, height: b.height, exterior: b.exterior, bearing: b.bearing }).toEqual({
      section: a.section,
      height: a.height,
      exterior: a.exterior,
      bearing: a.bearing,
    });
    // Colineares ponta a ponta são duas paredes livres para o core (house/connections.ts).
    const g = planGeometry(d);
    expect(g.houseError).toBeUndefined();
    expect(g.walls.find((w) => w.wallId === 'W06')!.openings[0]!.s0).toBe(96);
    expect(() => JSON.parse(textFromDraft(d))).not.toThrow();
  });

  it('recusa corte dentro de abertura, fora da parede ou em parede que não existe', () => {
    const r = splitWall(house(), 'W01', 180);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('P1') });
    expect(splitWall(house(), 'W01', 0).ok).toBe(false);
    expect(splitWall(house(), 'W01', 480).ok).toBe(false);
    expect(splitWall(house(), 'W99', 10).ok).toBe(false);
  });

  it('studs extras, quebras forçadas e regra das pontas vão ao pedaço deles; grupo de studs no corte recusa; `$reviewed` sai', () => {
    const d0 = withWall(house(), 'W01', (w) => ({
      ...w,
      extraStuds: [{ x: 100 }, { x: 300, count: 2 }],
      panelBreaks: [96, 240, 384],
      ends: { start: 'through', end: 'butt' },
      extra: { $reviewed: true, $note: 'x' },
    }));
    const d = ok(splitWall(d0, 'W01', 240));
    const [a, b] = [wallById(d, 'W01')!, wallById(d, 'W06')!];
    expect([a.extraStuds, b.extraStuds]).toEqual([[{ x: 100 }], [{ x: 60, count: 2 }]]);
    expect([a.panelBreaks, b.panelBreaks]).toEqual([[96], [144]]);
    expect([a.ends, b.ends]).toEqual([{ start: 'through' }, { end: 'butt' }]);
    expect([isReviewed(a), isReviewed(b), a.extra, b.extra]).toEqual([false, false, { $note: 'x' }, { $note: 'x' }]);
    const straddle = withWall(house(), 'W01', (w) => ({ ...w, extraStuds: [{ x: 239 }] }));
    expect(splitWall(straddle, 'W01', 240)).toEqual({ ok: false, reason: expect.stringContaining('Extra stud') });
  });

  it('parede solta (Ringgold N1, 16′): comprimentos somam, abertura por centro anda −at e o segundo pedaço guarda o layout (layoutOrigin − at)', () => {
    const d = ok(splitWall(ringgold(), 'N1', 48));
    const ids = d.walls.map((w) => w.id);
    const b = d.walls[ids.indexOf('N1') + 1]!;
    expect(wallById(d, 'N1')!.length).toBe(48);
    expect(b.length).toBe(144);
    expect(b.layoutOrigin).toBe(-48);
    expect(b.openings.map((o) => [o.id, o.center])).toEqual([['N1-A', 101.875 - 48]]);
    expect(wallById(d, 'N1')!.openings).toEqual([]);
  });

  it('sugestão: o meio, ou a borda de abertura mais próxima quando o meio cai dentro dela', () => {
    expect(suggestSplit(house(), 'W01')).toBe(240);
    const moved = withWall(house(), 'W01', (w) => ({
      ...w,
      openings: w.openings.map((o) => (o.id === 'P1' ? { ...o, offset: 230 } : o)),
    }));
    expect(suggestSplit(moved, 'W01')).toBe(230);
    expect(suggestSplit(house(), 'W99')).toBeUndefined();
  });
});

describe('S30: juntar paredes', () => {
  it('dividir e juntar de volta devolve a parede original (aberturas, pontas e quebras)', () => {
    const original = withWall(house(), 'W01', (w) => ({ ...w, ends: { start: 'through', end: 'butt' } }));
    const split = ok(splitWall(original, 'W01', 240));
    const r = joinWalls(split, 'W01', 'W06');
    expect(r.ok && r.wallIds).toEqual(['W01']);
    expect(ok(r).walls).toEqual(original.walls);
  });

  it('a outra correndo ao contrário: aberturas por borda são invertidas com a largura do RO', () => {
    const split = ok(splitWall(house(), 'W01', 240));
    const reversed = withWall(split, 'W06', (w) => ({
      ...w,
      start: w.end!,
      end: w.start!,
      openings: w.openings.map((o) => ({ ...o, offset: 240 - o.offset! - o.roughWidth! })),
    }));
    expect(wallById(reversed, 'W06')!.openings[0]!.offset).toBe(108);
    const joined = ok(joinWalls(reversed, 'W01', 'W06'));
    expect(wallById(joined, 'W01')!.openings.map((o) => [o.id, o.offset])).toEqual([
      ['P1', 168],
      ['J1', 336],
    ]);
    // E a ordem dos argumentos não importa: fica a primeira do arquivo.
    expect(ok(joinWalls(reversed, 'W06', 'W01')).walls.map((w) => w.id)).toEqual(['W01', 'W02', 'W03', 'W04', 'W05']);
  });

  it('recusa: perpendiculares, campos diferentes, sem encostar, sobrepostas, soltas', () => {
    const split = ok(splitWall(house(), 'W01', 240));
    expect(joinBlocker(house(), 'W01', 'W02')).toMatch(/same line/);
    expect(
      joinBlocker(
        withWall(split, 'W06', (w) => ({ ...w, height: 109.125 })),
        'W01',
        'W06',
      ),
    ).toMatch(/differ in height/);
    expect(
      joinBlocker(
        withWall(split, 'W06', (w) => ({ ...w, start: { x: 250, y: 0 } })),
        'W01',
        'W06',
      ),
    ).toMatch(/end to end/);
    expect(
      joinBlocker(
        withWall(split, 'W06', (w) => ({ ...w, end: { x: 100, y: 0 } })),
        'W01',
        'W06',
      ),
    ).toMatch(/overlap/);
    expect(joinBlocker(ringgold(), 'N1', 'S1')).toMatch(/plan/);
    expect(joinBlocker(split, 'W01', 'W01')).toBeDefined();
    expect(joinBlocker(split, 'W01', 'W06')).toBeUndefined();
  });
});

describe('S30: duplicar paredes', () => {
  it('cópias logo depois da última original, deslocadas (+24, −24), aberturas com ids novos e sem `$reviewed`', () => {
    const d0 = withWall(house(), 'W01', (w) => ({ ...w, extra: { $reviewed: true } }));
    const r = duplicateWalls(d0, ['W02', 'W01']);
    expect(r.ok && r.wallIds).toEqual(['W06', 'W07']);
    const d = ok(r);
    expect(d.walls.map((w) => w.id)).toEqual(['W01', 'W02', 'W06', 'W07', 'W03', 'W04', 'W05']);
    const c = wallById(d, 'W06')!;
    expect([c.start, c.end]).toEqual([
      { x: DUPLICATE_OFFSET, y: -DUPLICATE_OFFSET },
      { x: 480 + DUPLICATE_OFFSET, y: -DUPLICATE_OFFSET },
    ]);
    expect(c.openings.map((o) => [o.id, o.offset])).toEqual([
      ['W06-O1', 168],
      ['W06-O2', 336],
    ]);
    expect(wallById(d, 'W07')!.openings.map((o) => o.id)).toEqual(['W07-O1', 'W07-O2']);
    expect(isReviewed(c)).toBe(false);
    expect(isReviewed(wallById(d, 'W01')!)).toBe(true);
    expect(duplicateWalls(house(), []).ok).toBe(false);
  });
});
