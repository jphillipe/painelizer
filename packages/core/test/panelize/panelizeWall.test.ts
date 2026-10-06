import { describe, expect, it } from 'vitest';
import type { Config, Member, Opening, Panel, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { expectSameMembers } from '../helpers/members';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';
import low from '../fixtures/wall-144-window-82.5.json';
import door from '../fixtures/wall-120-door.json';
import windowDoor from '../fixtures/wall-144-window-door.json';
import irc from '../fixtures/wall-144-window-irc.json';
import nonBearingDoor from '../fixtures/wall-120-door-nonbearing.json';
import { loadHeaderTables } from '../../src/rules/headers';
import { fakeHeaderJson } from '../helpers/fakeHeaderTables';

/** Header do projeto usado nas aberturas montadas à mão (o mesmo dos fixtures). */
const H = { section: '2x10', plies: 2 } as const;

const wall = plain.wall as Wall;
const config = plain.config as Config;

describe('panelizeWall — parede sem abertura', () => {
  it('fixture wall-144-plain passa exatamente (members por role, section, length, x, y)', () => {
    const panel = panelizeWall(wall, config);
    expectSameMembers(panel.members, plain.expected.members as Member[]);
    expect(panel.warnings).toEqual(plain.expected.warnings);
  });

  it('orientação: plates horizontais, studs verticais', () => {
    const panel = panelizeWall(wall, config);
    for (const m of panel.members) {
      expect(m.orientation).toBe(m.role === 'stud' ? 'vertical' : 'horizontal');
    }
  });

  it('metadados do painel vêm da parede', () => {
    const panel = panelizeWall(wall, config);
    expect(panel).toMatchObject({
      id: 'W-plain',
      wallId: 'W-plain',
      length: 144,
      height: 97.125,
      section: '2x6',
    });
    expect(panel.members).toHaveLength(13);
  });

  it('24" OC reduz os studs', () => {
    const panel = panelizeWall(wall, { ...config, studSpacing: 24 });
    const xs = panel.members.filter((m) => m.role === 'stud').map((m) => m.x);
    expect(xs).toEqual([0, 24, 48, 72, 96, 120, 142.5]);
  });

  it("parede de 9' (109.125): stud 104.625 é o segundo pré-corte da lista — sem aviso (P7)", () => {
    const panel = panelizeWall({ ...wall, height: 109.125 }, config);
    const studs = panel.members.filter((m) => m.role === 'stud');
    expect(studs).toHaveLength(10);
    for (const s of studs) expect(s.length).toBe(104.625);
    expect(panel.warnings).toEqual([]);
  });

  it('altura fora dos pré-cortes: stud segue a altura e sai aviso STUD_LENGTH_MISMATCH', () => {
    const panel = panelizeWall({ ...wall, height: 103.125 }, config);
    const studs = panel.members.filter((m) => m.role === 'stud');
    for (const s of studs) expect(s.length).toBe(98.625);
    expect(panel.warnings.map((w) => w.code)).toEqual(['STUD_LENGTH_MISMATCH']);
    expect(panel.warnings[0]!.message).toMatch(/98\.625.*92\.625", 104\.625"/);
  });

  it("só o pré-corte de 9' na lista: parede de 8' avisa", () => {
    const panel = panelizeWall(wall, { ...config, studLength: [104.625] });
    expect(panel.warnings.map((w) => w.code)).toEqual(['STUD_LENGTH_MISMATCH']);
  });

  it('lista de pré-cortes vazia ou inválida lança RangeError', () => {
    expect(() => panelizeWall(wall, { ...config, studLength: [] })).toThrow(RangeError);
    expect(() => panelizeWall(wall, { ...config, studLength: [0] })).toThrow(RangeError);
  });

  it('altura que não comporta stud lança RangeError', () => {
    expect(() => panelizeWall({ ...wall, height: 4.5 }, config)).toThrow(RangeError);
  });
});

/** Nenhum par de peças verticais ocupa o mesmo trecho de x na mesma faixa de y. */
function expectNoVerticalOverlap(members: Member[]) {
  const v = members.filter((m) => m.orientation === 'vertical');
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      const a = v[i]!;
      const b = v[j]!;
      const xOverlap = a.x < b.x + 1.5 && b.x < a.x + 1.5;
      const yOverlap = a.y < b.y + b.length && b.y < a.y + a.length;
      expect(xOverlap && yOverlap, `${a.role}@${a.x},${a.y} × ${b.role}@${b.x},${b.y}`).toBe(false);
    }
  }
}

