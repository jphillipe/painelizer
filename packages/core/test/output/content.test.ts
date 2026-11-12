/**
 * Bloco "Wall content" da folha (S39, `output/sheet/content.ts`): o que vai nesta parede, por grupo, com ▲ nas linhas
 * de hipótese; colunas pela largura da folha; nada sobreposto ao desenho nem à lista. Snapshots novos dos fixtures da
 * Fase 8 (blocking, post, sheathing) — conferidos como PNG na S39.
 */

import { describe, expect, it } from 'vitest';
import type { Panel } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall } from '../../src/panelize/splitWall';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { housePlanSvg } from '../../src/output/planSvg';
import { panelSvg, sheetHeaderHeight, sheetStrings } from '../../src/output/svg';
import { contentBlock, contentHypotheses, wallContentGroups, wrapMeasured, type ContentGroup } from '../../src/output/sheet/content';
import { resolveNailing } from '../../src/rules/nailing';
import plainJson from '../fixtures/wall-144-plain.json';
import windowDoorJson from '../fixtures/wall-144-window-door.json';
import kitchenJson from '../fixtures/wall-144-kitchen.json';
import postJson from '../fixtures/wall-144-post.json';
import fireJson from '../fixtures/wall-144-fireblock.json';
import splitJson from '../fixtures/wall-480-split.json';
import nonBearingDoorJson from '../fixtures/wall-120-door-nonbearing.json';
import tallDoorJson from '../fixtures/wall-120-door-nonbearing-tall.json';
import cornerLJson from '../fixtures/house-corner-L.json';
import sheathedJson from '../fixtures/house-corner-L-sheathed.json';
import teeJson from '../fixtures/house-tee.json';
import crossJson from '../fixtures/house-cross.json';
import wallTypesJson from '../fixtures/house-walltypes.json';
import { houseFixture, wallFixture } from '../helpers/fixtures';

const S = sheetStrings();
const loose = (json: Parameters<typeof wallFixture>[0]): Panel => {
  const f = wallFixture(json);
  return panelizeWall(f.wall, f.config);
};
const house = (json: Parameters<typeof houseFixture>[0]): Panel[] => {
  const f = houseFixture(json);
  return panelizeHouse(f.house, f.config).panels;
};

const plain = loose(plainJson);
const windowDoor = loose(windowDoorJson);
const kitchen = loose(kitchenJson);
const post = loose(postJson);
const fire = loose(fireJson);
const [cornerW1, cornerW2] = house(cornerLJson);
const [sheathedW1, sheathedW2] = house(sheathedJson);
const [teeW1, teeW2] = house(teeJson);
const [crossW1, crossW2] = house(crossJson);
const split = (() => {
  const f = wallFixture(splitJson);
  return splitWall(f.wall, f.config);
})();

const NAILING = resolveNailing(undefined);
/** As linhas de cada grupo, como texto (▲ no fim das de hipótese). */
function lines(panel: Panel, description?: string): Record<string, string[]> {
  const groups = wallContentGroups(panel, { ...(description === undefined ? {} : { description }), nailing: NAILING }, S);
  return Object.fromEntries(groups.map((g) => [g.key, g.lines.map((l) => (l.hypothesis === undefined ? l.text : `${l.text} ▲`))]));
}

