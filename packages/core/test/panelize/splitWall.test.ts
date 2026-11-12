import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_CONFIG, type Member, type Wall } from '../../src/types';
import { EngineError } from '../../src/messages';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall, wallBreakCandidates } from '../../src/panelize/splitWall';
import { expectSameMembers, type MemberKeyFields } from '../helpers/members';
import split480Json from '../fixtures/wall-480-split.json';
import spliced240Json from '../fixtures/wall-240-spliced.json';
import plainJson from '../fixtures/wall-144-plain.json';
import tallDoorJson from '../fixtures/wall-120-door-nonbearing-tall.json';
import { wallFixture } from '../helpers/fixtures';

const split480 = wallFixture(split480Json);
const spliced240 = wallFixture(spliced240Json);
const plain = wallFixture(plainJson);

const config = split480.config;

interface ExpectedPanel {
  id: string;
  wallId: string;
  level: number;
  wallOffset: number;
  length: number;
  layoutOrigin: number;
  weightLb: number;
  warnings: { code: string }[];
  fieldCuts: { role: string; openingId: string; x: number; length: number }[];
  members: MemberKeyFields[];
}

describe('splitWall — fixtures', () => {
  it.each([
    ['wall-480-split', split480],
    ['wall-240-spliced', spliced240],
  ])('%s: painéis, peças, laps, emendas e peso como no fixture', (_name, fx) => {
    const panels = splitWall(fx.wall, fx.config);
    const expected = fx.expected.panels as ExpectedPanel[];
    expect(panels.map((p) => p.id)).toEqual(expected.map((e) => e.id));
    expect(panels.map((p) => p.level)).toEqual(expected.map((e) => e.level));
    for (const [i, p] of panels.entries()) {
      const e = expected[i]!;
      expect(p).toMatchObject({ wallId: e.wallId, wallOffset: e.wallOffset, length: e.length, layoutOrigin: e.layoutOrigin, weightLb: e.weightLb });
      expect(p.warnings.map((w) => w.code), p.id).toEqual(e.warnings.map((w) => w.code));
      expect(p.fieldCuts, p.id).toEqual(e.fieldCuts);
      expectSameMembers(p.members, e.members);
      expect(p.height).toBe(fx.wall.height);
      expect(p.section).toBe(fx.wall.section);
    }
  });

  it('wall-480: stud duplo na junta (fechamento do P1 em 238.5, primeiro stud do P2 em 0) e lap da double top', () => {
    const [p1, p2] = splitWall(split480.wall, config);
    const studXs = (ms: Member[]) => ms.filter((m) => m.role === 'stud').map((m) => m.x);
    expect(studXs(p1!.members)).toContain(238.5);
    expect(studXs(p2!.members)).toContain(0);
    // Marca 240 da parede = 0 do P2; a marca seguinte (256) dá o stud em 15.25 local.
    expect(p2!.layoutOrigin).toBe(-240);
    expect(studXs(p2!.members)).toContain(15.25);
    const dt = (ms: Member[]) => ms.filter((m) => m.role === 'doubleTopPlate').map((m) => [m.x, m.x + m.length]);
    expect(dt(p1!.members)).toEqual([[0, 112], [112, 288]]);
    expect(dt(p2!.members)).toEqual([[48, 240]]);
    // A porta inteira (kings, jacks, header, corte na obra) fica no P1; a janela no P2, deslocada de −240.
    expect(p1!.fieldCuts).toEqual([{ role: 'bottomPlate', openingId: 'P1', x: 168, length: 38 }]);
    expect(p2!.members.find((m) => m.role === 'sill')).toMatchObject({ x: 96, length: 36 });
    // Aberturas da folha (S17) saem em x de cada painel.
    expect(p1!.openings!.map((o) => [o.id, o.x])).toEqual([['P1', 168]]);
    expect(p2!.openings!.map((o) => [o.id, o.x])).toEqual([['J1', 96]]);
  });
});

