import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contraste dos tokens de `globals.css` (docs/10-design.md §8): texto ≥ 4,5:1 (WCAG AA), foco/traço/ícone ≥ 3:1.
 * Os pares são os usos reais do app; mudar um token aqui sem passar no teste é regressão de legibilidade.
 */

const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('@theme inline'));
const tokens = new Map<string, string>();
for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) tokens.set(m[1]!, m[2]!.toLowerCase());

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Cor `fg` a `alpha` sobre `bg` (os chips de status usam fundo a 10 %). */
function blend(fg: string, bg: string, alpha: number): string {
  const f = rgb(fg);
  const g = rgb(bg);
  const c = f.map((v, i) => Math.round(v * alpha + g[i]! * (1 - alpha)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function tok(name: string): string {
  const v = tokens.get(name);
  if (v === undefined) throw new Error(`token --${name} não é hex em globals.css`);
  return v;
}

const TEXT: [string, string, string][] = [
  ['ink', 'paper', 'corpo'],
  ['ink-2', 'paper-2', 'texto secundário em card papel-2'],
  ['ink-3', 'white', 'hints e linhas da lista (12–13px) sobre card'],
  ['ink-3', 'paper', 'legendas sobre a página'],
  ['ink-3', 'paper-2', 'estados vazios sobre papel-2'],
  ['ink-3', 'paper-3', 'texto terciário sobre muted'],
  ['muted-ink', 'paper', 'muted-foreground'],
  ['gold-700', 'paper', 'eyebrow 13px'],
  ['gold-700', 'paper-2', 'eyebrow em card papel-2'],
  ['gold-700', 'gold-100', 'chip de aviso'],
  ['paper', 'navy-900', 'header e botão primário'],
  ['navy-900', 'gold-btn', 'botão accent'],
  ['navy-900', 'gold', 'botão accent em hover'],
  ['paper', 'err', 'contador em err cheio (navegador)'],
  ['navy-600', 'paper-2', 'rótulo da seleção na planta'],
];
const NON_TEXT: [string, string, string][] = [
  ['navy-600', 'paper', 'anel de foco'],
  ['navy-600', 'white', 'anel de foco sobre card'],
  ['gold-600', 'white', 'ícones dourados'],
  ['gold-700', 'paper-2', 'traço de aviso na planta'],
  ['err', 'paper-2', 'traço de problema na planta'],
  ['gold-300', 'navy-900', 'foco sobre navy'],
];

describe('tokens de cor (docs/10-design.md §8)', () => {
  it.each(TEXT)('%s sobre %s ≥ 4,5:1 (%s)', (fg, bg) => {
    expect(contrast(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(NON_TEXT)('%s sobre %s ≥ 3:1 (%s)', (fg, bg) => {
    expect(contrast(tok(fg), tok(bg))).toBeGreaterThanOrEqual(3);
  });
  it('chips claros de status: texto cheio sobre a própria cor a 10 % ≥ 4,5:1', () => {
    expect(contrast(tok('ok-700'), blend(tok('ok'), tok('white'), 0.1))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok('err'), blend(tok('err'), tok('white'), 0.1))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok('navy-900'), blend(tok('navy-600'), tok('white'), 0.08))).toBeGreaterThanOrEqual(4.5);
  });
  it('seleção e aviso não dividem o matiz dourado', () => {
    expect(root).toMatch(/--selection:\s*var\(--navy-600\)/);
    expect(root).toMatch(/--warning:\s*var\(--gold-700\)/);
    expect(root).toMatch(/--ring:\s*var\(--navy-600\)/);
  });
  it('tokens usados por classe utilitária existem no @theme', () => {
    const theme = css.slice(css.indexOf('@theme inline'));
    for (const name of ['line', 'line-faint', 'line-strong', 'gold-btn', 'gold-700', 'ok', 'ok-700', 'err', 'selection']) {
      expect(theme, `--color-${name}`).toContain(`--color-${name}:`);
    }
  });
});
