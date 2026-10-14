import { describe, expect, it } from 'vitest';
import type { Config, Member, Wall } from '../../src/types';
import {
  LADDER_BLOCK_SPACING,
  backerStuds,
  cornerStuds,
  ladderBlockCenters,
  ladderBlocks,
  plateOptionsFor,
  teeConflicts,
  teeStrips,
} from '../../src/rules/corners';
import { panelizeWall, planOpenings } from '../../src/panelize/panelizeWall';
import { expectSameMembers } from '../helpers/members';

const config: Config = {
  studSpacing: 16,
  studThickness: 1.5,
  plateThickness: 1.5,
  studLength: [92.625, 104.625],
  headerHeight: 82.5,
  building: { groundSnowLoad: 50, buildingWidth: 336, windSpeed: 120 },
};

const base: Omit<Wall, 'id' | 'length'> = {
  height: 97.125,
  section: '2x6',
  exterior: true,
  bearing: true,
  floorsSupported: 0,
  openings: [],
};

const stud = (x: number, extra: Partial<Member> = {}): Member => ({
  role: 'stud',
  section: '2x6',
  length: 92.625,
  x,
  y: 1.5,
  orientation: 'vertical',
  ...extra,
});

describe('plateOptionsFor — laps da double top plate (R602.3.2)', () => {
  it('sem joints: nada', () => {
    expect(plateOptionsFor(undefined)).toEqual({});
    expect(plateOptionsFor({})).toEqual({});
  });

  it('canto: quem atravessa recua t da outra, quem encosta avança t da outra', () => {
    expect(plateOptionsFor({ start: { kind: 'corner', through: true, otherThickness: 5.5 } })).toEqual({
      start: { recess: 5.5 },
    });
    expect(plateOptionsFor({ end: { kind: 'corner', through: false, otherThickness: 3.5 } })).toEqual({
      end: { extend: 3.5 },
    });
  });

  it('T: quem encosta avança t da atravessada; a atravessada é cortada na faixa', () => {
    expect(plateOptionsFor({ start: { kind: 'tee', otherThickness: 5.5 } })).toEqual({ start: { extend: 5.5 } });
    expect(plateOptionsFor({ tees: [{ x: 72, width: 3.5 }] })).toEqual({ cuts: [{ x: 70.25, width: 3.5 }] });
  });
});

describe('cornerStuds — canto California / three-stud (P5)', () => {
  const through = (ends: ('start' | 'end')[]): Wall => ({
    ...base,
    id: 'W',
    length: 146.75,
    joints: Object.fromEntries(ends.map((e) => [e, { kind: 'corner', through: true, otherThickness: 5.5 }])),
  });

  it('California (default): stud flat colado ao stud de ponta — x = 1.5 no início, length − 7 no fim', () => {
    expect(cornerStuds(through(['start']), config)).toEqual([{ x: 1.5, flat: true }]);
    expect(cornerStuds(through(['end']), config)).toEqual([{ x: 146.75 - 1.5 - 5.5, flat: true }]);
    expect(cornerStuds(through(['start', 'end']), config)).toEqual([
      { x: 1.5, flat: true },
      { x: 139.75, flat: true },
    ]);
  });

  it('three-stud: stud em pé no mesmo lugar (x = 1.5 / length − 3)', () => {
    expect(cornerStuds(through(['start', 'end']), { ...config, corner: 'three-stud' })).toEqual([
      { x: 1.5, flat: false },
      { x: 143.75, flat: false },
    ]);
  });

  it('parede 2x4: o flat ocupa 3.5', () => {
    const w: Wall = { ...through(['end']), section: '2x4', length: 100 };
    expect(cornerStuds(w, config)).toEqual([{ x: 100 - 1.5 - 3.5, flat: true }]);
  });

  it('quem encosta (canto) ou está em T na ponta não ganha stud; parede solta também não', () => {
    expect(cornerStuds({ ...base, id: 'W', length: 100 }, config)).toEqual([]);
    expect(
      cornerStuds(
        { ...base, id: 'W', length: 100, joints: { start: { kind: 'corner', through: false, otherThickness: 5.5 }, end: { kind: 'tee', otherThickness: 5.5 } } },
        config,
      ),
    ).toEqual([]);
  });

  it('plate curta demais para o stud de canto é erro', () => {
    expect(() => cornerStuds({ ...through(['start']), length: 6 }, config)).toThrow(/stud de canto em x=1.5 não cabe na plate de 6"/);
  });
});

describe('teeStrips / teeConflicts', () => {
  it('faixa = x ± width/2, com o id da parede que encosta', () => {
    expect(teeStrips({ tees: [{ x: 72, width: 3.5, wallId: 'W2' }] })).toEqual([{ lo: 70.25, hi: 73.75, wallId: 'W2' }]);
    expect(teeStrips(undefined)).toEqual([]);
  });

  const wallWith = (offset: number): Wall => ({
    ...base,
    id: 'W1',
    length: 192,
    openings: [{ id: 'J1', type: 'window', offset, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } }],
  });
  const strip = { lo: 94.25, hi: 97.75, wallId: 'W2' };

  it('faixa fora da zona: passa sem aviso', () => {
    const wall = wallWith(120);
    const { openings, plan } = planOpenings(wall, config);
    expect(teeConflicts(wall, [strip], openings, plan.zones)).toEqual({ clear: [strip], warnings: [] });
  });

  it('faixa na zona (kings/jacks): aviso OPENING_AT_TEE e a faixa sai das peças de T', () => {
    const wall = wallWith(100);
    const { openings, plan } = planOpenings(wall, config);
    const r = teeConflicts(wall, [strip], openings, plan.zones);
    expect(r.clear).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(['OPENING_AT_TEE']);
    expect(r.warnings[0]!.message).toMatch(/parede W1: a parede W2 encosta em T em x=96 \(faixa 94.25–97.75\), na zona da\(s\) abertura\(s\) J1 \[97, 139\]/);
  });

  it('faixa dentro do RO: erro', () => {
    const wall = wallWith(90);
    const { openings, plan } = planOpenings(wall, config);
    expect(() => teeConflicts(wall, [strip], openings, plan.zones)).toThrow(/parede W1, abertura J1: a parede W2 encosta em T em x=96 \(faixa 94.25–97.75\), dentro do RO \[90, 126\]/);
  });

  it('encostar na zona não conta', () => {
    const wall = wallWith(100.75); // zona começa em 97.75
    const { openings, plan } = planOpenings(wall, config);
    expect(teeConflicts(wall, [strip], openings, plan.zones).warnings).toEqual([]);
  });
});