describe('splitWall — lap bloqueado por header (P23, P37)', () => {
  // 32' 2x4 interna não portante; quebra na marca 192. P1: janela RO 100 em 66 (header 2-2x10), sem stud de altura
  // inteira entre os kings 63.75 e 168.25. P2: porta RO 48 em 200, header 198.5–249.5 cobre 240 (lap 48) e 216 (24).
  const wall: Wall = {
    id: 'MIN',
    length: 384,
    height: 97.125,
    section: '2x4',
    exterior: false,
    bearing: false,
    openings: [
      { id: 'J1', type: 'window', offset: 66, roughWidth: 100, roughHeight: 48, header: { section: '2x10', plies: 2 } },
      { id: 'D1', type: 'door', offset: 200, roughWidth: 48, roughHeight: 82.5 },
    ],
  };
  const dt = (ms: Member[]) => ms.filter((m) => m.role === 'doubleTopPlate').map((m) => [m.x, m.x + m.length]);

  it('o lap termina no king logo depois do header da porta (250.25), não na marca 256; a double top do P1 emenda no king 63.75', () => {
    const [p1, p2] = splitWall(wall, config);
    expect(dt(p1!.members)).toEqual([[0, 63.75], [63.75, 250.25]]);
    expect(dt(p2!.members)).toEqual([[58.25, 192]]);
  });
});

