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
import kitchenJson from '../fixtures/wall-144-kitchen.json';
import postJson from '../fixtures/wall-144-post.json';
import sheathedJson from '../fixtures/house-corner-L-sheathed.json';
import wallTypesJson from '../fixtures/house-walltypes.json';
import crossJson from '../fixtures/house-cross.json';
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
const kitchen = wallFixture(kitchenJson);
const post = wallFixture(postJson);
const sheathed = houseFixture(sheathedJson);
const [, sheathedW2] = panelizeHouse(sheathed.house, sheathed.config).panels;
const wallTypes = houseFixture(wallTypesJson);
const wallTypesPanels = panelizeHouse(wallTypes.house, wallTypes.config).panels;
const cross = houseFixture(crossJson);
const crossPanels = panelizeHouse(cross.house, cross.config).panels;

const STAMP = { project: 'Casa X', date: '2026-10-14', revision: 'A' };

/** Os desenhos dos snapshots (10 até a S38; 5 novos na S39), com o nome do arquivo. */
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
  { name: 'wall-144-kitchen', svg: () => panelSvg(panelizeWall(kitchen.wall, kitchen.config)) },
  { name: 'wall-144-post', svg: () => panelSvg(panelizeWall(post.wall, post.config)) },
  { name: 'house-corner-L-sheathed-W2', svg: () => panelSvg(sheathedW2!) },
  { name: 'house-walltypes-plan', svg: () => housePlanSvg(wallTypes.house, wallTypesPanels, { wallTypes: wallTypes.config.wallTypes! }) },
  { name: 'house-cross W1 + plan', svg: () => panelSvg(crossPanels[0]!) + housePlanSvg(cross.house, crossPanels) },
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
  /** Bloco "Wall content" (S39): título, rótulos dos grupos e frases. */
  content: {
    title: 'Wall content',
    labels: ['Wall', 'Openings', 'Joints', 'Blocking', 'Sheathing'],
    windowDoor: [
      'W-window-door',
      'level 1 · 2x6 exterior bearing',
      `panel 12'-0&quot; × 8'-1 1/8&quot; · wall x=0&quot; to 12'-0&quot;`,
      'win1 window · RO 36&quot; × 48&quot; · x=24&quot; to 60&quot; · sill 34 1/2&quot; · header 82 1/2&quot;',
      'door1 door · RO 38&quot; × 82 1/2&quot; · x=64 1/2&quot; to 102 1/2&quot; · header 82 1/2&quot;',
      'start: free end',
      'end: free end',
      'none',
    ],
    cornerW1: [
      'start: corner with W2 — this wall runs through (California corner)',
      'wall joints: 3× 3&quot; nails or screws @ 12&quot; OC ▲',
      '▲ engineer to verify (hypothesis P48)',
    ],
    cornerW2: ['start: corner with W1 — this wall butts against it'],
    cross: ['cross with W2 and W3 at 72&quot; — ladder ▲', '▲ engineer to verify (hypotheses P46, P48)'],
  },
  /** Planta (S39): selos, legenda e tipos. */
  planJoints: [
    '<title>L corner · W01 runs through, W04 butts</title>',
    '<title>T tee · W01 runs through, W05 butts</title>',
    '>exterior wall</text>',
    '>interior wall</text>',
    '>panel joint</text>',
    '>wall that runs through</text>',
  ],
  planTypes: ['>W01 · WT-1 = wall · wall type</text>', '>WT-1S — 2x6 exterior bearing wall, sheathed (W1)</text>'],
  crossTitle: '<title>+ cross · W1 runs through, W2 and W3 butt</title>',
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

describe('bloco "Wall content" e ligações na planta (S39)', () => {
  it('título, rótulos e frases do bloco', () => {
    const sheet = panelSvg(windowDoorPanel, STAMP);
    expect(sheet).toContain(`>${T.content.title}</text>`);
    for (const l of T.content.labels) expect(sheet).toContain(`>${l}</text>`);
    for (const t of T.content.windowDoor) expect(sheet).toContain(`>${t}</text>`);
    // Sem ligação nem hipótese, sem pregação e sem rodapé de verificação.
    expect(sheet).not.toContain('>Nailing</text>');
    expect(sheet).not.toContain('engineer to verify (hypothes');
    for (const t of T.content.cornerW1) expect(panelSvg(cornerW1!)).toContain(`>${t}</text>`);
    for (const t of T.content.cornerW2) expect(panelSvg(cornerW2!)).toContain(`>${t}</text>`);
    for (const t of T.content.cross) expect(panelSvg(crossPanels[0]!)).toContain(`>${t}</text>`);
  });

  it('planta: selos, quem atravessa, legenda e tipos', () => {
    const plan = housePlanSvg(house28x40.house, housePanels);
    for (const t of T.planJoints) expect(plan).toContain(t);
    const typed = housePlanSvg(wallTypes.house, wallTypesPanels, { wallTypes: wallTypes.config.wallTypes! });
    for (const t of T.planTypes) expect(typed).toContain(t);
    expect(housePlanSvg(cross.house, crossPanels)).toContain(T.crossTitle);
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