describe('ladderBlockCenters — alturas dos blocos (hipótese P22)', () => {
  it("8' (97.125): 24, 48, 72 — o de 96 passaria da base da top plate (94.125)", () => {
    expect(ladderBlockCenters(97.125, 1.5, 1.5)).toEqual([24, 48, 72]);
  });

  it("9' (109.125) e 10' (121.125): 24, 48, 72, 96", () => {
    expect(ladderBlockCenters(109.125, 1.5, 1.5)).toEqual([24, 48, 72, 96]);
    expect(ladderBlockCenters(121.125, 1.5, 1.5)).toEqual([24, 48, 72, 96]);
  });

  it('o espaçamento é 24"', () => {
    expect(LADDER_BLOCK_SPACING).toBe(24);
  });
});

describe('ladderBlocks', () => {
  const wall: Wall = { ...base, id: 'W1', length: 192 };
  const verticals = [stud(0), stud(63.25), stud(79.25), stud(95.25), stud(111.25), stud(190.5)];

  it('bloco do stud vizinho à esquerda ao vizinho à direita, 3 alturas, deitado (role block)', () => {
    const blocks = ladderBlocks(wall, [{ lo: 70.25, hi: 73.75 }], verticals, config);
    expectSameMembers(blocks, [
      { role: 'block', section: '2x6', length: 14.5, x: 64.75, y: 23.25 },
      { role: 'block', section: '2x6', length: 14.5, x: 64.75, y: 47.25 },
      { role: 'block', section: '2x6', length: 14.5, x: 64.75, y: 71.25 },
    ]);
    for (const b of blocks) expect(b.orientation).toBe('horizontal');
  });

  it('stud de layout dentro da faixa fica e divide o bloco em dois', () => {
    const blocks = ladderBlocks(wall, [{ lo: 94.25, hi: 97.75 }], verticals, config);
    expect(blocks.filter((b) => b.y === 23.25).map((b) => [b.x, b.length])).toEqual([
      [80.75, 14.5],
      [96.75, 14.5],
    ]);
    expect(blocks).toHaveLength(6);
  });

  it('pedaço menor que 1.5" não é cortado', () => {
    // Stud em 65 ocupa 65–66.5: entre 64.75 e 65 sobram 0.25.
    const blocks = ladderBlocks(wall, [{ lo: 65.5, hi: 69 }], [stud(0), stud(63.25), stud(65), stud(79.25), stud(190.5)], config);
    expect(blocks.filter((b) => b.y === 23.25).map((b) => [b.x, b.length])).toEqual([[66.5, 12.75]]);
  });

  it('stud flat de canto delimita pela largura real', () => {
    const flat = stud(1.5, { flat: true }); // ocupa 1.5–7
    const blocks = ladderBlocks(wall, [{ lo: 9, hi: 12.5 }], [stud(0), flat, stud(15.25), stud(190.5)], config);
    expect(blocks[0]).toMatchObject({ x: 7, length: 8.25 });
  });

  it("config.tee 'backer' ou sem faixa: nenhum bloco", () => {
    expect(ladderBlocks(wall, [{ lo: 70.25, hi: 73.75 }], verticals, { ...config, tee: 'backer' })).toEqual([]);
    expect(ladderBlocks(wall, [], verticals, config)).toEqual([]);
  });

  it('faixa sem stud de um dos lados é erro', () => {
    expect(() => ladderBlocks(wall, [{ lo: 70.25, hi: 73.75 }], [stud(0)], config)).toThrow(/sem stud vizinho/);
  });
});