describe('panelizeWall — janela', () => {
  const wWall = window.wall as Wall;
  const wConfig = window.config as Config;
  const win = wWall.openings[0] as Opening;
  const studXs = (p: Panel) => p.members.filter((m) => m.role === 'stud').map((m) => m.x);

  it('fixture wall-144-window passa exatamente (18 peças)', () => {
    const panel = panelizeWall(wWall, wConfig);
    expectSameMembers(panel.members, window.expected.members as Member[]);
    expect(panel.members).toHaveLength(18);
    expect(panel.warnings).toEqual(window.expected.warnings);
    expectNoVerticalOverlap(panel.members);
  });

  it('fixture wall-144-window-82.5 passa exatamente (20 peças, caso típico da fábrica)', () => {
    const panel = panelizeWall(low.wall as Wall, low.config as Config);
    expectSameMembers(panel.members, low.expected.members as Member[]);
    expect(panel.members).toHaveLength(20);
    expect(panel.warnings).toEqual(low.expected.warnings);
    expectNoVerticalOverlap(panel.members);
  });

  it('Opening.headerHeight sobrescreve config.headerHeight só na própria abertura', () => {
    const panel = panelizeWall(
      {
        ...wWall,
        length: 192,
        openings: [
          { id: 'a', type: 'window', offset: 20, roughWidth: 24, roughHeight: 48, header: H },
          { id: 'b', type: 'window', offset: 100, roughWidth: 36, roughHeight: 48, headerHeight: 80, header: H },
        ],
      },
      low.config as Config,
    );
    const headers = panel.members.filter((m) => m.role === 'header').map((h) => [h.x, h.y]);
    expect(headers).toEqual([
      [18.5, 82.5],
      [98.5, 80],
    ]);
    expectNoVerticalOverlap(panel.members);
  });

  it('2 kings + 2 jacks: zona [42, 90] remove as marcas 48, 64 e 80; 88.5 não colide com 96', () => {
    const panel = panelizeWall(
      { ...wWall, openings: [{ ...win, kingStuds: 2, jackStuds: 2 }] },
      wConfig,
    );
    expect(studXs(panel)).toEqual([0, 16, 32, 96, 112, 128, 142.5]);
    expectNoVerticalOverlap(panel.members);
  });

  it('duas janelas separadas: cada zona remove só os studs que sobrepõe', () => {
    const panel = panelizeWall(
      {
        ...wWall,
        length: 192,
        openings: [
          { id: 'a', type: 'window', offset: 20, roughWidth: 24, roughHeight: 48, header: H }, // zona [17, 47]
          { id: 'b', type: 'window', offset: 100, roughWidth: 36, roughHeight: 48, header: H }, // zona [97, 139]
        ],
      },
      wConfig,
    );
    // 16 (16–17.5) invade a zona a por 0.5"; 96 (96–97.5) invade a zona b
    expect(studXs(panel)).toEqual([0, 48, 64, 80, 144, 160, 176, 190.5]);
    expect(panel.members.filter((m) => m.role === 'header')).toHaveLength(2);
    expectNoVerticalOverlap(panel.members);
  });

  it('stud que só encosta no king fica (zona começa em 33.5, stud 32 termina em 33.5)', () => {
    const panel = panelizeWall({ ...wWall, openings: [{ ...win, offset: 36.5 }] }, wConfig);
    expect(studXs(panel)).toContain(32);
    expectNoVerticalOverlap(panel.members);
  });

  it('janela não tem corte na obra', () => {
    expect(panelizeWall(wWall, wConfig).fieldCuts).toEqual([]);
  });
});

describe('panelizeWall — porta', () => {
  it('fixture wall-120-door passa exatamente (16 peças, bottom plate inteira, corte na obra)', () => {
    const panel = panelizeWall(door.wall as Wall, door.config as Config);
    expectSameMembers(panel.members, door.expected.members as Member[]);
    expect(panel.members).toHaveLength(16);
    expect(panel.fieldCuts).toEqual(door.expected.fieldCuts);
    expect(panel.warnings).toEqual(door.expected.warnings);
    expectNoVerticalOverlap(panel.members);
    const plates = panel.members.filter((m) => m.role === 'bottomPlate');
    expect(plates).toEqual([expect.objectContaining({ x: 0, length: 120 })]);
  });

  it('aviso DOOR_RO_HEIGHT_MISMATCH da abertura chega ao painel, depois dos avisos da parede', () => {
    const dWall = door.wall as Wall;
    const panel = panelizeWall(
      { ...dWall, height: 103.125, openings: [{ ...dWall.openings[0]!, roughHeight: 80 }] },
      door.config as Config,
    );
    expect(panel.warnings.map((w) => w.code)).toEqual(['STUD_LENGTH_MISMATCH', 'DOOR_RO_HEIGHT_MISMATCH']);
  });
});

