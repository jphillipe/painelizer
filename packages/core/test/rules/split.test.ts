import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_CONFIG, type Config, type Panel, type PanelConfig, type Wall } from '../../src/types';
import { panelizeWall, planOpenings } from '../../src/panelize/panelizeWall';
import { teeStrips } from '../../src/rules/corners';
import {
  breakCandidates,
  chooseBreaks,
  lapEnd,
  layoutMarks,
  memberSpan,
  splicePlates,
  validatePanelConfig,
} from '../../src/rules/split';
import { expectSameMembers, type MemberKeyFields } from '../helpers/members';
import split480 from '../fixtures/wall-480-split.json';
import spliced240 from '../fixtures/wall-240-spliced.json';

const config = split480.config as Config;
const cfg: PanelConfig = { ...DEFAULT_PANEL_CONFIG };
const wall480 = split480.wall as Wall;
const marks16 = (c: number) => Math.abs(c / 48 - Math.round(c / 48)) < 1e-9;
const every16 = (upTo: number) => Array.from({ length: Math.floor(upTo / 16) }, (_, i) => (i + 1) * 16);

function candidatesOf(wall: Wall, cfgOverride: Partial<Config> = {}): number[] {
  const c = { ...config, ...cfgOverride };
  const panel = panelizeWall(wall, c);
  const { plan } = planOpenings(wall, c);
  return breakCandidates(panel, c, { zones: plan.zones, strips: teeStrips(wall.joints) });
}

describe('validatePanelConfig', () => {
  it('default passa; medida ≤ 0, não finita, peso ≤ 0 ou minLap > lap são RangeError', () => {
    expect(() => validatePanelConfig(DEFAULT_PANEL_CONFIG)).not.toThrow();
    expect(() => validatePanelConfig({ ...cfg, maxLength: 0 })).toThrow(RangeError);
    expect(() => validatePanelConfig({ ...cfg, module: Number.NaN })).toThrow(RangeError);
    expect(() => validatePanelConfig({ ...cfg, maxWeight: 0 })).toThrow(RangeError);
    expect(() => validatePanelConfig({ ...cfg, minLap: 60 })).toThrow(/minLap/);
  });
});

describe('memberSpan', () => {
  it('vertical em pé ocupa 1.5; flat ocupa a profundidade; horizontal ocupa o comprimento', () => {
    expect(memberSpan({ role: 'stud', section: '2x6', length: 92.625, x: 10, y: 1.5, orientation: 'vertical' })).toEqual({ lo: 10, hi: 11.5 });
    expect(memberSpan({ role: 'stud', section: '2x6', length: 92.625, x: 1.5, y: 1.5, orientation: 'vertical', flat: true })).toEqual({ lo: 1.5, hi: 7 });
    expect(memberSpan({ role: 'header', section: '2x10', length: 41, x: 165, y: 82.5, orientation: 'horizontal' })).toEqual({ lo: 165, hi: 206 });
  });
});

describe('breakCandidates', () => {
  it('wall-480: toda marca de 16" menos as da zona da porta (176–208) e da janela (336–368)', () => {
    const excluded = new Set([176, 192, 208, 336, 352, 368]);
    expect(candidatesOf(wall480)).toEqual(every16(464).filter((c) => !excluded.has(c)));
  });

  it('parede lisa: marcas de 16 a comprimento − 16; o stud de ponta e o de fechamento nunca são candidatos', () => {
    const plain: Wall = { ...wall480, length: 144, openings: [] };
    expect(candidatesOf(plain)).toEqual([16, 32, 48, 64, 80, 96, 112, 128]);
  });

  it('origem de layout deslocada: as marcas seguem a origem (−5.5 → 10.5, 26.5…)', () => {
    const plain: Wall = { ...wall480, length: 117.25, openings: [], layoutOrigin: -5.5 };
    expect(candidatesOf(plain)).toEqual([10.5, 26.5, 42.5, 58.5, 74.5, 90.5, 106.5]);
  });

  it('stud extra, stud de canto (flat) e faixa de T a menos de 1.5" do stud da marca tiram a marca', () => {
    const plain: Wall = { ...wall480, length: 144, openings: [] };
    // extra em 49 toca a faixa [46.5, 49.5] do stud da marca 48; em 50 não.
    expect(candidatesOf({ ...plain, extraStuds: [{ x: 49 }] })).not.toContain(48);
    expect(candidatesOf({ ...plain, extraStuds: [{ x: 50 }] })).toContain(48);
    // canto California no início: flat 1.5–7 não alcança a marca 16 ([14.5, 17.5]).
    const corner: Wall = { ...plain, joints: { start: { kind: 'corner', through: true, otherThickness: 5.5 } } };
    expect(candidatesOf(corner)).toContain(16);
    // T em 48 (faixa 46.25–49.75): a marca 48 sai pela faixa e as vizinhas 32 e 64 pelos blocos do ladder.
    const tee: Wall = { ...plain, joints: { tees: [{ x: 48, width: 3.5 }] } };
    expect(candidatesOf(tee)).toEqual([16, 80, 96, 112, 128]);
  });

  it('marca a menos de 2t da ponta não é candidata', () => {
    const panel: Panel = {
      id: 'x', wallId: 'x', length: 20, height: 97.125, section: '2x6', fieldCuts: [], warnings: [], layoutOrigin: 0,
      members: [
        { role: 'stud', section: '2x6', length: 92.625, x: 0, y: 1.5, orientation: 'vertical' },
        // stud da marca 16: faixa [14.5, 17.5] passa de 20 − 3 = 17 → fora.
        { role: 'stud', section: '2x6', length: 92.625, x: 15.25, y: 1.5, orientation: 'vertical' },
        { role: 'stud', section: '2x6', length: 92.625, x: 18.5, y: 1.5, orientation: 'vertical' },
      ],
    };
    expect(breakCandidates(panel, config, { zones: [], strips: [] })).toEqual([]);
  });
});

