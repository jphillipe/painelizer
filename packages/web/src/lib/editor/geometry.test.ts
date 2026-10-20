import { describe, expect, it } from 'vitest';
import { frameWalls, type House } from 'core';
import { EXAMPLES } from 'cli/examples';
import { parseProject } from 'cli/project';
import { draftFromText, type ProjectDraft } from './draft';
import { alongFromStart, endpointOnAxis, geometryIssues, planGeometry, pointAlong, segmentRect, union } from './geometry';
import { idIndex } from './problems';

const load = (text: string): ProjectDraft => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error('should open');
  return r.draft;
};
const house28 = (): ProjectDraft => load(EXAMPLES[1]!.text);
const casa = (): ProjectDraft => load(EXAMPLES[0]!.text);

describe('planGeometry: casa que fecha', () => {
  it('28x40: 5 paredes enquadradas com as plates do frameWalls, formato plan, 1 pavimento', () => {
    const d = house28();
    const g = planGeometry(d);
    expect(g.format).toBe('plan');
    expect(g.houseError).toBeUndefined();
    expect(g.broken).toEqual([]);
    expect(g.levels).toEqual([1]);
    expect(g.walls.map((w) => w.wallId)).toEqual(['W01', 'W02', 'W03', 'W04', 'W05']);
    const project = parseProject(EXAMPLES[1]!.text, 'p');
    const frames = frameWalls(project.house as House);
    for (const w of g.walls) {
      const f = frames.find((x) => x.wallId === w.wallId)!;
      expect(w.framed).toBe(true);
      expect(w.plateStart).toEqual(f.plateStart);
      expect(w.plateEnd).toEqual(f.plateEnd);
      expect(w.plateLength).toBeCloseTo(f.wall.length);
    }
    // W01 (2x6, 0,0 → 480,0) é a mais longa e atravessa W04 e W02: plate de −2.75 a 482.75, retângulo com 5.5 de espessura.
    const w01 = g.walls[0]!;
    expect(w01).toMatchObject({ dir: 'x', sign: 1, thickness: 5.5, exterior: true });
    expect(w01.rect).toEqual({ x: -2.75, y: -2.75, w: 485.5, h: 5.5 });
    expect(g.bounds).toEqual({ x: -2.75, y: -2.75, w: 485.5, h: 341.5 });
  });

  it('aberturas: s0/s1 do start e retângulo na espessura da parede; porta e janela resolvidas', () => {
    const g = planGeometry(house28());
    const w01 = g.walls[0]!;
    expect(w01.openings.map((o) => [o.openingId, o.type, o.s0, o.s1, o.resolved, o.form])).toEqual([
      ['P1', 'door', 168, 206, true, 'offset'],
      ['J1', 'window', 336, 372, true, 'offset'],
    ]);
    expect(w01.openings[0]!.rect).toEqual({ x: 168, y: -2.75, w: 38, h: 5.5 });
    // W02 vertical (480,0 → 480,336): o retângulo da abertura sobe no eixo y.
    const w02 = g.walls[1]!;
    expect(w02.dir).toBe('y');
    expect(w02.openings[0]!.rect).toEqual({ x: 477.25, y: 72, w: 5.5, h: 36 });
  });

  it('casa-exemplo: canto W01 atravessa (ends.start through) e W02 encosta; abertura por tag e centro', () => {
    const g = planGeometry(casa());
    const w01 = g.walls.find((w) => w.wallId === 'W01')!;
    const w02 = g.walls.find((w) => w.wallId === 'W02')!;
    expect(w01.plateLength).toBeCloseTo(146.75);
    expect(w02.plateLength).toBeCloseTo(189.25);
    const w05 = g.walls.find((w) => w.wallId === 'W05')!;
    const byTag = w05.openings.find((o) => o.form === 'center');
    expect(byTag).toBeDefined();
    expect(byTag!.resolved).toBe(true);
    expect(byTag!.s1 - byTag!.s0).toBeCloseTo(36);
  });
});

