/**
 * Primitivos de desenho comuns à folha do painel e à planta (S28.1): números em px, escape de XML, cores e
 * cotas. Saída determinística: mesma entrada, mesma string.
 */

export const STROKE = '#5a4632';
export const DIM = '#1f4e79';
export const FIELD_CUT = '#c0392b';
export const LABEL = '#000';
export const MUTED = '#666';
export const FONT = 'Helvetica, Arial, sans-serif';

/** Número em px com até 3 decimais, sem ruído de ponto flutuante nem "-0". */
export function px(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
}

/** Escapa texto para conteúdo/atributo XML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Cota horizontal em `y`, com linhas de chamada subindo até `fromY`. Usada pela folha e pela planta (S16). */
export function dimensionH(x1: number, x2: number, y: number, fromY: number, label: string): string {
  const mid = (x1 + x2) / 2;
  return [
    `<g class="dim dim-length" stroke="${DIM}" stroke-width="0.75" fill="none">`,
    `<line x1="${px(x1)}" y1="${px(fromY)}" x2="${px(x1)}" y2="${px(y + 4)}"/>`,
    `<line x1="${px(x2)}" y1="${px(fromY)}" x2="${px(x2)}" y2="${px(y + 4)}"/>`,
    `<line x1="${px(x1)}" y1="${px(y)}" x2="${px(x2)}" y2="${px(y)}"/>`,
    tickSlash(x1, y),
    tickSlash(x2, y),
    '</g>',
    `<text x="${px(mid)}" y="${px(y - 4)}" font-size="12" fill="${DIM}" text-anchor="middle">${esc(label)}</text>`,
  ].join('\n');
}

/** Cota vertical em `x`, com linhas de chamada indo até `fromX`. Usada pela folha e pela planta (S16). */
export function dimensionV(x: number, y1: number, y2: number, fromX: number, label: string): string {
  const mid = (y1 + y2) / 2;
  return [
    `<g class="dim dim-height" stroke="${DIM}" stroke-width="0.75" fill="none">`,
    `<line x1="${px(fromX)}" y1="${px(y1)}" x2="${px(x - 4)}" y2="${px(y1)}"/>`,
    `<line x1="${px(fromX)}" y1="${px(y2)}" x2="${px(x - 4)}" y2="${px(y2)}"/>`,
    `<line x1="${px(x)}" y1="${px(y1)}" x2="${px(x)}" y2="${px(y2)}"/>`,
    tickSlash(x, y1),
    tickSlash(x, y2),
    '</g>',
    `<text x="${px(x - 4)}" y="${px(mid)}" font-size="12" fill="${DIM}" text-anchor="middle" ` +
      `transform="rotate(-90 ${px(x - 4)} ${px(mid)})">${esc(label)}</text>`,
  ].join('\n');
}

/** Traço oblíquo de extremidade de cota (estilo arquitetônico). */
function tickSlash(x: number, y: number): string {
  return `<line x1="${px(x - 3)}" y1="${px(y + 3)}" x2="${px(x + 3)}" y2="${px(y - 3)}"/>`;
}
