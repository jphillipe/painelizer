import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_CONFIG, type Panel, type PanelConfig } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splicePlates, supportCenters } from '../../src/rules/splice';
import { expectSameMembers, type MemberKeyFields } from '../helpers/members';
import split480Json from '../fixtures/wall-480-split.json';
import spliced240Json from '../fixtures/wall-240-spliced.json';
import { wallFixture } from '../helpers/fixtures';

const split480 = wallFixture(split480Json);
const spliced240 = wallFixture(spliced240Json);

const config = split480.config;
const cfg: PanelConfig = { ...DEFAULT_PANEL_CONFIG };

describe('splicePlates (P14)', () => {
  const wall240 = spliced240.wall;
  const whole = panelizeWall(wall240, config);

  it('wall-240: top 192 + 48, double top 144 + 96 (≥ 48 da emenda da top e das pontas), bottom 192 + 48', () => {
    const spliced = splicePlates(whole, [96, 120, 144, 168, 192], cfg);
    expectSameMembers(spliced.members, spliced240.expected.panels[0]!.members as MemberKeyFields[]);
    expect(spliced.members).toHaveLength(22);
  });

  it('supportCenters: centros dos studs e kings em pé, crescentes (stud flat e demais peças fora)', () => {
    expect(supportCenters(whole.members)).toEqual(whole.members.filter((m) => m.role === 'stud').map((m) => m.x + 0.75).sort((a, b) => a - b));
    const flat = { role: 'stud' as const, section: '2x6' as const, length: 92.625, x: 1.5, y: 1.5, orientation: 'vertical' as const, flat: true };
    const king = { role: 'kingStud' as const, section: '2x6' as const, length: 92.625, x: 40, y: 1.5, orientation: 'vertical' as const };
    const jack = { role: 'jackStud' as const, section: '2x6' as const, length: 80, x: 41.5, y: 1.5, orientation: 'vertical' as const };
    expect(supportCenters([king, flat, jack])).toEqual([40.75]);
  });

  it('nada acima do estoque: devolve o mesmo painel', () => {
    expect(splicePlates(whole, [240], cfg)).toBe(whole);
  });

  it('cada corte fica sobre o centro de um stud', () => {
    const spliced = splicePlates(whole, [96, 120, 144, 168, 192], cfg);
    const centers = spliced.members.filter((m) => m.role === 'stud').map((m) => m.x + 0.75);
    const joints = spliced.members
      .filter((m) => m.role === 'bottomPlate' || m.role === 'topPlate' || m.role === 'doubleTopPlate')
      .filter((m) => m.x > 0)
      .map((m) => m.x);
    expect(joints).toEqual([192, 192, 144]);
    for (const j of joints) expect(centers).toContain(j);
  });

  it("estoque maior (ex.: 20') dispensa a emenda; estoque vazio ou inválido é RangeError", () => {
    expect(splicePlates(whole, [240], cfg).members).toHaveLength(19);
    expect(() => splicePlates(whole, [], cfg)).toThrow(RangeError);
    expect(() => splicePlates(whole, [0], cfg)).toThrow(RangeError);
  });

  it('sem stud onde emendar com a defasagem mínima: RangeError nomeando a plate', () => {
    // Painel sem studs no meio: só o de ponta e o de fechamento.
    const bare: Panel = {
      ...whole,
      members: whole.members.filter((m) => m.role !== 'stud' || m.x === 0 || m.x === 238.5),
    };
    expect(() => splicePlates(bare, [192], cfg)).toThrow(/topPlate of 240".*no stud between/);
  });
});
