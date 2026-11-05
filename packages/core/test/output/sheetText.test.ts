/**
 * Textos da folha e da planta (S34; P51 resolvida: sempre em inglês). As asserções de estrutura (posições,
 * contagens, cores) moram em `svg.test.ts` e `planSvg.test.ts`, junto com os snapshots (`__snapshots__/`); aqui
 * ficam só as frases, numa tabela, e a garantia de que nenhuma palavra em português chega à folha ou à planta.
 */

import { describe, expect, it } from 'vitest';
import type { Panel } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { housePlanSvg } from '../../src/output/planSvg';
import { panelSvg, viewNote } from '../../src/output/svg';
import { WARNING_CODES, warning, warningMessage } from '../../src/messages';
import plainJson from '../fixtures/wall-144-plain.json';
import windowJson from '../fixtures/wall-144-window.json';
import doorJson from '../fixtures/wall-120-door.json';
import windowDoorJson from '../fixtures/wall-144-window-door.json';
import ircJson from '../fixtures/wall-144-window-irc.json';
import nonBearingDoorJson from '../fixtures/wall-120-door-nonbearing.json';
import cornerLJson from '../fixtures/house-corner-L.json';
import house28x40Json from '../fixtures/house-28x40.json';
import { houseFixture, wallFixture } from '../helpers/fixtures';

const plain = wallFixture(plainJson);
const window = wallFixture(windowJson);
const door = wallFixture(doorJson);
const windowDoor = wallFixture(windowDoorJson);
const irc = wallFixture(ircJson);
const nonBearingDoor = wallFixture(nonBearingDoorJson);
const cornerL = houseFixture(cornerLJson);
const house28x40 = houseFixture(house28x40Json);

const plainPanel = panelizeWall(plain.wall, plain.config);
const windowDoorPanel = panelizeWall(windowDoor.wall, windowDoor.config);
const doorPanel = panelizeWall(door.wall, door.config);
const nonBearingDoorPanel = panelizeWall(nonBearingDoor.wall, nonBearingDoor.config);
const [cornerW1, cornerW2] = panelizeHouse(cornerL.house, cornerL.config).panels;
const housePanels = panelizeHouse(house28x40.house, house28x40.config).panels;

const STAMP = { project: 'Casa X', date: '2026-10-14', revision: 'A' };

/** Os 10 desenhos dos snapshots, com o nome do arquivo. */
const SHEETS: readonly { name: string; svg: () => string }[] = [
  { name: 'wall-144-plain', svg: () => panelSvg(plainPanel) },
  { name: 'wall-144-window', svg: () => panelSvg(panelizeWall(window.wall, window.config)) },
  {
    name: 'wall-144-window-header-82.5',
    svg: () => panelSvg(panelizeWall(window.wall, { ...window.config, headerHeight: 82.5 })),
  },
  { name: 'wall-144-window-irc', svg: () => panelSvg(panelizeWall(irc.wall, irc.config)) },
  { name: 'wall-120-door', svg: () => panelSvg(doorPanel) },
  { name: 'wall-120-door-nonbearing', svg: () => panelSvg(nonBearingDoorPanel) },
  { name: 'wall-144-window-door', svg: () => panelSvg(windowDoorPanel) },
  { name: 'house-corner-L-W1', svg: () => panelSvg(cornerW1!, { project: 'house-corner-L' }) },
  { name: 'house-corner-L-W2', svg: () => panelSvg(cornerW2!, { project: 'house-corner-L' }) },
  { name: 'house-28x40-plan', svg: () => housePlanSvg(house28x40.house, housePanels) },
];

/** Frases esperadas. */
const T = {
  info: `wall W-window-door · level 1 · 2x6 exterior bearing · 12'-0&quot; × 8'-1 1/8&quot; · 26 pieces · 312.5 lb`,
  stamp: 'date 2026-10-14 · rev. A',
  view: {
    exterior: /^Viewed from outside — exterior face toward the viewer/,
    interiorFacing: /^Viewed from inside — exterior face on the back/,
    interior: 'Interior wall — start of wall (x=0) on the left',
    loose: 'Start of wall (x=0) on the left',
  },
  face: {
    exterior: 'exterior face (viewed from outside)',
    interiorFacing: 'exterior face on the back (viewed from inside)',
    interior: 'interior wall',
  },
  ro: [
    'RO 36&quot;',
    'sill height 34 1/2&quot;',
    'RO 48&quot;',
    'header 82 1/2&quot;',
    'RO 38&quot;',
    'RO 82 1/2&quot; = header 82 1/2&quot;',
    'win1 · window',
    'door1 · door',
  ],
  pieces: [
    'Pieces',
    'qty',
    'piece',
    'size',
    'ft-in',
    'in',
    'pieces to cut',
    'Estimated weight: 312.5 lb',
    'lumber only, no sheathing (hypothesis P8)',
    'Field cuts',
    'bottom plate 38&quot; from x=64 1/2&quot; to 102 1/2&quot; (door1)',
  ],
  fieldCut: 'field cut 38&quot;',
  overhang: 'overhang 5 1/2&quot;',
  legend: 'K king · J jack · C cripple · H header · S sill · B block · red hatch = field cut',
  plan: [
    '>Panel plan</text>',
    `>5 walls · 12 panels · 40'-5 1/2&quot; × 28'-5 1/2&quot; (exterior faces)</text>`,
    `<title>W01 2x6 · plate 40'-5 1/2&quot; · 3 panels</title>`,
    `<title>W05 2x4 · plate 27'-6 1/2&quot; · 2 panels</title>`,
    '<title>P1 door · RO 38&quot; · wall W01</title>',
    '<title>joint 1-W01-P1 | 1-W01-P2</title>',
    '<title>north: 0° from plan +y, clockwise</title>',
  ],
  cornerPlan: `>2 walls · 2 panels · 12'-2 3/4&quot; × 10'-2 3/4&quot; (exterior faces)</text>`,
};

