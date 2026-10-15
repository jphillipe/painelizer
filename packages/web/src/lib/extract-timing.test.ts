import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTRACT_MS,
  DURATIONS_KEY,
  KEEP_DURATIONS,
  expectedWait,
  formatClock,
  formatMinutes,
  readDurations,
  recordDuration,
  waitFraction,
} from './extract-timing';

function memoryStore(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[DURATIONS_KEY, initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('extract-timing', () => {
  it('sem histórico a espera é o default', () => {
    expect(readDurations(memoryStore())).toEqual([]);
    expect(expectedWait([])).toEqual({ ms: DEFAULT_EXTRACT_MS, samples: 0 });
  });

  it('média das leituras gravadas, só as mais novas', () => {
    const store = memoryStore();
    for (let i = 1; i <= KEEP_DURATIONS + 2; i++) recordDuration(i * 60_000, store);
    const d = readDurations(store);
    expect(d).toHaveLength(KEEP_DURATIONS);
    expect(d[0]).toBe(3 * 60_000);
    expect(expectedWait([6 * 60_000, 10 * 60_000])).toEqual({ ms: 8 * 60_000, samples: 2 });
  });

  it('ignora lixo, valor inválido e storage que falha', () => {
    expect(readDurations(memoryStore('not json'))).toEqual([]);
    expect(readDurations(memoryStore('[1000, "x", -5, null]'))).toEqual([1000]);
    expect(readDurations(undefined)).toEqual([]);
    const store = memoryStore();
    recordDuration(Number.NaN, store);
    recordDuration(0, store);
    expect(readDurations(store)).toEqual([]);
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => recordDuration(1000, broken)).not.toThrow();
  });

  it('formatos', () => {
    expect(formatClock(7_400)).toBe('0:07');
    expect(formatClock(12 * 60_000 + 5_000)).toBe('12:05');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(-1)).toBe('0:00');
    expect(formatMinutes(20_000)).toBe('under 1 min');
    expect(formatMinutes(11.6 * 60_000)).toBe('12 min');
  });

  it('a barra para em 95% e nunca passa', () => {
    expect(waitFraction(0, 1000)).toBe(0);
    expect(waitFraction(500, 1000)).toBeCloseTo(0.475);
    expect(waitFraction(5000, 1000)).toBe(0.95);
    expect(waitFraction(10, 0)).toBe(0.95);
  });
});
