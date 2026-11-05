/**
 * Textos da folha e da planta por idioma (S34). As asserções de estrutura (posições, contagens, cores) moram em
 * `svg.test.ts` e `planSvg.test.ts` e valem para os dois idiomas; aqui ficam só as frases, uma tabela por
 * `locale`, a garantia de que o desenho não muda com o idioma e os snapshots em inglês (`__snapshots__/en/`).
 * Os snapshots em português continuam onde estavam, sem um byte mudado.
 */

import { describe, expect, it } from 'vitest';
import type { Panel } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { housePlanSvg } from '../../src/output/planSvg';
import { DEFAULT_SHEET_LOCALE, SHEET_LOCALES, panelSvg, viewNote, type SheetLocale } from '../../src/output/svg';
import { WARNING_CODES, warning, warningMessageEn, warningMessagePt } from '../../src/messages';
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

/** Os mesmos 10 desenhos dos snapshots em português, com o nome do arquivo. */
const SHEETS: readonly { name: string; svg: (locale: SheetLocale) => string }[] = [
  { name: 'wall-144-plain', svg: (locale) => panelSvg(plainPanel, { locale }) },
  { name: 'wall-144-window', svg: (locale) => panelSvg(panelizeWall(window.wall, window.config), { locale }) },
  {
    name: 'wall-144-window-header-82.5',
    svg: (locale) => panelSvg(panelizeWall(window.wall, { ...window.config, headerHeight: 82.5 }), { locale }),
  },
  { name: 'wall-144-window-irc', svg: (locale) => panelSvg(panelizeWall(irc.wall, irc.config), { locale }) },
  { name: 'wall-120-door', svg: (locale) => panelSvg(doorPanel, { locale }) },
  { name: 'wall-120-door-nonbearing', svg: (locale) => panelSvg(nonBearingDoorPanel, { locale }) },
  { name: 'wall-144-window-door', svg: (locale) => panelSvg(windowDoorPanel, { locale }) },
  { name: 'house-corner-L-W1', svg: (locale) => panelSvg(cornerW1!, { project: 'house-corner-L', locale }) },
  { name: 'house-corner-L-W2', svg: (locale) => panelSvg(cornerW2!, { project: 'house-corner-L', locale }) },
  { name: 'house-28x40-plan', svg: (locale) => housePlanSvg(house28x40.house, housePanels, { locale }) },
];

/** Frases esperadas por idioma. Medidas e ids são os mesmos nos dois. */
const TEXT: Record<
  SheetLocale,
  {
    info: string;
    stamp: string;
    view: { exterior: RegExp; interiorFacing: RegExp; interior: string; loose: string };
    face: { exterior: string; interiorFacing: string; interior: string };
    ro: string[];
    pieces: string[];
    fieldCut: string;
    overhang: string;
    legend: string;
    plan: string[];
    cornerPlan: string;
  }
> = {
  pt: {
    info: `parede W-window-door · pavimento 1 · 2x6 externa portante · 12'-0&quot; × 8'-1 1/8&quot; · 26 peças · 312.5 lb`,
    stamp: 'data 2026-10-14 · rev. A',
    view: {
      exterior: /^Vista de fora — face externa voltada para o observador/,
      interiorFacing: /^Vista de dentro — face externa no verso/,
      interior: 'Parede interna — início da parede (x=0) à esquerda',
      loose: 'Início da parede (x=0) à esquerda',
    },
    face: {
      exterior: 'face externa (vista de fora)',
      interiorFacing: 'face externa no verso (vista de dentro)',
      interior: 'parede interna',
    },
    ro: [
      'RO 36&quot;',
      'peitoril 34 1/2&quot;',
      'RO 48&quot;',
      'header 82 1/2&quot;',
      'RO 38&quot;',
      'RO 82 1/2&quot; = header 82 1/2&quot;',
      'win1 · janela',
      'door1 · porta',
    ],
    pieces: [
      'Peças',
      'qtd',
      'peça',
      'seção',
      'pés-pol',
      'pol',
      'peças a cortar',
      'Peso estimado: 312.5 lb',
      'madeira sem sheathing (hipótese P8)',
      'Cortar na obra',
      'bottom plate 38&quot; de x=64 1/2&quot; a 102 1/2&quot; (door1)',
    ],
    fieldCut: 'cortar na obra 38&quot;',
    overhang: 'avanço 5 1/2&quot;',
    legend: 'K king · J jack · C cripple · H header · S sill · B bloco · hachura vermelha = cortar na obra',
    plan: [
      '>Planta de painéis</text>',
      `>5 paredes · 12 painéis · 40'-5 1/2&quot; × 28'-5 1/2&quot; (faces externas)</text>`,
      `<title>W01 2x6 · plate 40'-5 1/2&quot; · 3 painéis</title>`,
      `<title>W05 2x4 · plate 27'-6 1/2&quot; · 2 painéis</title>`,
      '<title>P1 porta · RO 38&quot; · parede W01</title>',
      '<title>junta 1-W01-P1 | 1-W01-P2</title>',
      '<title>norte: 0° do +y da planta, sentido horário</title>',
    ],
    cornerPlan: `>2 paredes · 2 painéis · 12'-2 3/4&quot; × 10'-2 3/4&quot; (faces externas)</text>`,
  },
  en: {
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
  },
};

