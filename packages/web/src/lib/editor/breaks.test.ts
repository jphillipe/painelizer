import { describe, expect, it } from 'vitest';
import {
  breaksByWall,
  movedBreak,
  panelLengths,
  shownBreaks,
  snapBreak,
  suggestBreak,
  withBreak,
  withoutBreak,
} from './breaks';

const info = { wallId: 'W1', breaks: [240], candidates: [16, 32, 160, 224, 240, 320], manual: false };

describe('quebras no editor (S29)', () => {
  it('breaksByWall: por id; sem resultado ou sem walls, vazio', () => {
    expect(breaksByWall({ ok: false, problems: [], walls: [info] }).get('W1')).toBe(info);
    expect(breaksByWall(undefined).size).toBe(0);
    expect(breaksByWall({ ok: false, problems: [] }).size).toBe(0);
  });

  it('shownBreaks: as do draft valem sobre as do motor; sem nenhuma, vazio', () => {
    expect(shownBreaks({}, info)).toEqual({ breaks: [240], manual: false, candidates: info.candidates });
    expect(shownBreaks({ panelBreaks: [160, 320] }, info)).toEqual({
      breaks: [160, 320],
      manual: true,
      candidates: info.candidates,
    });
    expect(shownBreaks({ panelBreaks: [] }, undefined)).toEqual({ breaks: [], manual: true, candidates: [] });
    expect(shownBreaks({}, undefined)).toEqual({ breaks: [], manual: false, candidates: [] });
  });

  it('snapBreak: candidato mais próximo; sem candidatos, o passo', () => {
    expect(snapBreak(170, info.candidates, 1)).toBe(160);
    expect(snapBreak(300, info.candidates, 1)).toBe(320);
    expect(snapBreak(170.4, [], 1)).toBe(170);
    expect(snapBreak(170.4, [], 0.125)).toBe(170.375);
  });

  it('mover, acrescentar e tirar: lista ordenada e sem repetição', () => {
    expect(movedBreak([160, 320], 0, 400)).toEqual([320, 400]);
    expect(movedBreak([160, 320], 0, 320)).toEqual([320]);
    expect(withBreak([320], 160)).toEqual([160, 320]);
    expect(withBreak([160], 160)).toEqual([160]);
    expect(withoutBreak([160, 320], 0)).toEqual([320]);
  });

  it('suggestBreak: candidato livre mais perto do meio do trecho mais longo', () => {
    // Dois trechos de 240: empate; o primeiro, com 160 a 40 do meio (120).
    expect(suggestBreak(480, [240], info.candidates)).toBe(160);
    expect(suggestBreak(480, [160], info.candidates)).toBe(320);
    expect(suggestBreak(480, [], info.candidates)).toBe(240);
    expect(suggestBreak(480, [16, 32, 160, 224, 240, 320], info.candidates)).toBeUndefined();
  });

  it('panelLengths', () => {
    expect(panelLengths(480, [160, 320])).toEqual([160, 160, 160]);
    expect(panelLengths(100, [])).toEqual([100]);
  });
});