const PT_WORDS =
  /parede|pavimento|peças|janela|porta|avanço|peitoril|cortar|Planta|painel|painéis|bloco|Vista|hipótese|externa|interna|portante|junta|norte|madeira|qtd|seção/;
const ACCENTS = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;

describe('nenhuma palavra em português na folha ou na planta', () => {
  it.each(SHEETS.map((s) => [s.name, s] as const))('%s', (name, s) => {
    const text = [...s.svg().matchAll(/>([^<]+)</g)].map((m) => m[1]!).join('\n');
    expect(text, name).not.toMatch(PT_WORDS);
    expect(text, name).not.toMatch(ACCENTS);
  });
});

describe('textos da folha', () => {
  const sheet = panelSvg(windowDoorPanel, STAMP);

  it('cabeçalho: dados do painel e carimbo', () => {
    expect(sheet).toContain(`>${T.info}</text>`);
    expect(sheet).toContain(`>${T.stamp}</text>`);
  });

  it('linha da vista (P24) e nota da face', () => {
    expect(viewNote({ exterior: true })).toMatch(T.view.exterior);
    expect(viewNote({ exterior: true, facing: 'exterior' })).toMatch(T.view.exterior);
    expect(viewNote({ exterior: true, facing: 'interior' })).toMatch(T.view.interiorFacing);
    expect(viewNote({ exterior: false })).toBe(T.view.interior);
    expect(viewNote({})).toBe(T.view.loose);
    expect(sheet).toContain(`>${T.face.exterior}</text>`);
    expect(panelSvg({ ...windowDoorPanel, facing: 'interior' })).toContain(`>${T.face.interiorFacing}</text>`);
    expect(panelSvg(nonBearingDoorPanel)).toContain(`>${T.face.interior}</text>`);
    expect(panelSvg(cornerW1!)).toContain(`>${T.face.exterior}</text>`);
    expect(panelSvg(cornerW2!)).toContain(`>${T.face.interiorFacing}</text>`);
  });

  it('cotas de RO e id/tipo da abertura', () => {
    for (const t of T.ro) expect(sheet).toContain(`>${t}</text>`);
  });

  it('lista de peças: cabeçalhos, total, peso e cortes na obra', () => {
    for (const t of T.pieces) expect(sheet).toContain(`>${t}</text>`);
    expect(sheet).toContain('>king (K)</text>');
    expect(panelSvg({ ...windowDoorPanel, weightLb: 300 })).toContain(
      `>${T.pieces[7]!.replace('312.5', '300')}</text>`,
    );
  });

  it('corte na obra sobre a peça', () => {
    expect(panelSvg(doorPanel)).toContain(`>${T.fieldCut}</text>`);
  });

  it('avanço da double top plate', () => {
    expect(panelSvg(cornerW2!)).toContain(`>${T.overhang}</text>`);
  });

  it('legenda', () => {
    expect(sheet).toContain(T.legend);
  });

  it('planta', () => {
    const plan = housePlanSvg(house28x40.house, housePanels);
    for (const t of T.plan) expect(plan).toContain(t);
    expect(housePlanSvg(cornerL.house, [cornerW1!, cornerW2!])).toContain(T.cornerPlan);
    // Título dado pelo projeto vale como veio.
    expect(housePlanSvg(house28x40.house, housePanels, { title: 'Casa 28x40' })).toContain('>Casa 28x40</text>');
  });
});

describe('avisos no rodapé', () => {
  const real = warning(
    'STUD_LENGTH_MISMATCH',
    { wallId: 'W-plain' },
    { height: 100, plateThickness: 1.5, studLength: 95.5, precuts: [92.625, 104.625] },
  );

  it('a frase do aviso, montada de código + parâmetros e escapada', () => {
    expect(real.message).toBe(warningMessage(real.code, real.params!, { wallId: 'W-plain' }));
    expect(panelSvg({ ...plainPanel, warnings: [real] })).toContain(
      '! STUD_LENGTH_MISMATCH: Wall W-plain: wall height 100&quot; minus 3 plates of 1.5&quot; needs a 95.5&quot; stud, ' +
        'which is not one of the precut lengths (92.625&quot;, 104.625&quot;)</text>',
    );
    // Com parâmetros, a frase guardada não importa: sai de código + parâmetros.
    expect(panelSvg({ ...plainPanel, warnings: [{ ...real, message: 'texto antigo' }] })).not.toContain('texto antigo');
    // Sem parâmetros (aviso montado à mão): o `message` como veio, escapado.
    const odd: Panel = { ...plainPanel, warnings: [{ code: 'STUD_LENGTH_MISMATCH', message: 'stud <92 5/8"> & etc' }] };
    expect(panelSvg(odd)).toContain('! STUD_LENGTH_MISMATCH: stud &lt;92 5/8&quot;&gt; &amp; etc</text>');
  });

  it('todo código de aviso tem frase em inglês, mesmo sem parâmetros', () => {
    for (const c of WARNING_CODES) {
      const text = warningMessage(c, {}, { wallId: 'W1', openingId: 'J1' });
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(ACCENTS);
    }
  });
});