describe('planGeometry: casa que não fecha', () => {
  it('paredes cruzadas: houseError cita as duas, fallback eixo ± t/2 para todas, bounds ainda existe', () => {
    const d = house28();
    // W05 interna (264,0 → 264,336) cortada por uma parede nova horizontal no meio da casa.
    d.walls.push({ id: 'X1', start: { x: 100, y: 168 }, end: { x: 400, y: 168 }, section: '2x4', exterior: false, bearing: false, height: 97.125, openings: [] });
    const g = planGeometry(d);
    expect(g.houseError).toMatch(/cruzam/);
    expect(g.houseErrorWalls).toEqual(['W05', 'X1']);
    expect(g.walls).toHaveLength(6);
    expect(g.walls.every((w) => !w.framed)).toBe(true);
    expect(g.walls[0]!.rect).toEqual({ x: 0, y: -2.75, w: 480, h: 5.5 }); // sem o avanço do canto
    expect(g.bounds).toBeDefined();
    const issues = geometryIssues(g, idIndex(d));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ source: 'geometry', severity: 'problem', wallId: 'W05', alsoWalls: ['X1'] });
  });

  it('lastGood: paredes não citadas no erro mantêm as plates enquadradas da geometria anterior', () => {
    const d = house28();
    const good = planGeometry(d);
    d.walls.push({ id: 'X1', start: { x: 100, y: 168 }, end: { x: 400, y: 168 }, section: '2x4', exterior: false, bearing: false, height: 97.125, openings: [] });
    const g = planGeometry(d, good);
    const w01 = g.walls.find((w) => w.wallId === 'W01')!;
    expect(w01.framed).toBe(true);
    expect(w01.rect).toEqual(good.walls[0]!.rect);
    const w05 = g.walls.find((w) => w.wallId === 'W05')!;
    expect(w05.framed).toBe(false);
    // Parede que mudou de lugar não reaproveita.
    const moved = house28();
    moved.walls[0]!.end = { x: 470, y: 0 };
    moved.walls.push({ id: 'X1', start: { x: 100, y: 168 }, end: { x: 400, y: 168 }, section: '2x4', exterior: false, bearing: false, height: 97.125, openings: [] });
    expect(planGeometry(moved, good).walls[0]!.framed).toBe(false);
  });

  it('parede fora do eixo vai para broken e vira issue da parede; as outras seguem no fallback', () => {
    const d = house28();
    d.walls[4]!.end = { x: 300, y: 336 }; // W05 diagonal
    const g = planGeometry(d);
    expect(g.broken.map((b) => b.wallId)).toEqual(['W05']);
    expect(g.walls).toHaveLength(4);
    expect(g.houseError).toMatch(/fora dos eixos/);
    const issues = geometryIssues(g, idIndex(d));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ wallId: 'W05', source: 'geometry' });
  });

  it('abertura irresolvida (tag fora do catálogo) é desenhada com o que se sabe; sem posição fica sem retângulo', () => {
    const d = house28();
    d.walls[0]!.openings.push({ id: 'Z', tag: 'nope', center: 100 }, { id: 'Y', type: 'window', roughWidth: 30, roughHeight: 40 });
    const g = planGeometry(d);
    const z = g.walls[0]!.openings.find((o) => o.openingId === 'Z')!;
    expect(z).toMatchObject({ resolved: false, s0: 82, s1: 118, form: 'center' });
    expect(z.rect).toEqual({ x: 82, y: -2.75, w: 36, h: 5.5 });
    const y = g.walls[0]!.openings.find((o) => o.openingId === 'Y')!;
    expect(y).toMatchObject({ resolved: false, form: 'none', rect: undefined });
    expect(g.houseError).toBeUndefined(); // o core só vê as resolvidas
  });

  it('projeto solto ou sem paredes: nada para desenhar', () => {
    const g = planGeometry(load(EXAMPLES[2]!.text));
    expect(g).toMatchObject({ format: 'loose', walls: [], bounds: undefined, houseError: undefined });
    expect(planGeometry({ config: {}, walls: [] }).format).toBe('empty');
  });

  it('parede com altura, seção ou papel faltando ainda é desenhada (defaults só para a planta)', () => {
    const g = planGeometry({ config: {}, walls: [{ id: 'A', start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, openings: [] }] });
    expect(g.walls[0]).toMatchObject({ section: '2x4', thickness: 3.5, framed: true, plateLength: 120 });
  });
});

describe('helpers', () => {
  it('segmentRect, union, alongFromStart, pointAlong, endpointOnAxis', () => {
    expect(segmentRect({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 0, y: -2, w: 10, h: 4 });
    expect(segmentRect({ x: 5, y: 10 }, { x: 5, y: 0 }, 4)).toEqual({ x: 3, y: 0, w: 4, h: 10 });
    expect(union([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: -2, w: 1, h: 1 }])).toEqual({ x: 0, y: -2, w: 6, h: 3 });
    expect(union([])).toBeUndefined();
    const g = planGeometry(house28());
    const w03 = g.walls[2]!; // (480,336) → (0,336): dir x, sign −1
    expect(alongFromStart(w03, { x: 240, y: 300 })).toBe(240);
    expect(pointAlong(w03, 240)).toEqual({ x: 240, y: 336 });
    expect(endpointOnAxis(w03, 'end', { x: 12, y: 999 })).toEqual({ x: 12, y: 336 });
    const w02 = g.walls[1]!;
    expect(endpointOnAxis(w02, 'start', { x: 999, y: 12 })).toEqual({ x: 480, y: 12 });
  });
});