describe('chooseBreaks (hipótese P35: equilibrado, módulo de 48 preferido)', () => {
  const choose = (length: number, candidates: number[], over: Partial<PanelConfig> = {}, weightOf?: (a: number, b: number) => number) =>
    chooseBreaks({ length, candidates, isModule: marks16, wallId: 'W', ...(weightOf === undefined ? {} : { weightOf }) }, { ...cfg, ...over });

  it('parede que cabe no máximo não quebra', () => {
    expect(choose(240, every16(224))).toEqual([]);
    expect(choose(100, [])).toEqual([]);
  });

  it('480: dois painéis de 240, quebra na marca 240 (múltipla de 48)', () => {
    expect(choose(480, every16(464))).toEqual([240]);
  });

  it('485.5: três painéis; entre as divisões com o maior painel de 192 ganha a mais próxima dos terços', () => {
    // 144/336 → 144, 192, 149.5 (desvio 30.1); 192/336 → 192, 144, 149.5 (desvio 42.5); 192/384 → 192, 192, 101.5.
    expect(choose(485.5, every16(480))).toEqual([144, 336]);
  });

  it('300: marca múltipla de 48 (144 → 144 + 156) vence a marca qualquer que equilibraria melhor (160)', () => {
    expect(choose(300, every16(288))).toEqual([144]);
  });

  it('sem marca múltipla de 48 que sirva, qualquer marca serve', () => {
    expect(choose(300, [100, 160])).toEqual([160]);
  });

  it('peso: trecho acima de maxWeight não serve; a divisão cresce até caber', () => {
    // 2 lb por polegada: 300" pesam 600; com máximo 300 por painel, cada trecho ≤ 150 → 96 + 96 + 108.
    expect(choose(300, every16(288), { maxWeight: 300 }, (a, b) => (b - a) * 2)).toEqual([96, 192]);
    // Sem weightOf o peso é ignorado.
    expect(choose(300, every16(288), { maxWeight: 300 })).toEqual([144]);
  });

  it('sem candidato ao alcance: RangeError com a parede e o trecho', () => {
    expect(() => choose(480, [])).toThrow(/parede W: não há como dividir 480" em painéis de até 240".*entre x=0 e x=240/);
    expect(() => choose(600, [100, 200])).toThrow(/entre x=200 e x=440/);
  });
});

describe('layoutMarks', () => {
  it('marcas de 0 a length, a partir da origem', () => {
    expect(layoutMarks(64, 16, 0)).toEqual([0, 16, 32, 48, 64]);
    expect(layoutMarks(117.25, 16, -5.5)).toEqual([10.5, 26.5, 42.5, 58.5, 74.5, 90.5, 106.5]);
  });
});

describe('lapEnd (hipótese P23)', () => {
  const marks = layoutMarks(480, 16, 0);

  it('sem obstáculo: b + 48; se não cabe até o limite, b + 24; se nem isso, erro', () => {
    expect(lapEnd(240, 480, cfg, [], marks)).toBe(288);
    expect(lapEnd(100, 130, cfg, [], marks)).toBe(124);
    expect(() => lapEnd(100, 120, cfg, [], marks)).toThrow(/x=120.*24"/);
  });

  it('fim dentro de um header: encurta para 24; se ainda cai, vai à primeira marca depois do obstáculo', () => {
    const header = { lo: 140, hi: 160, what: 'o header' };
    expect(lapEnd(100, 480, cfg, [header], marks)).toBe(124);
    const wide = { lo: 120, hi: 150, what: 'o header' };
    expect(lapEnd(100, 480, cfg, [wide], marks)).toBe(160);
    // Encostar no obstáculo não é estar dentro.
    expect(lapEnd(100, 480, cfg, [{ lo: 148, hi: 170, what: 'o header' }], marks)).toBe(148);
  });

  it('obstáculo até o limite: erro nomeando o obstáculo', () => {
    expect(() => lapEnd(100, 155, cfg, [{ lo: 120, hi: 150, what: 'a faixa do T' }], marks)).toThrow(/a faixa do T ocupa 120–150/);
  });
});

describe('splicePlates (P14)', () => {
  const wall240 = spliced240.wall as Wall;
  const whole = panelizeWall(wall240, config);

  it('wall-240: top 192 + 48, double top 144 + 96 (≥ 48 da emenda da top e das pontas), bottom 192 + 48', () => {
    const spliced = splicePlates(whole, [96, 120, 144, 168, 192], cfg);
    expectSameMembers(spliced.members, spliced240.expected.panels[0]!.members as MemberKeyFields[]);
    expect(spliced.members).toHaveLength(22);
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
    expect(() => splicePlates(bare, [192], cfg)).toThrow(/topPlate de 240".*não há stud/);
  });
});