describe('panelizeWall — aberturas vizinhas', () => {
  it('fixture wall-144-window-door passa exatamente (24 peças, king compartilhado em 61.5)', () => {
    const panel = panelizeWall(windowDoor.wall as Wall, windowDoor.config as Config);
    expectSameMembers(panel.members, windowDoor.expected.members as Member[]);
    expect(panel.members).toHaveLength(24);
    expect(panel.fieldCuts).toEqual(windowDoor.expected.fieldCuts);
    expect(panel.warnings).toEqual(windowDoor.expected.warnings);
    expectNoVerticalOverlap(panel.members);
  });

  it('a ordem das aberturas na entrada não muda o painel', () => {
    const wd = windowDoor.wall as Wall;
    const panel = panelizeWall({ ...wd, openings: [...wd.openings].reverse() }, windowDoor.config as Config);
    expectSameMembers(panel.members, windowDoor.expected.members as Member[]);
  });

  it('zonas que só se tocam fundem: um king entre as janelas, sem sobreposição', () => {
    const panel = panelizeWall(
      {
        ...(window.wall as Wall),
        length: 192,
        openings: [
          { id: 'a', type: 'window', offset: 20, roughWidth: 24, roughHeight: 48, header: H }, // zona [17, 47]
          { id: 'b', type: 'window', offset: 50, roughWidth: 24, roughHeight: 48, header: H }, // zona [47, 77]
        ],
      },
      window.config as Config,
    );
    const kings = panel.members.filter((m) => m.role === 'kingStud').map((m) => m.x);
    expect(kings.sort((x, y) => x - y)).toEqual([17, 45.5, 75.5]);
    expect(panel.members.filter((m) => m.role === 'header')).toHaveLength(2);
    expectNoVerticalOverlap(panel.members);
  });

  it('RO vizinhos a menos de 4.5": RangeError (P16)', () => {
    const wd = windowDoor.wall as Wall;
    const tooClose = { ...wd, openings: [wd.openings[0]!, { ...wd.openings[1]!, offset: 64 }] };
    expect(() => panelizeWall(tooClose, windowDoor.config as Config)).toThrow(RangeError);
  });
});