describe('backerStuds', () => {
  it("'backer': dois studs em pé colados às faces da faixa", () => {
    expect(backerStuds([{ lo: 70.25, hi: 73.75 }], { ...config, tee: 'backer' })).toEqual([
      { x: 68.75, flat: false },
      { x: 73.75, flat: false },
    ]);
  });

  it('ladder (default): nenhum', () => {
    expect(backerStuds([{ lo: 70.25, hi: 73.75 }], config)).toEqual([]);
  });
});

describe('panelizeWall com joints', () => {
  const teeWall: Wall = {
    ...base,
    id: 'W1',
    length: 192,
    joints: { tees: [{ x: 72, width: 3.5, wallId: 'W2' }] },
  };

  it("T 'backer': studs de encosto em 68.75 e 73.75, sem blocos; double top cortada", () => {
    const panel = panelizeWall(teeWall, { ...config, tee: 'backer' });
    const studXs = panel.members.filter((m) => m.role === 'stud').map((m) => m.x);
    expect(studXs).toContain(68.75);
    expect(studXs).toContain(73.75);
    expect(panel.members.filter((m) => m.role === 'block')).toEqual([]);
    expect(panel.members.filter((m) => m.role === 'doubleTopPlate').map((m) => [m.x, m.length])).toEqual([
      [0, 70.25],
      [73.75, 118.25],
    ]);
    expect(panel.warnings).toEqual([]);
  });

  it('stud de layout que sobrepõe um stud de encosto sai; o que só encosta fica', () => {
    // Faixa 78.25–81.75: backer esquerdo em 76.75–78.25 sobrepõe o stud de layout 79.25? Não: 79.25 está
    // dentro da faixa (fica). Backer direito em 81.75. Faixa 94–97.5: backer esquerdo 92.5–94 sobrepõe 95.25?
    // Não. Use faixa 97–100.5: backer esquerdo 95.5–97 sobrepõe o stud 95.25–96.75 → sai.
    const panel = panelizeWall({ ...teeWall, joints: { tees: [{ x: 98.75, width: 3.5 }] } }, { ...config, tee: 'backer' });
    const studXs = panel.members.filter((m) => m.role === 'stud').map((m) => m.x);
    expect(studXs).not.toContain(95.25);
    expect(studXs).toContain(95.5);
    expect(studXs).toContain(100.5);
    expect(panel.warnings).toEqual([]);
  });

  it('T na zona de abertura: aviso OPENING_AT_TEE, nenhum bloco, double top ainda cortada', () => {
    const wall: Wall = {
      ...teeWall,
      openings: [{ id: 'J1', type: 'window', offset: 100, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } }],
      joints: { tees: [{ x: 96, width: 3.5, wallId: 'W2' }] },
    };
    const panel = panelizeWall(wall, config);
    expect(panel.warnings.map((w) => w.code)).toEqual(['OPENING_AT_TEE']);
    expect(panel.members.filter((m) => m.role === 'block')).toEqual([]);
    expect(panel.members.filter((m) => m.role === 'doubleTopPlate')).toHaveLength(2);
  });

  it('canto California: o stud de layout que sobrepõe o flat sai; flat sobre king fica e STUDS_OVERLAP avisa', () => {
    // 485.5 com canto no fim: flat em 478.5–484 engole o stud de layout 479.25; fechamento 484 só encosta.
    const long = panelizeWall(
      { ...base, id: 'W', length: 485.5, joints: { end: { kind: 'corner', through: true, otherThickness: 5.5 } } },
      config,
    );
    const xs = long.members.filter((m) => m.role === 'stud').map((m) => m.x);
    expect(xs).not.toContain(479.25);
    expect(xs).toContain(478.5);
    expect(xs).toContain(484);
    expect(long.warnings).toEqual([]);

    // Janela a 5.5" da quina: king em 2.5–4 e jack em 4–5.5 caem sobre o flat 1.5–7 — um aviso por par.
    const near = panelizeWall(
      {
        ...base,
        id: 'W',
        length: 146.75,
        openings: [{ id: 'J', type: 'window', offset: 5.5, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } }],
        joints: { start: { kind: 'corner', through: true, otherThickness: 5.5 } },
      },
      config,
    );
    expect(near.members.some((m) => m.role === 'stud' && m.flat === true && m.x === 1.5)).toBe(true);
    expect(near.warnings.map((w) => w.code)).toEqual(['STUDS_OVERLAP', 'STUDS_OVERLAP']);
  });

  it('parede sem joints: painel idêntico ao de antes da S14 (fixtures wall-* inalterados)', () => {
    const panel = panelizeWall({ ...base, id: 'W', length: 144 }, config);
    expect(panel.members.filter((m) => m.role === 'block' || m.flat === true)).toEqual([]);
    expect(panel.members.filter((m) => m.role === 'doubleTopPlate')).toEqual([
      { role: 'doubleTopPlate', section: '2x6', length: 144, x: 0, y: 95.625, orientation: 'horizontal' },
    ]);
  });
});