describe('wallContentGroups — o que vai nesta parede', () => {
  it('parede solta sem nada: parede, "none" e pontas livres; sem pregação nem posts', () => {
    expect(lines(plain)).toEqual({
      wall: ['W-plain', 'level 1 · 2x6 exterior bearing', `panel 12'-0" × 8'-1 1/8" · wall x=0" to 12'-0"`],
      openings: ['none'],
      joints: ['start: free end', 'end: free end'],
      blocking: ['none'],
      sheathing: ['none'],
    });
  });

  it('aberturas: id, tipo, RO, x, peitoril (janela) e base do header', () => {
    expect(lines(windowDoor)['openings']).toEqual([
      'win1 window · RO 36" × 48" · x=24" to 60" · sill 34 1/2" · header 82 1/2"',
      'door1 door · RO 38" × 82 1/2" · x=64 1/2" to 102 1/2" · header 82 1/2"',
    ]);
  });

  it('canto: quem atravessa (com a montagem) e quem encosta; pregação das ligações (P48)', () => {
    expect(lines(cornerW1!)['joints']).toEqual(['start: corner with W2 — this wall runs through (California corner)', 'end: free end']);
    expect(lines(cornerW2!)['joints']).toEqual(['start: corner with W1 — this wall butts against it', 'end: free end']);
    expect(lines(cornerW1!)['nailing']).toEqual(['wall joints: 3× 3" nails or screws @ 12" OC ▲']);
  });

  it('chapa: avanço na ponta da que encosta, resumo, linha de piso e pregação da chapa (P47, P48)', () => {
    const w2 = lines(sheathedW2!);
    expect(w2['joints']![0]).toBe('start: corner with W1 — this wall butts against it, sheathing overhangs 5 1/2" ▲');
    expect(w2['sheathing']).toEqual([
      '7/16" exterior face · 48" x 108" sheets',
      '3 pieces (1 cut) · 92.06 sq ft · 128.9 lb',
      'corner overhang: start 5 1/2" ▲',
      'floor line: 10 7/8" below the bottom plate ▲',
    ]);
    expect(w2['nailing']).toEqual(['wall joints: 3× 3" nails or screws @ 12" OC ▲', 'sheathing: 8d @ 6" edges, 12" field ▲']);
    // A que atravessa não avança.
    expect(lines(sheathedW1!)['joints']![0]).toBe('start: corner with W2 — this wall runs through (California corner)');
  });

  it('T ao longo do painel (ladder) e a que encosta; + com as duas paredes (P46)', () => {
    expect(lines(teeW1!)['joints']).toEqual(['start: free end', 'tee with W2 at 72" — ladder', 'end: free end']);
    expect(lines(teeW2!)['joints']![0]).toBe('start: tee into W1 — W1 runs through');
    expect(lines(crossW1!)['joints']![1]).toBe('cross with W2 and W3 at 72" — ladder ▲');
    expect(lines(crossW2!)['joints']![1]).toBe('end: cross into W1 — W1 runs through ▲');
  });

  it('junta de painéis da mesma parede: lap da double top (P23) com ▲ (P49)', () => {
    const [a, b] = split;
    expect(lines(a!)['joints']![1]).toMatch(/^end: panel joint with 1-W-480-P2 — double top laps \d+" onto it ▲$/);
    expect(lines(b!)['joints']![0]).toMatch(/^start: panel joint with 1-W-480-P1 — double top held back \d+" ▲$/);
    expect(lines(b!)['wall']![2]).toContain(`wall x=${b!.wallOffset === 240 ? `20'-0"` : ''}`);
  });

  it('blocking: fileiras por altura (P44) e fogo (P50)', () => {
    expect(lines(kitchen)['blocking']).toEqual([
      'B · Base cabinets / countertop (center 36") ▲',
      'B · Upper cabinets, bottom (center 54") ▲',
      'B · Upper cabinets, top (center 84") ▲',
    ]);
    expect(lines(fire)['blocking']!.every((l) => l.startsWith('B · Fire blocking (center ') && l.endsWith(' ▲'))).toBe(true);
  });

  it('posts com os conectores do projeto (P45)', () => {
    expect(lines(post)['posts']).toEqual([
      'P-01 · 4x6 at x=46 1/2" — base: HDU2 hold-down · top: LUS28 — LVL 1 3/4 x 11 7/8 above ▲',
      'P-02 · 6x6 at x=94" — base: PB66 post base · top: HUS ▲',
    ]);
  });

  it('tipo de parede com a descrição do catálogo; pregação do projeto', () => {
    const f = houseFixture(wallTypesJson);
    const [w1] = panelizeHouse(f.house, f.config).panels;
    expect(lines(w1!, f.config.wallTypes!['WT-1S']!.description)['wall']![0]).toBe('W1 · type WT-1S — 2x6 exterior bearing wall, sheathed');
    const groups = wallContentGroups(cornerW1!, { nailing: resolveNailing({ wallJoint: { count: 2, fastener: '16d nails', spacing: 8 } }) }, S);
    expect(groups.find((g) => g.key === 'nailing')!.lines[0]!.text).toBe('wall joints: 2× 16d nails @ 8" OC');
  });

  it('peça deitada com cripples (S44): a linha da abertura leva ▲ (P55); a peça dentro dos 24" não', () => {
    expect(lines(loose(tallDoorJson))['openings']).toEqual(['door1 door · RO 38" × 81 1/2" · x=40" to 78" · header 81 1/2" ▲']);
    expect(lines(loose(nonBearingDoorJson))['openings']).toEqual(['door1 door · RO 38" × 82 1/2" · x=40" to 78" · header 82 1/2"']);
    const groups = wallContentGroups(loose(tallDoorJson), { nailing: NAILING }, S);
    expect(contentHypotheses(groups)).toContain('P55');
  });

  it('hipóteses do rodapé: sem repetir, em ordem numérica', () => {
    const groups: ContentGroup[] = [
      { key: 'joints', lines: [{ text: 'a', hypothesis: 'P49' }, { text: 'b' }] },
      { key: 'blocking', lines: [{ text: 'c', hypothesis: 'P44' }, { text: 'd', hypothesis: 'P49' }] },
    ];
    expect(contentHypotheses(groups)).toEqual(['P44', 'P49']);
    expect(S.content.footer(['P44', 'P49'])).toBe('▲ engineer to verify (hypotheses P44, P49)');
    expect(S.content.footer(['P48'])).toBe('▲ engineer to verify (hypothesis P48)');
  });
});

describe('wrapMeasured', () => {
  it('não quebra dentro de uma medida nem antes do ▲', () => {
    const text = 'win1 window · RO 36" × 48" · x=48" to 84" · sill 34 1/2" · header 82 1/2" ▲';
    for (let max = 20; max < 80; max++) {
      const out = wrapMeasured(text, max);
      expect(out.join(' ')).toBe(text);
      for (const line of out) {
        expect(line).not.toMatch(/^(1\/2"|▲)/);
        expect(line).not.toMatch(/ (34|82)$/);
      }
    }
  });
});

describe('contentBlock — layout', () => {
  const groups = wallContentGroups(windowDoor, { nailing: NAILING }, S);

  it('colunas pela largura: 1 na folha estreita, 2 na de 12\', 3 na de 20\'', () => {
    const columnsOf = (width: number): number =>
      new Set(contentBlock(groups, 0, 0, width, S).svg.filter((l) => l.includes('class="content-label"')).map((l) => /x="([\d.]+)"/.exec(l)![1])).size;
    expect(columnsOf(560)).toBe(1);
    expect(columnsOf(942)).toBe(2);
    expect(columnsOf(1326)).toBe(3);
  });

  it('mais colunas, bloco mais baixo; altura = o que a folha desce', () => {
    const h1 = contentBlock(groups, 0, 0, 560, S).height;
    const h2 = contentBlock(groups, 0, 0, 942, S).height;
    expect(h2).toBeLessThan(h1);
    expect(sheetHeaderHeight(windowDoor)).toBe(54 + h2);
  });
});

/** Maior y de texto do bloco e menor y de tudo o que vem depois dele (desenho, cotas, lista). */
function blockBottomAndRestTop(svg: string): { bottom: number; rest: number } {
  const lines = svg.split('\n');
  const start = lines.findIndex((l) => l.startsWith('<g class="wall-content"'));
  const end = lines.indexOf('</g>', start);
  const ys = (l: string): number[] => [...l.matchAll(/ (?:y|y1|y2)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
  const bottom = Math.max(...lines.slice(start, end).flatMap(ys));
  // Fora o padrão da hachura (`<defs>`), que mede no espaço dele.
  const after = lines.slice(end + 1).filter((l) => !l.startsWith('<defs')).flatMap((l) => {
    const size = /font-size="([\d.]+)"/.exec(l);
    // Texto: o topo das letras fica ~ font-size acima da linha de base.
    return ys(l).map((y) => (l.startsWith('<text') && size !== null ? y - Number(size[1]) : y));
  });
  return { bottom, rest: Math.min(...after) };
}

describe('folha com o bloco: nada sobreposto', () => {
  const cases: [string, Panel][] = [
    ['wall-144-plain', plain],
    ['wall-144-window-door', windowDoor],
    ['wall-144-kitchen', kitchen],
    ['wall-144-post', post],
    ['house-corner-L W1', cornerW1!],
    ['house-corner-L W2 (avanço da double top)', cornerW2!],
    ['house-corner-L-sheathed W2 (avanço da chapa)', sheathedW2!],
    ['wall-480-split P1', split[0]!],
  ];
  it.each(cases)('%s', (_, panel) => {
    const { bottom, rest } = blockBottomAndRestTop(panelSvg(panel, { project: 'P' }));
    // A linha de base mais baixa do bloco fica acima do topo de tudo o que vem depois (folga para as descendentes).
    expect(bottom + 3).toBeLessThan(rest);
  });
});

describe('snapshots dos fixtures da Fase 8 (S39)', () => {
  it('wall-144-kitchen: fileiras de blocking no bloco e na coluna', async () => {
    await expect(panelSvg(kitchen, { project: 'wall-144-kitchen' })).toMatchFileSnapshot('../__snapshots__/wall-144-kitchen.svg');
  });

  it('wall-144-post: posts e conectores', async () => {
    await expect(panelSvg(post, { project: 'wall-144-post' })).toMatchFileSnapshot('../__snapshots__/wall-144-post.svg');
  });

  it('house-corner-L-sheathed: chapa, avanço no canto e linha de piso', async () => {
    await expect(panelSvg(sheathedW1!, { project: 'house-corner-L-sheathed' })).toMatchFileSnapshot(
      '../__snapshots__/house-corner-L-sheathed-W1.svg',
    );
    await expect(panelSvg(sheathedW2!, { project: 'house-corner-L-sheathed' })).toMatchFileSnapshot(
      '../__snapshots__/house-corner-L-sheathed-W2.svg',
    );
  });

  it('house-walltypes: planta com a legenda dos tipos', async () => {
    const f = houseFixture(wallTypesJson);
    const panels = panelizeHouse(f.house, f.config).panels;
    await expect(housePlanSvg(f.house, panels, { title: 'house-walltypes', wallTypes: f.config.wallTypes! })).toMatchFileSnapshot(
      '../__snapshots__/house-walltypes-plan.svg',
    );
  });
});
