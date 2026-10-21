import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, textFromDraft, type DraftWall, type ProjectDraft } from './draft';
import { planGeometry } from './geometry';
import { groupIssues } from './issue-groups';
import { draftIssues, idIndex } from './problems';
import { withoutUnderlay } from './underlay';

/**
 * Medidas do caminho quente do editor (M8), numa casa sintética do tamanho da leitura real do Ringgold (28
 * paredes, 42 aberturas): o que roda a cada edição no cliente. Limites folgados: o objetivo é pegar uma
 * regressão de ordem de grandeza, não medir ms exatos.
 */

/**
 * Casa de `cols × rows` cômodos: perímetro externo 2x6 + divisórias internas 2x4, com uma abertura por parede. As
 * divisórias horizontais ficam só nas colunas pares: duas encostando em T na mesma vertical pelos dois lados, no
 * mesmo ponto (cruzamento em +), fazem o motor recusar ("layoutPlates: cuts sobrepõe") — caso para a fábrica.
 */
export function syntheticHouse(cols: number, rows: number, room = 144): ProjectDraft {
  const base = draftFromText(EXAMPLES[1]!.text);
  if (!base.ok) throw new Error('fixture');
  const W = cols * room;
  const H = rows * room;
  const walls: DraftWall[] = [];
  const wall = (id: string, start: { x: number; y: number }, end: { x: number; y: number }, exterior: boolean): DraftWall => ({
    id,
    start,
    end,
    section: exterior ? '2x6' : '2x4',
    exterior,
    bearing: exterior,
    height: 97.125,
    floorsSupported: 0,
    // Janela fora do meio: no meio cairia o T de uma divisória (RO com T dentro é erro do motor).
    openings: [{ id: `${id}-O`, type: 'window', center: Math.hypot(end.x - start.x, end.y - start.y) / 4 + 30, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } }],
  });
  walls.push(wall('S', { x: 0, y: 0 }, { x: W, y: 0 }, true), wall('E', { x: W, y: 0 }, { x: W, y: H }, true), wall('N', { x: W, y: H }, { x: 0, y: H }, true), wall('Wst', { x: 0, y: H }, { x: 0, y: 0 }, true));
  for (let c = 1; c < cols; c += 1) walls.push(wall(`V${c}`, { x: c * room, y: 0 }, { x: c * room, y: H }, false));
  for (let r = 1; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 2) walls.push(wall(`H${r}-${c}`, { x: c * room, y: r * room }, { x: (c + 1) * room, y: r * room }, false));
  }
  return { ...base.draft, name: 'Synthetic', walls };
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
function time(fn: () => void, runs = 20): number {
  const t: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return median(t);
}

describe('caminho quente do editor (M8)', () => {
  const d = syntheticHouse(8, 5);
  it('casa sintética tem o porte da leitura real', () => {
    expect(d.walls.length).toBeGreaterThanOrEqual(27);
    const g = planGeometry(d);
    expect(g.houseError).toBeUndefined();
    expect(g.walls).toHaveLength(d.walls.length);
  });

  it('planGeometry, issues e serialização: cada um abaixo de 60 ms (mediana de 20)', () => {
    const geometry = time(() => planGeometry(d));
    const ids = idIndex(d);
    const issues = time(() => groupIssues(draftIssues(d, []), ids));
    const text = time(() => textFromDraft(withoutUnderlay(d)));
    // eslint-disable-next-line no-console
    console.log(`[perf] ${d.walls.length} walls · planGeometry ${geometry.toFixed(1)} ms · issues ${issues.toFixed(1)} ms · textFromDraft ${text.toFixed(1)} ms`);
    expect(geometry).toBeLessThan(60);
    expect(issues).toBeLessThan(60);
    expect(text).toBeLessThan(60);
  });
});