describe('splitWall — abertura deslocada por tolerância (P40)', () => {
  // Parede de 280" (2 painéis); porta RO 32 em 245.375: a zona passa 3/8" do fim. Volta para 245, com aviso no P2.
  const wall: Wall = {
    id: 'I12',
    length: 280,
    height: 97.125,
    section: '2x4',
    exterior: false,
    bearing: false,
    openings: [{ id: 'U3', type: 'door', offset: 245.375, roughWidth: 32, roughHeight: 82.5 }],
  };

  it('a porta sai em 245 da parede e o aviso OPENING_NUDGED fica no painel dela', () => {
    expect(() => panelizeWall(wall, config)).toThrow(/runs past the 280" wall/);
    const panels = splitWall(wall, config);
    const last = panels[panels.length - 1]!;
    expect(last.openings!.map((o) => o.x + last.wallOffset!)).toEqual([245]);
    expect(last.warnings[0]).toEqual({
      code: 'OPENING_NUDGED',
      message:
        'Wall I12, opening U3: moved 0.375" to the left (RO edge from 245.375 to 245) — it touched the end ' +
        'of the wall; check the reading',
      wallId: 'I12',
      openingId: 'U3',
      params: { distance: 0.375, direction: 'left', from: 245.375, to: 245, touched: 'end' },
      hypothesis: 'P40',
    });
    expect(panels.slice(0, -1).flatMap((p) => p.warnings.map((w) => w.code))).not.toContain('OPENING_NUDGED');
  });
});

describe('splitWall — parede de um painel só', () => {
  it('parede que cabe: um painel igual ao panelizeWall, com id {level}-{wallId}-P1 (S16), wallOffset 0 e peso', () => {
    const wall = plain.wall;
    const [panel, ...rest] = splitWall(wall, plain.config);
    expect(rest).toEqual([]);
    expect(panel).toEqual({ ...panelizeWall(wall, plain.config), id: '1-W-plain-P1', level: 1, wallOffset: 0, weightLb: 226.4 });
    expect(splitWall({ ...wall, level: 3 }, plain.config)[0]).toMatchObject({ id: '3-W-plain-P1', level: 3 });
    expect(() => splitWall({ ...wall, level: 1.5 }, plain.config)).toThrow(/Wall W-plain: level must be a whole number ≥ 1 \(got 1\.5\)/);
  });

  it('config.panel inválido é RangeError', () => {
    expect(() => splitWall(plain.wall, { ...config, panel: { maxLength: 240, module: 48, lap: 48, minLap: 60 } })).toThrow(/minLap/);
  });
});

describe('splitWall — peso (P15)', () => {
  const wall240 = spliced240.wall;

  it('maxWeight baixo divide a parede que cabia no comprimento; a estimativa conta o stud da junta e o lap', () => {
    // 240" lisa pesa 367 lb. Com 200 lb por painel nenhuma marca múltipla de 48 serve (144 + 96: P1 com 9 studs,
    // o stud da junta e o lap = 211 lb; 96 + 144: P2 = 211 lb); 128 + 112 também não (P1 = 211); 112 + 128 cabe
    // (P1 = 187.5 lb: 7 studs + fechamento, plates 112 + 112 + 160; P2 = 194.9 lb: 9 studs, plates 128 + 128 + 80).
    const panels = splitWall(wall240, { ...config, panel: { maxLength: 240, maxWeight: 200, module: 48, lap: 48, minLap: 24 } });
    expect(panels.map((p) => [p.id, p.length, p.weightLb])).toEqual([
      ['1-W-240-P1', 112, 187.5],
      ['1-W-240-P2', 128, 194.9],
    ]);
    for (const p of panels) expect(p.weightLb!).toBeLessThanOrEqual(200);
    expect(panels.map((p) => p.warnings)).toEqual([[], []]);
  });

  it('a estimativa da escolha bate com o peso real: máximo igual ao peso do painel mais pesado mantém a divisão', () => {
    const [p1, p2] = splitWall(split480.wall, config);
    const heaviest = Math.max(p1!.weightLb!, p2!.weightLb!);
    const same = splitWall(split480.wall, { ...config, panel: { ...DEFAULT_PANEL_CONFIG, maxWeight: heaviest } });
    expect(same.map((p) => [p.length, p.weightLb])).toEqual([p1, p2].map((p) => [p!.length, p!.weightLb]));
    // Um décimo de libra a menos e a parede vai para três painéis.
    expect(splitWall(split480.wall, { ...config, panel: { ...DEFAULT_PANEL_CONFIG, maxWeight: heaviest - 0.1 } })).toHaveLength(3);
  });

  it('lap encurtado por um header deixa o painel seguinte mais pesado que a estimativa: aviso PANEL_OVERWEIGHT, não erro', () => {
    // Janela em 280: o lap de 48 a partir da quebra em 240 cairia dentro do header (278.5–319.5) → encurta para 24,
    // e o P2 ganha 24" de double top (4 lb) que a estimativa não viu.
    const wall: Wall = { ...split480.wall, openings: [{ ...split480.wall.openings[1]!, offset: 280 }] };
    const [p1, p2] = splitWall(wall, config);
    // A double top do P2 começa em 24 (216" → emendada na marca 144).
    expect(p2!.members.filter((m) => m.role === 'doubleTopPlate').map((m) => m.x)).toEqual([24, 144]);
    const limit = p2!.weightLb! - 2;
    expect(p1!.weightLb!).toBeLessThanOrEqual(limit);
    const panels = splitWall(wall, { ...config, panel: { ...DEFAULT_PANEL_CONFIG, maxWeight: limit } });
    expect(panels.map((p) => p.length)).toEqual([240, 240]);
    expect(panels[0]!.warnings).toEqual([]);
    expect(panels[1]!.warnings.map((w) => w.code)).toEqual(['PANEL_OVERWEIGHT']);
    expect(panels[1]!.warnings[0]!.message).toMatch(new RegExp(`Panel 1-W-480-P2: estimated weight ${p2!.weightLb} lb is over the ${limit} lb limit`));
  });

  it('sem como caber no peso: RangeError', () => {
    expect(() => splitWall(wall240, { ...config, panel: { maxLength: 240, maxWeight: 10, module: 48, lap: 48, minLap: 24 } })).toThrow(/cannot split 240"/);
  });
});

describe('splitWall — ligações da parede e T no lap', () => {
  const base: Wall = { id: 'W', length: 400, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] };

  it('canto e T da parede ficam só no primeiro e no último painel; a junta é a ligação panel', () => {
    const wall: Wall = {
      ...base,
      joints: { start: { kind: 'corner', through: true, otherThickness: 5.5 }, end: { kind: 'tee', otherThickness: 5.5 } },
    };
    const [p1, p2] = splitWall(wall, config);
    // Quebra equilibrada em 192 (múltipla de 48; 208 seria mais equilibrada, mas não é múltipla).
    expect([p1!.length, p2!.length]).toEqual([192, 208]);
    const flat = (ms: Member[]) => ms.filter((m) => m.role === 'stud' && m.flat === true);
    expect(flat(p1!.members).map((m) => m.x)).toEqual([1.5]);
    expect(flat(p2!.members)).toEqual([]);
    const dt = (ms: Member[]) => ms.filter((m) => m.role === 'doubleTopPlate').map((m) => [m.x, m.x + m.length]);
    // P1: recua 5.5 no canto e avança 48 sobre o P2 (a double top de 234.5 > 192 é emendada em 144).
    expect(dt(p1!.members)).toEqual([[5.5, 144], [144, 240]]);
    // P2: começa em 48 (lap do P1) e avança 5.5 sobre a parede do T no fim.
    expect(dt(p2!.members)).toEqual([[48, 213.5]]);
  });

  it('faixa de T que cai no lap do painel da esquerda corta a double top dele; o da direita recebe os blocos', () => {
    const wall: Wall = { ...base, joints: { tees: [{ x: 220, width: 3.5, wallId: 'T' }] } };
    const [p1, p2] = splitWall(wall, config);
    // Marcas 208 e 224 saem pelos blocos do ladder e 220 não é marca → quebra em 192.
    expect(p1!.length).toBe(192);
    const dt = (ms: Member[]) => ms.filter((m) => m.role === 'doubleTopPlate').map((m) => [m.x, m.x + m.length]);
    // Double top de 240 (192 + lap 48) cortada na faixa e, por passar do estoque de 192, emendada na marca 144.
    expect(dt(p1!.members)).toEqual([[0, 144], [144, 218.25], [221.75, 240]]);
    expect(dt(p2!.members)).toEqual([[48, 208]]);
    const blocks = p2!.members.filter((m) => m.role === 'block');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ x: 16.75, length: 14.5 });
    expect(p1!.members.filter((m) => m.role === 'block')).toEqual([]);
  });

  it('T na faixa da quebra: a marca não é candidata, a divisão usa outra', () => {
    const wall: Wall = { ...base, joints: { tees: [{ x: 192, width: 3.5, wallId: 'T' }] } };
    const [p1] = splitWall(wall, config);
    expect(p1!.length).not.toBe(192);
    expect(p1!.length).toBe(240);
  });
});