/** Tira o texto de `<text>` e `<title>`: sobra o desenho (tags, atributos, posições). */
function drawingOnly(svg: string): string {
  return svg.replace(/>[^<]*</g, '><');
}

describe('idioma padrão (hipótese P51)', () => {
  it('sem locale = português, byte a byte igual a locale "pt"', () => {
    expect(DEFAULT_SHEET_LOCALE).toBe('pt');
    expect(SHEET_LOCALES).toEqual(['pt', 'en']);
    for (const s of SHEETS) expect(s.svg('pt')).toBe(s.svg(DEFAULT_SHEET_LOCALE));
    expect(panelSvg(plainPanel)).toBe(panelSvg(plainPanel, { locale: 'pt' }));
    expect(housePlanSvg(house28x40.house, housePanels)).toBe(
      housePlanSvg(house28x40.house, housePanels, { locale: 'pt' }),
    );
  });

  it('locale desconhecido (JavaScript sem tipos) → RangeError', () => {
    expect(() => panelSvg(plainPanel, { locale: 'es' as SheetLocale })).toThrow(RangeError);
    expect(() => housePlanSvg(house28x40.house, housePanels, { locale: 'fr' as SheetLocale })).toThrow(/locale/);
  });
});

describe('o idioma muda só as frases', () => {
  it.each(SHEETS.map((s) => [s.name, s] as const))('%s: pt e en com o mesmo desenho', (_name, s) => {
    const pt = s.svg('pt');
    const en = s.svg('en');
    expect(en).not.toBe(pt);
    expect(drawingOnly(en)).toBe(drawingOnly(pt));
  });

  it('em inglês não sobra palavra em português', () => {
    const PT_WORDS =
      /parede|pavimento|peças|janela|porta|avanço|peitoril|cortar|Planta|painel|painéis|bloco|Vista|hipótese|externa|interna|portante|junta|norte|madeira|qtd|seção/;
    for (const s of SHEETS) {
      const text = [...s.svg('en').matchAll(/>([^<]+)</g)].map((m) => m[1]!).join('\n');
      expect(text, s.name).not.toMatch(PT_WORDS);
      expect(text, s.name).not.toMatch(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/);
    }
  });
});

