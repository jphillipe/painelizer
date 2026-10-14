import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_CONFIG, type Config, type Member, type Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall } from '../../src/panelize/splitWall';
import { expectSameMembers, type MemberKeyFields } from '../helpers/members';
import split480 from '../fixtures/wall-480-split.json';
import spliced240 from '../fixtures/wall-240-spliced.json';
import plain from '../fixtures/wall-144-plain.json';

const config = split480.config as Config;

interface ExpectedPanel {
  id: string;
  wallId: string;
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
    const panels = splitWall(fx.wall as Wall, fx.config as Config);
    const expected = fx.expected.panels as ExpectedPanel[];
    expect(panels.map((p) => p.id)).toEqual(expected.map((e) => e.id));
    for (const [i, p] of panels.entries()) {
      const e = expected[i]!;
      expect(p).toMatchObject({ wallId: e.wallId, wallOffset: e.wallOffset, length: e.length, layoutOrigin: e.layoutOrigin, weightLb: e.weightLb });
      expect(p.warnings.map((w) => w.code), p.id).toEqual(e.warnings.map((w) => w.code));
      expect(p.fieldCuts, p.id).toEqual(e.fieldCuts);
      expectSameMembers(p.members, e.members);
      expect(p.height).toBe((fx.wall as Wall).height);
      expect(p.section).toBe((fx.wall as Wall).section);
    }
  });

  it('wall-480: stud duplo na junta (fechamento do P1 em 238.5, primeiro stud do P2 em 0) e lap da double top', () => {
    const [p1, p2] = splitWall(split480.wall as Wall, config);
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
  });
});

describe('splitWall — parede de um painel só', () => {
  it('parede que cabe: um painel igual ao panelizeWall, com o id da parede, mais wallOffset 0 e peso', () => {
    const wall = plain.wall as Wall;
    const [panel, ...rest] = splitWall(wall, plain.config as Config);
    expect(rest).toEqual([]);
    expect(panel).toEqual({ ...panelizeWall(wall, plain.config as Config), wallOffset: 0, weightLb: 226.4 });
    expect(panel!.id).toBe('W-plain');
  });

  it('config.panel inválido é RangeError', () => {
    expect(() => splitWall(plain.wall as Wall, { ...config, panel: { maxLength: 240, module: 48, lap: 48, minLap: 60 } })).toThrow(/minLap/);
  });
});

describe('splitWall — peso (P15)', () => {
  const wall240 = spliced240.wall as Wall;

  it('maxWeight baixo divide a parede que cabia no comprimento; a estimativa conta o stud da junta e o lap', () => {
    // 240" lisa pesa 367 lb. Com 200 lb por painel nenhuma marca múltipla de 48 serve (144 + 96: P1 com 9 studs,
    // o stud da junta e o lap = 211 lb; 96 + 144: P2 = 211 lb); 128 + 112 também não (P1 = 211); 112 + 128 cabe
    // (P1 = 187.5 lb: 7 studs + fechamento, plates 112 + 112 + 160; P2 = 194.9 lb: 9 studs, plates 128 + 128 + 80).
    const panels = splitWall(wall240, { ...config, panel: { maxLength: 240, maxWeight: 200, module: 48, lap: 48, minLap: 24 } });
    expect(panels.map((p) => [p.id, p.length, p.weightLb])).toEqual([
      ['W-240-P1', 112, 187.5],
      ['W-240-P2', 128, 194.9],
    ]);
    for (const p of panels) expect(p.weightLb!).toBeLessThanOrEqual(200);
    expect(panels.map((p) => p.warnings)).toEqual([[], []]);
  });

  it('a estimativa da escolha bate com o peso real: máximo igual ao peso do painel mais pesado mantém a divisão', () => {
    const [p1, p2] = splitWall(split480.wall as Wall, config);
    const heaviest = Math.max(p1!.weightLb!, p2!.weightLb!);
    const same = splitWall(split480.wall as Wall, { ...config, panel: { ...DEFAULT_PANEL_CONFIG, maxWeight: heaviest } });
    expect(same.map((p) => [p.length, p.weightLb])).toEqual([p1, p2].map((p) => [p!.length, p!.weightLb]));
    // Um décimo de libra a menos e a parede vai para três painéis.
    expect(splitWall(split480.wall as Wall, { ...config, panel: { ...DEFAULT_PANEL_CONFIG, maxWeight: heaviest - 0.1 } })).toHaveLength(3);
  });

  it('lap encurtado por um header deixa o painel seguinte mais pesado que a estimativa: aviso PANEL_OVERWEIGHT, não erro', () => {
    // Janela em 280: o lap de 48 a partir da quebra em 240 cairia dentro do header (278.5–319.5) → encurta para 24,
    // e o P2 ganha 24" de double top (4 lb) que a estimativa não viu.
    const wall: Wall = { ...(split480.wall as Wall), openings: [{ ...(split480.wall as Wall).openings[1]!, offset: 280 }] };
    const [p1, p2] = splitWall(wall, config);
    // A double top do P2 começa em 24 (216" → emendada na marca 144).
    expect(p2!.members.filter((m) => m.role === 'doubleTopPlate').map((m) => m.x)).toEqual([24, 144]);
    const limit = p2!.weightLb! - 2;
    expect(p1!.weightLb!).toBeLessThanOrEqual(limit);
    const panels = splitWall(wall, { ...config, panel: { ...DEFAULT_PANEL_CONFIG, maxWeight: limit } });
    expect(panels.map((p) => p.length)).toEqual([240, 240]);
    expect(panels[0]!.warnings).toEqual([]);
    expect(panels[1]!.warnings.map((w) => w.code)).toEqual(['PANEL_OVERWEIGHT']);
    expect(panels[1]!.warnings[0]!.message).toMatch(new RegExp(`painel W-480-P2: peso estimado de ${p2!.weightLb} lb passa do máximo de ${limit} lb`));
  });

  it('sem como caber no peso: RangeError', () => {
    expect(() => splitWall(wall240, { ...config, panel: { maxLength: 240, maxWeight: 10, module: 48, lap: 48, minLap: 24 } })).toThrow(/não há como dividir 240"/);
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
    expect(p1!.members.filter((m) => m.flat).map((m) => m.x)).toEqual([1.5]);
    expect(p2!.members.filter((m) => m.flat)).toEqual([]);
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
