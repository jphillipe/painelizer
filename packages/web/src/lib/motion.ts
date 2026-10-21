/**
 * Movimento (docs/10-design.md §2, M4): a curva do site (`cubic-bezier(.22,.61,.2,1)`) para animações feitas em
 * JS (viewport da planta) e a consulta a `prefers-reduced-motion`, que em JS vira "pula para o fim". Puro,
 * salvo `prefersReducedMotion`, que lê `window.matchMedia` quando existe.
 */

export const VIEWPORT_ANIMATION_MS = 250;

/** Função y(x) de uma curva cubic-bezier CSS (x1, y1, x2, y2), resolvida por Newton + bissecção. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sampleX = (u: number): number => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number): number => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number): number => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x: number): number => {
    let u = x;
    for (let i = 0; i < 8; i += 1) {
      const dx = sampleX(u) - x;
      if (Math.abs(dx) < 1e-6) return u;
      const d = slopeX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= dx / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    while (hi - lo > 1e-6) {
      u = (lo + hi) / 2;
      if (sampleX(u) < x) lo = u;
      else hi = u;
    }
    return u;
  };
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solve(t));
  };
}

/** `--ease-site` de globals.css. */
export const easeSite = cubicBezier(0.22, 0.61, 0.2, 1);

/** O humano pediu menos movimento ao sistema: animações em JS pulam para o fim. Sem `window` (SSR, testes) = não. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
