import { describe, expect, it } from 'vitest';
import { formatFeetInches } from 'core';
import { formatMeasure, formatPoint, parseMeasureText } from './measure';

describe('parseMeasureText', () => {
  it('pés-pol, polegadas, fração, vazio', () => {
    expect(parseMeasureText(`12'-6 1/2"`)).toEqual({ ok: true, value: 150.5 });
    expect(parseMeasureText('150.5')).toEqual({ ok: true, value: 150.5 });
    expect(parseMeasureText(` 92 5/8" `)).toEqual({ ok: true, value: 92.625 });
    expect(parseMeasureText("29' - 0\"")).toEqual({ ok: true, value: 348 });
    expect(parseMeasureText('')).toEqual({ ok: true, value: undefined });
    expect(parseMeasureText('   ')).toEqual({ ok: true, value: undefined });
  });

  it('sinal só quando permitido', () => {
    expect(parseMeasureText("-1'-0\"", { signed: true })).toEqual({ ok: true, value: -12 });
    expect(parseMeasureText('−5.5', { signed: true })).toEqual({ ok: true, value: -5.5 });
    expect(parseMeasureText('-5.5')).toMatchObject({ ok: false, message: 'Must be zero or more' });
  });

  it('texto inválido', () => {
    expect(parseMeasureText('9 ft')).toMatchObject({ ok: false });
    expect(parseMeasureText('abc')).toMatchObject({ ok: false });
  });
});

describe('formatMeasure', () => {
  it('igual ao core, com sinal e vazio', () => {
    expect(formatMeasure(150.5)).toBe(formatFeetInches(150.5));
    expect(formatMeasure(-5.5)).toBe(`-5 1/2"`);
    expect(formatMeasure(0)).toBe('0"');
    expect(formatMeasure(undefined)).toBe('');
    expect(formatPoint({ x: 144, y: -12 })).toBe(`(12'-0", -1'-0")`);
  });
});
