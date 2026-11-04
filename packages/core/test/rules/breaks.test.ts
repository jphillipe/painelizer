import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_CONFIG, type Config, type Panel, type PanelConfig, type Wall } from '../../src/types';
import { framePanel } from '../../src/panelize/panelizeWall';
import { teeStrips } from '../../src/rules/corners';
import { breakCandidates, chooseBreaks, validatePanelConfig } from '../../src/rules/breaks';
import split480Json from '../fixtures/wall-480-split.json';
import { wallFixture } from '../helpers/fixtures';

const split480 = wallFixture(split480Json);

const config = split480.config;
const cfg: PanelConfig = { ...DEFAULT_PANEL_CONFIG };
const wall480 = split480.wall;
const marks16 = (c: number) => Math.abs(c / 48 - Math.round(c / 48)) < 1e-9;
const every16 = (upTo: number) => Array.from({ length: Math.floor(upTo / 16) }, (_, i) => (i + 1) * 16);

function candidatesOf(wall: Wall, cfgOverride: Partial<Config> = {}): number[] {
  const c = { ...config, ...cfgOverride };
  const { panel, plan } = framePanel(wall, c);
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
    const panel: Pick<Panel, 'members' | 'length' | 'layoutOrigin'> = {
      length: 20,
      layoutOrigin: 0,
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