describe('panelizeWall — header pela tabela (S9.2)', () => {
  const iWall = irc.wall as Wall;
  const iConfig = irc.config as Config;

  it('fixture wall-144-window-irc passa exatamente (22 peças, 2-2x6 com 2 jacks pela R602.7(1))', () => {
    const panel = panelizeWall(iWall, iConfig);
    expectSameMembers(panel.members, irc.expected.members as Member[]);
    expect(panel.members).toHaveLength(22);
    expect(panel.warnings).toEqual(irc.expected.warnings);
    expect(panel.members.find((m) => m.role === 'header')).toMatchObject({ plies: 2, headerSource: 'R602.7(1)' });
    expectNoVerticalOverlap(panel.members);
  });

  it('header do projeto na mesma parede manda sobre a tabela: volta ao painel do fixture 82.5', () => {
    const panel = panelizeWall({ ...iWall, openings: [{ ...iWall.openings[0]!, header: H }] }, iConfig);
    expectSameMembers(panel.members, low.expected.members as Member[]);
    expect(panel.members.find((m) => m.role === 'header')?.headerSource).toBe('project');
  });

  it('jackStuds da abertura abaixo do NJ: painel com 1 jack e aviso HEADER_JACKS_BELOW_TABLE', () => {
    const panel = panelizeWall({ ...iWall, openings: [{ ...iWall.openings[0]!, jackStuds: 1 }] }, iConfig);
    expect(panel.members.filter((m) => m.role === 'jackStud')).toHaveLength(2);
    expect(panel.members.find((m) => m.role === 'header')).toMatchObject({ section: '2x6', x: 46.5, length: 39 });
    expect(panel.warnings.map((w) => w.code)).toEqual(['HEADER_JACKS_BELOW_TABLE']);
  });

  it('sem header possível: Error com parede, abertura e motivo', () => {
    const { building: _b, ...noBuilding } = iConfig;
    const { floorsSupported: _f, ...noFloors } = iWall;
    expect(() => panelizeWall(iWall, noBuilding)).toThrow(/parede W-window-irc, abertura win1: .*config\.building/);
    expect(() => panelizeWall(noFloors, iConfig)).toThrow(/parede W-window-irc, abertura win1: .*floorsSupported/);
    // 2 pavimentos, RO de 11': nenhum header de madeira serrada atende em parede 2x6
    const wide = { ...iWall, floorsSupported: 2, openings: [{ ...iWall.openings[0]!, offset: 6, roughWidth: 132 }] };
    expect(() => panelizeWall(wide, iConfig)).toThrow(/parede W-window-irc, abertura win1: header fora da tabela/);
  });

  it('parede não portante sem header do projeto: peça deitada R602.7.4, 1 jack, sem cripples acima (20 peças)', () => {
    const panel = panelizeWall({ ...iWall, bearing: false }, iConfig);
    expect(panel.members.find((m) => m.role === 'header')).toMatchObject({
      section: '2x6',
      plies: 1,
      flat: true,
      headerSource: 'R602.7.4',
      x: 46.5,
      length: 39,
    });
    expect(panel.members.filter((m) => m.role === 'jackStud')).toHaveLength(2);
    expect(panel.members.filter((m) => m.role === 'cripple').every((c) => c.y === 1.5)).toBe(true);
    expect(panel.members).toHaveLength(18);
    expectNoVerticalOverlap(panel.members);
  });

  it('fixture wall-120-door-nonbearing passa exatamente (14 peças)', () => {
    const panel = panelizeWall(nonBearingDoor.wall as Wall, nonBearingDoor.config as Config);
    expectSameMembers(panel.members, nonBearingDoor.expected.members as Member[]);
    expect(panel.members).toHaveLength(14);
    expect(panel.fieldCuts).toEqual(nonBearingDoor.expected.fieldCuts);
    expect(panel.warnings).toEqual(nonBearingDoor.expected.warnings);
    expectNoVerticalOverlap(panel.members);
  });

  describe("janela + porta com NJ 2 (tabela FALSA: 20 psf, 30', 1 pavimento clear span → 2-2x6, NJ 2)", () => {
    const FAKE = loadHeaderTables(fakeHeaderJson());
    const fConfig: Config = { ...iConfig, building: { groundSnowLoad: 20, buildingWidth: 360 } };
    const fWall = (doorOffset: number): Wall => ({
      ...iWall,
      floorsSupported: 1,
      floorSpan: 'clear',
      openings: [
        { id: 'win1', type: 'window', offset: 24, roughWidth: 36, roughHeight: 48 },
        { id: 'door1', type: 'door', offset: doorOffset, roughWidth: 36, roughHeight: 82.5 },
      ],
    });
    const xsOf = (p: Panel, role: Member['role']) =>
      p.members
        .filter((m) => m.role === role)
        .map((m) => m.x)
        .sort((a, b) => a - b);

    it('7.5" entre os RO (2 jacks + king + 2 jacks): zona fundida, king compartilhado em 63, sem folga', () => {
      const panel = panelizeWall(fWall(67.5), fConfig, FAKE);
      expect(xsOf(panel, 'kingStud')).toEqual([19.5, 63, 106.5]);
      expect(xsOf(panel, 'jackStud')).toEqual([21, 22.5, 60, 61.5, 64.5, 66, 103.5, 105]);
      expect(panel.members.filter((m) => m.role === 'header').map((h) => [h.section, h.x, h.length])).toEqual([
        ['2x6', 21, 42],
        ['2x6', 64.5, 42],
      ]);
      // zona [19.5, 108] remove as marcas 32–96; 16 (até 17.5) e 112 ficam
      expect(xsOf(panel, 'stud')).toEqual([0, 16, 112, 128, 142.5]);
      expect(panel.warnings).toEqual([]);
      expectNoVerticalOverlap(panel.members);
    });

    it('9" entre os RO: zonas só se tocam e fundem; um king, 1.5" de folga antes dos jacks da porta', () => {
      const panel = panelizeWall(fWall(69), fConfig, FAKE);
      expect(xsOf(panel, 'kingStud')).toEqual([19.5, 63, 108]);
      expect(xsOf(panel, 'jackStud')).toEqual([21, 22.5, 60, 61.5, 66, 67.5, 105, 106.5]);
      expectNoVerticalOverlap(panel.members);
    });

    it('menos de 7.5" entre os RO: RangeError; os mesmos 6" cabem com 1 jack pedido na abertura (com aviso)', () => {
      expect(() => panelizeWall(fWall(66), fConfig, FAKE)).toThrow(/mínimo 7\.5"/);
      const oneJack = fWall(66);
      oneJack.openings = oneJack.openings.map((o) => ({ ...o, jackStuds: 1 }));
      const panel = panelizeWall(oneJack, fConfig, FAKE);
      expect(panel.warnings.map((w) => w.code)).toEqual(['HEADER_JACKS_BELOW_TABLE', 'HEADER_JACKS_BELOW_TABLE']);
      expectNoVerticalOverlap(panel.members);
    });
  });
});