describe.each(SHEET_LOCALES)('textos da folha — %s', (locale) => {
  const T = TEXT[locale];
  const sheet = panelSvg(windowDoorPanel, { ...STAMP, locale });

  it('cabeçalho: dados do painel e carimbo', () => {
    expect(sheet).toContain(`>${T.info}</text>`);
    expect(sheet).toContain(`>${T.stamp}</text>`);
  });

  it('linha da vista (P24) e nota da face', () => {
    expect(viewNote({ exterior: true }, locale)).toMatch(T.view.exterior);
    expect(viewNote({ exterior: true, facing: 'exterior' }, locale)).toMatch(T.view.exterior);
    expect(viewNote({ exterior: true, facing: 'interior' }, locale)).toMatch(T.view.interiorFacing);
    expect(viewNote({ exterior: false }, locale)).toBe(T.view.interior);
    expect(viewNote({}, locale)).toBe(T.view.loose);
    expect(sheet).toContain(`>${T.face.exterior}</text>`);
    expect(panelSvg({ ...windowDoorPanel, facing: 'interior' }, { locale })).toContain(
      `>${T.face.interiorFacing}</text>`,
    );
    expect(panelSvg(nonBearingDoorPanel, { locale })).toContain(`>${T.face.interior}</text>`);
    expect(panelSvg(cornerW1!, { locale })).toContain(`>${T.face.exterior}</text>`);
    expect(panelSvg(cornerW2!, { locale })).toContain(`>${T.face.interiorFacing}</text>`);
  });

  it('cotas de RO e id/tipo da abertura', () => {
    for (const t of T.ro) expect(sheet).toContain(`>${t}</text>`);
  });

  it('lista de peças: cabeçalhos, total, peso e cortes na obra', () => {
    for (const t of T.pieces) expect(sheet).toContain(`>${t}</text>`);
    expect(sheet).toContain('>king (K)</text>');
    expect(panelSvg({ ...windowDoorPanel, weightLb: 300 }, { locale })).toContain(
      `>${T.pieces[7]!.replace('312.5', '300')}</text>`,
    );
  });

  it('corte na obra sobre a peça', () => {
    expect(panelSvg(doorPanel, { locale })).toContain(`>${T.fieldCut}</text>`);
  });

  it('avanço da double top plate', () => {
    expect(panelSvg(cornerW2!, { locale })).toContain(`>${T.overhang}</text>`);
  });

  it('legenda', () => {
    expect(sheet).toContain(T.legend);
  });

  it('planta', () => {
    const plan = housePlanSvg(house28x40.house, housePanels, { locale });
    for (const t of T.plan) expect(plan).toContain(t);
    expect(housePlanSvg(cornerL.house, [cornerW1!, cornerW2!], { locale })).toContain(T.cornerPlan);
    // Título dado pelo projeto vale nos dois idiomas.
    expect(housePlanSvg(house28x40.house, housePanels, { locale, title: 'Casa 28x40' })).toContain(
      '>Casa 28x40</text>',
    );
  });
});

describe('avisos no rodapé', () => {
  const real = warning(
    'STUD_LENGTH_MISMATCH',
    { wallId: 'W-plain' },
    { height: 100, plateThickness: 1.5, studLength: 95.5, precuts: [92.625, 104.625] },
  );

  it('pt: a frase do aviso, escapada', () => {
    const odd: Panel = { ...plainPanel, warnings: [{ code: 'STUD_LENGTH_MISMATCH', message: 'stud <92 5/8"> & etc' }] };
    expect(panelSvg(odd)).toContain('! STUD_LENGTH_MISMATCH: stud &lt;92 5/8&quot;&gt; &amp; etc</text>');
    expect(panelSvg({ ...plainPanel, warnings: [real] })).toContain(
      `! STUD_LENGTH_MISMATCH: ${warningMessagePt(real.code, real.params!, { wallId: 'W-plain' }).replace(/"/g, '&quot;')}</text>`,
    );
  });

  it('en: montada de código + parâmetros, sem ler o português', () => {
    const out = panelSvg({ ...plainPanel, warnings: [real] }, { locale: 'en' });
    expect(out).toContain(
      '! STUD_LENGTH_MISMATCH: Wall W-plain: wall height 100&quot; minus 3 plates of 1.5&quot; needs a 95.5&quot; stud, ' +
        'which is not one of the precut lengths (92.625&quot;, 104.625&quot;)</text>',
    );
    expect(drawingOnly(out)).toBe(drawingOnly(panelSvg({ ...plainPanel, warnings: [real] })));
  });

  it('todo código de aviso tem frase em inglês, sem "undefined" quando os parâmetros vêm completos de uma abertura', () => {
    for (const c of WARNING_CODES) {
      const text = warningMessageEn(c, {}, { wallId: 'W1', openingId: 'J1' });
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/);
    }
  });
});

describe('snapshots em inglês (test/__snapshots__/en/)', () => {
  it.each(SHEETS.map((s) => [s.name, s] as const))('%s', async (name, s) => {
    await expect(s.svg('en')).toMatchFileSnapshot(`../__snapshots__/en/${name}.svg`);
  });
});
