import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_CONFIG, type Config, type Panel, type PanelConfig, type Wall } from '../../src/types';
import { framePanel } from '../../src/panelize/panelizeWall';
import { teeStrips } from '../../src/rules/corners';
import { breakCandidates, chooseBreaks, forcedBreaks, validatePanelConfig, whyNotBreak } from '../../src/rules/breaks';
import { EngineError } from '../../src/messages';
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

describe('whyNotBreak (S29: motivo de recusa da quebra forçada)', () => {
  const why = (x: number, wall: Wall = wall480) => {
    const { panel, plan } = framePanel(wall, config);
    return whyNotBreak(x, panel, config, { zones: plan.zones, strips: teeStrips(wall.joints) });
  };

  it('candidato → undefined; o mesmo critério de breakCandidates', () => {
    for (const c of candidatesOf(wall480)) expect(why(c), String(c)).toBeUndefined();
    expect(why(160)).toBeUndefined();
    expect(why(320)).toBeUndefined();
  });

  it('ponta: a faixa da junta tem de ficar a ≥ 2t das pontas (fora da parede também)', () => {
    expect(why(3)).toEqual({ reason: 'end', min: 4.5, length: 480 });
    expect(why(478)).toMatchObject({ reason: 'end' });
    expect(why(-16)).toMatchObject({ reason: 'end' });
    expect(why(600)).toMatchObject({ reason: 'end' });
  });

  it('abertura: a zona fundida (king a king) com os ids', () => {
    expect(why(192)).toEqual({ reason: 'opening', openingIds: ['P1'], start: 165, end: 209 });
    // 208 é marca, mas a faixa [206.5, 209.5] toca a zona da porta.
    expect(why(208)).toMatchObject({ reason: 'opening', openingIds: ['P1'] });
    expect(why(352)).toMatchObject({ reason: 'opening', openingIds: ['J1'] });
  });

  it('T: a faixa da parede que encosta', () => {
    const tee: Wall = { ...wall480, openings: [], joints: { tees: [{ x: 48, width: 3.5, wallId: 'W9' }] } };
    expect(why(48, tee)).toEqual({ reason: 'tee', lo: 46.25, hi: 49.75, teeWallId: 'W9' });
    // Marca vizinha ao T: o bloco do ladder encosta no stud.
    expect(why(32, tee)).toMatchObject({ reason: 'member', role: 'block' });
  });

  it('marca: fora de origem + k·16 não é centro de stud de layout', () => {
    expect(why(150)).toEqual({ reason: 'mark', spacing: 16 });
    expect(why(240.5)).toMatchObject({ reason: 'mark' });
  });

  it('peça: stud extra na faixa da junta', () => {
    const extra: Wall = { ...wall480, openings: [], extraStuds: [{ x: 49 }] };
    expect(why(48, extra)).toEqual({ reason: 'member', role: 'stud', memberX: 49 });
  });
});

describe('forcedBreaks (S29: lista completa do revisor)', () => {
  const reject = (x: number) => (x === 192 ? ({ reason: 'opening', openingIds: ['P1'], start: 165, end: 209 } as const) : undefined);
  const forced = (list: number[], length = 480) => forcedBreaks(list, { length, reject, wallId: 'W' }, cfg);
  const codeOf = (f: () => unknown): unknown => {
    try {
      f();
    } catch (e) {
      return e instanceof EngineError ? { code: e.code, ...e.params } : e;
    }
    return undefined;
  };

  it('válida: devolve como veio; [] = um painel só quando cabe', () => {
    expect(forced([160, 320])).toEqual([160, 320]);
    expect(forced([240])).toEqual([240]);
    expect(forced([], 200)).toEqual([]);
  });

  it('ordem: decrescente ou repetida é PANEL_BREAK_INVALID order, antes do resto', () => {
    expect(codeOf(() => forced([320, 160]))).toEqual({ code: 'PANEL_BREAK_INVALID', at: 160, reason: 'order' });
    expect(codeOf(() => forced([160, 160]))).toMatchObject({ reason: 'order' });
    expect(codeOf(() => forced([320, 192]))).toMatchObject({ reason: 'order' });
  });

  it('recusa: o motivo de whyNotBreak vai nos parâmetros; frase em português com a parede', () => {
    expect(codeOf(() => forced([192, 320]))).toEqual({
      code: 'PANEL_BREAK_INVALID',
      at: 192,
      reason: 'opening',
      openingIds: ['P1'],
      start: 165,
      end: 209,
    });
    expect(() => forced([192, 320])).toThrow(/parede W: quebra de painel em x=192 \(panelBreaks\): cai na zona da\(s\) abertura\(s\) P1 \[165, 209\]/);
  });

  it('trecho acima de maxLength: PANEL_TOO_LONG com o trecho', () => {
    expect(codeOf(() => forced([]))).toEqual({ code: 'PANEL_TOO_LONG', from: 0, to: 480, length: 480, maxLength: 240 });
    expect(codeOf(() => forced([224]))).toMatchObject({ code: 'PANEL_TOO_LONG', from: 224, to: 480, length: 256 });
    expect(() => forced([224])).toThrow(/painel de x=224 a x=480 \(256"\) passa do máximo de 240"/);
  });

  it('não finita: VALUE_INVALID', () => {
    expect(codeOf(() => forced([Number.NaN]))).toMatchObject({ code: 'VALUE_INVALID', field: 'panelBreaks' });
  });
});