describe('splitWall — quebras forçadas (S29, wall.panelBreaks)', () => {
  const forced = wallFixture({ config: split480Json.config, wall: { ...split480Json.wall, panelBreaks: split480Json.forced.panelBreaks } });

  it('wall-480-split, caso forçado [160, 320]: três painéis de 160 em vez dos dois de 240 do automático', () => {
    const panels = splitWall(forced.wall, forced.config);
    const expected = split480Json.forced.expected.panels as ExpectedPanel[];
    expect(panels.map((p) => p.id)).toEqual(expected.map((e) => e.id));
    for (const [i, p] of panels.entries()) {
      const e = expected[i]!;
      expect(p).toMatchObject({ wallId: e.wallId, level: e.level, wallOffset: e.wallOffset, length: e.length, layoutOrigin: e.layoutOrigin, weightLb: e.weightLb });
      expect(p.warnings.map((w) => w.code), p.id).toEqual(e.warnings.map((w) => w.code));
      expect(p.fieldCuts, p.id).toEqual(e.fieldCuts);
      expectSameMembers(p.members, e.members);
    }
    // Sem o campo, o automático segue igual ao fixture.
    expect(splitWall(split480.wall, config).map((p) => p.wallOffset)).toEqual([0, 240]);
  });

  it('a lista é completa: a do automático dá o mesmo resultado; [] numa parede que cabe dá um painel', () => {
    expect(splitWall({ ...split480.wall, panelBreaks: [240] }, config)).toEqual(splitWall(split480.wall, config));
    expect(splitWall({ ...plain.wall, panelBreaks: [] }, plain.config)).toEqual(splitWall(plain.wall, plain.config));
    // Parede de 144 que caberia inteira: o revisor pode quebrá-la mesmo assim.
    expect(splitWall({ ...plain.wall, panelBreaks: [64] }, plain.config).map((p) => [p.wallOffset, p.length])).toEqual([
      [0, 64],
      [64, 80],
    ]);
  });

  it('erros com código: quebra fora dos candidatos e trecho acima de maxLength', () => {
    const code = (breaks: number[]): unknown => {
      try {
        splitWall({ ...split480.wall, panelBreaks: breaks }, config);
      } catch (e) {
        return e instanceof EngineError ? { code: e.code, wallId: e.wallId, ...e.params } : e;
      }
      return undefined;
    };
    expect(code([192, 320])).toMatchObject({ code: 'PANEL_BREAK_INVALID', wallId: 'W-480', at: 192, reason: 'opening', openingIds: ['P1'] });
    expect(code([150, 320])).toMatchObject({ code: 'PANEL_BREAK_INVALID', at: 150, reason: 'mark' });
    expect(code([3, 240])).toMatchObject({ code: 'PANEL_BREAK_INVALID', at: 3, reason: 'end' });
    expect(code([320, 160])).toMatchObject({ code: 'PANEL_BREAK_INVALID', at: 160, reason: 'order' });
    expect(code([])).toMatchObject({ code: 'PANEL_TOO_LONG', from: 0, to: 480, maxLength: 240 });
  });

  it('o campo não vaza para os trechos (cada painel é uma Wall sem panelBreaks)', () => {
    const panels = splitWall(forced.wall, forced.config);
    expect(panels).toHaveLength(3);
    for (const p of panels) expect(p).not.toHaveProperty('panelBreaks');
  });
});

