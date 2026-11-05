import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_CONFIG, type PanelConfig } from '../../src/types';
import { lapEnd } from '../../src/rules/laps';
import { layoutMarks } from '../../src/rules/studs';

const cfg: PanelConfig = { ...DEFAULT_PANEL_CONFIG };

describe('lapEnd (hipótese P23)', () => {
  const marks = layoutMarks(480, 16, 0);

  it('sem obstáculo: b + 48; se não cabe até o limite, b + 24; se nem isso, erro', () => {
    expect(lapEnd(240, 480, cfg, [], marks)).toBe(288);
    expect(lapEnd(100, 130, cfg, [], marks)).toBe(124);
    expect(() => lapEnd(100, 120, cfg, [], marks)).toThrow(/x=120.*24"/);
  });

  it('fim dentro de um header: encurta para 24; se ainda cai, vai à primeira marca depois do obstáculo', () => {
    const header = { lo: 140, hi: 160, kind: 'header' as const, x: 140 };
    expect(lapEnd(100, 480, cfg, [header], marks)).toBe(124);
    const wide = { lo: 120, hi: 150, kind: 'header' as const, x: 120 };
    expect(lapEnd(100, 480, cfg, [wide], marks)).toBe(160);
    // Encostar no obstáculo não é estar dentro.
    expect(lapEnd(100, 480, cfg, [{ lo: 148, hi: 170, kind: 'header' as const, x: 148 }], marks)).toBe(148);
  });

  it('apoio que não é marca (centro de king) logo depois do obstáculo serve; não pula o header seguinte (P37)', () => {
    // S1 do Ringgold em escala: quebra 144, header da porta 152–193, king em 193.75, header do par 198.25–259.75
    const headers = [
      { lo: 152, hi: 193, kind: 'header' as const, x: 152 },
      { lo: 198.25, hi: 259.75, kind: 'header' as const, x: 198.25 },
    ];
    expect(lapEnd(144, 336, cfg, headers, marks)).toBe(272);
    const withKings = [...marks, 151.25, 193.75, 196, 260.5].sort((a, b) => a - b);
    expect(lapEnd(144, 336, cfg, headers, withKings)).toBe(193.75);
  });

  it('obstáculo até o limite: erro nomeando o obstáculo', () => {
    expect(() => lapEnd(100, 155, cfg, [{ lo: 120, hi: 150, kind: 'tee' as const }], marks)).toThrow(/the tee strip takes 120–150/);
  });
});
