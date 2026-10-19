/**
 * Medidas nos campos do editor: o usuário digita pés-pol (`12'-6 1/2"`) ou polegadas (`150.5`), com `-` na
 * frente quando a coordenada é negativa; o editor guarda polegadas decimais e mostra pés-pol (core/units).
 */

import { formatFeetInches } from 'core';
import { measureValue } from './draft';

export type MeasureParse = { ok: true; value: number | undefined } | { ok: false; message: string };

export const MEASURE_HINT = `Use feet and inches (12'-6 1/2") or inches (150.5)`;

/** Texto do campo → polegadas. Vazio → `undefined` (campo limpo). */
export function parseMeasureText(text: string, opts: { signed?: boolean } = {}): MeasureParse {
  const t = text.trim().replace(/[−–]/, '-');
  if (t === '') return { ok: true, value: undefined };
  const n = measureValue(t, opts.signed === true);
  if (n === undefined) {
    return { ok: false, message: t.startsWith('-') && opts.signed !== true ? 'Must be zero or more' : MEASURE_HINT };
  }
  return { ok: true, value: n };
}

/** Polegadas → pés-pol para o campo; `undefined` → vazio; negativo com `-` na frente. */
export function formatMeasure(n: number | undefined): string {
  if (n === undefined) return '';
  return n < 0 ? `-${formatFeetInches(-n)}` : formatFeetInches(n);
}

/** Ponto em planta para a lista: `(12'-0", 0")`. */
export function formatPoint(p: { x: number; y: number }): string {
  return `(${formatMeasure(p.x)}, ${formatMeasure(p.y)})`;
}
