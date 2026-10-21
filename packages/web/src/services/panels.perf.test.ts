import { describe, expect, it, vi } from 'vitest';
import { textFromDraft } from '@/lib/editor/draft';
import { syntheticHouse } from '@/lib/editor/perf.test';

vi.mock('server-only', () => ({}));
const { check, generate } = await import('./panels.service');

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
function time(fn: () => void, runs = 5): number {
  const t: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return median(t);
}

/** A checagem com debounce (M8) não pode pagar as folhas SVG: só painéis e avisos. */
describe('check vs generate (M8)', () => {
  const text = textFromDraft(syntheticHouse(8, 5));
  it('check devolve os mesmos painéis e avisos do generate, em bem menos tempo', () => {
    const g = generate(text);
    const c = check(text);
    if (!g.ok) console.log('[perf problems]', g.problems.slice(0, 5));
    expect(c.ok && g.ok).toBe(true);
    if (!c.ok || !g.ok) return;
    expect(c.panels).toEqual(g.panels);
    expect(c.warnings).toEqual(g.warnings);
    const tGenerate = time(() => generate(text));
    const tCheck = time(() => check(text));
    // eslint-disable-next-line no-console
    console.log(`[perf] ${g.panels.length} panels · generate ${tGenerate.toFixed(0)} ms · check ${tCheck.toFixed(0)} ms`);
    expect(tCheck).toBeLessThan(tGenerate);
  });
});
