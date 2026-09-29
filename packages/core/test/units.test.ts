import { describe, expect, it } from 'vitest';
import { formatFeetInches, formatInches, parseFeetInches } from '../src/units';

describe('parseFeetInches', () => {
  it.each([
    ['0"', 0],
    ['0', 0],
    ['1 1/2"', 1.5],
    ['1/2"', 0.5],
    ['36"', 36],
    ["3'", 36],
    ["3'-0\"", 36],
    ['92 5/8"', 92.625],
    ["7'-8 5/8\"", 92.625],
    ["8'-1 1/8\"", 97.125],
    ["8' 1 1/8\"", 97.125],
    ["8'-1-1/8\"", 97.125],
    ['144"', 144],
    ["12'", 144],
    ["12'-0\"", 144],
    ['92.625', 92.625],
    ['92.625"', 92.625],
    ["  12' - 0 \" ", 144],
    ['11 15/16"', 11.9375],
  ])('%s → %d', (input, expected) => {
    expect(parseFeetInches(input)).toBe(expected);
  });

  it.each(['', '"', "'", 'abc', "12'-\"", '1/0"', '-3"'])('rejeita %s', (input) => {
    expect(() => parseFeetInches(input)).toThrow(RangeError);
  });
});

describe('formatFeetInches', () => {
  it.each([
    [0, '0"'],
    [1.5, '1 1/2"'],
    [36, "3'-0\""],
    [92.625, "7'-8 5/8\""],
    [97.125, "8'-1 1/8\""],
    [144, "12'-0\""],
    [0.5, '1/2"'],
    [11.9375, '11 15/16"'],
    [12.0625, "1'-0 1/16\""],
  ])('%d → %s', (input, expected) => {
    expect(formatFeetInches(input)).toBe(expected);
  });

  it('arredonda para o 1/16" mais próximo, com vai-um', () => {
    expect(formatFeetInches(0.03)).toBe('0"');
    expect(formatFeetInches(0.04)).toBe('1/16"');
    expect(formatFeetInches(11.99)).toBe("1'-0\"");
    expect(formatFeetInches(143.97)).toBe("12'-0\"");
  });

  it('reduz a fração', () => {
    expect(formatFeetInches(0.25)).toBe('1/4"');
    expect(formatFeetInches(0.75)).toBe('3/4"');
    expect(formatFeetInches(0.125)).toBe('1/8"');
  });

  it('rejeita negativo e não finito', () => {
    expect(() => formatFeetInches(-1)).toThrow(RangeError);
    expect(() => formatFeetInches(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatInches', () => {
  it.each([
    [0, '0"'],
    [1.5, '1 1/2"'],
    [36, '36"'],
    [92.625, '92 5/8"'],
    [97.125, '97 1/8"'],
    [144, '144"'],
    [83.375, '83 3/8"'],
  ])('%d → %s', (input, expected) => {
    expect(formatInches(input)).toBe(expected);
  });
});

describe('ida e volta', () => {
  it.each([0, 1.5, 36, 92.625, 97.125, 144, 83.375, 33.875, 0.0625])('%d', (n) => {
    expect(parseFeetInches(formatFeetInches(n))).toBe(n);
    expect(parseFeetInches(formatInches(n))).toBe(n);
  });
});