describe('wallBreakCandidates (S29: o que o editor oferece)', () => {
  it('os candidatos de breakCandidates sobre a parede inteira', () => {
    const excluded = new Set([176, 192, 208, 336, 352, 368]);
    const every = Array.from({ length: 29 }, (_, i) => (i + 1) * 16);
    expect(wallBreakCandidates(split480.wall, config)).toEqual(every.filter((c) => !excluded.has(c)));
    // Não depende de panelBreaks (nem do erro dela).
    expect(wallBreakCandidates({ ...split480.wall, panelBreaks: [192] }, config)).toEqual(wallBreakCandidates(split480.wall, config));
  });
});

describe('splitWall — divisão que não emenda é descartada (S43)', () => {
  // A I2 real do Matilda Pines (2026-11-11): 342", três paredes em T (I3, I1, I5) e duas portas no meio.
  const door = (id: string, offset: number) =>
    ({ id, type: 'door', offset, roughWidth: 34, roughHeight: 81.5, header: { section: '2x6', plies: 2 } }) as const;
  const i2: Wall = {
    id: 'I2',
    length: 342,
    height: 97.125,
    section: '2x4',
    exterior: false,
    bearing: false,
    openings: [door('D1', 90.75), door('D2', 170)],
    joints: {
      tees: [
        { x: 136.5, width: 3.5, wallId: 'I3' },
        { x: 165.25, width: 3.5, wallId: 'I1' },
        { x: 231, width: 3.5, wallId: 'I5' },
      ],
    },
  };
  const plates = (ms: Member[]) => ms.filter((m) => /Plate$/.test(m.role));

  it('48/288 (múltiplas de 48) deixa o painel de 240 sem stud para emendar: o motor passa à divisão seguinte, 80/256', () => {
    // No painel 48–288 as três faixas de T cortam a double top e nenhum stud fica a 24" de todas as juntas.
    const panels = splitWall(i2, config);
    expect(panels.map((p) => [p.wallOffset, p.length])).toEqual([[0, 80], [80, 176], [256, 86]]);
    // Nenhum painel passa de 192: nenhuma plate emendada.
    for (const p of panels) for (const m of plates(p.members)) expect(m.length, `${p.id} ${m.role}`).toBeLessThanOrEqual(192);
  });

  it('quebra forçada que não emenda continua erro: a lista do revisor não é trocada', () => {
    expect(() => splitWall({ ...i2, panelBreaks: [48, 288] }, config)).toThrow(
      expect.objectContaining({ code: 'SPLICE_NO_STUD' }),
    );
  });

  it('parede de um painel só que não emenda é dividida em dois', () => {
    // 240" com as três faixas de T e as portas: a top plate de 240 não acha stud a 24" das juntas da double top.
    const one: Wall = {
      ...i2,
      length: 240,
      openings: [door('D1', 42.75), door('D2', 122)],
      joints: { tees: [{ x: 88.5, width: 3.5, wallId: 'I3' }, { x: 117.25, width: 3.5, wallId: 'I1' }, { x: 183, width: 3.5, wallId: 'I5' }] },
    };
    const panels = splitWall(one, config);
    expect(panels.length).toBe(2);
    expect(panels.reduce((s, p) => s + p.length, 0)).toBe(240);
  });

  it('sem nenhuma divisão que emende, o erro é o da emenda (SPLICE_NO_STUD), não o de divisão', () => {
    // 100" com estoque de 96": a janela toma as marcas (sem candidato a quebra) e os kings ficam a < 24" das pontas.
    const short: Wall = {
      id: 'W',
      length: 100,
      height: 97.125,
      section: '2x4',
      exterior: false,
      bearing: false,
      openings: [{ id: 'J1', type: 'window', offset: 20, roughWidth: 60, roughHeight: 36, header: { section: '2x6', plies: 2 } }],
    };
    expect(() => splitWall(short, { ...config, stockLengths: [96] })).toThrow(expect.objectContaining({ code: 'SPLICE_NO_STUD' }));
  });
});

describe('splitWall — peça deitada com cripples (S44)', () => {
  const tallDoor = wallFixture(tallDoorJson);

  it('parede dividida: o aviso FLAT_HEADER_CRIPPLES fica só no painel que tem a porta', () => {
    const panels = splitWall({ ...tallDoor.wall, length: 300 }, tallDoor.config);
    expect(panels.length).toBe(2);
    const codes = panels.map((p) => p.warnings.map((w) => w.code));
    expect(codes).toEqual([['FLAT_HEADER_CRIPPLES'], []]);
  });
});
