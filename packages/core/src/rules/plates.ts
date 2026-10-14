/**
 * Plates de uma parede reta: bottom plate, top plate e double top plate.
 *
 * Regras (docs/02-framing.md):
 * - Três plates, cada uma com a espessura `plateThickness` (1.5") e a seção da parede.
 * - Todas deitadas, x=0, comprimento = comprimento da parede.
 * - bottom em y=0; top em y = height − 2·t; double top em y = height − t.
 *   Para a altura padrão 97.125: 0, 94.125 e 95.625.
 * - Laps da double top plate (S14, R602.3.2; junta entre painéis na S15): só a double top muda. Por ponta, `extend` faz a peça
 *   avançar além da plate (x negativo no início; passa de `length` no fim) para cobrir a top plate da
 *   parede vizinha; `recess` a recua para receber o avanço da outra. `cuts` abre vãos na peça (faixa de uma
 *   parede que encosta em T): a double top sai em tantos pedaços quantos os trechos restantes, da esquerda
 *   para a direita. Pedaço sem comprimento é descartado; corte inteiramente fora da peça é ignorado (a faixa
 *   cai no lap do painel vizinho, S15); corte que sai parcialmente da peça é erro.
 */

import type { Member, WallSection } from '../types';
import { NOMINAL_2X_THICKNESS } from '../types';

const EPS = 1e-9;

/** Ajuste de uma ponta da double top plate (polegadas, ≥ 0). Os dois ao mesmo tempo é erro. */
export interface PlateEndLap {
  /** Quanto a double top avança além da plate nesta ponta. */
  extend?: number;
  /** Quanto a double top recua em relação à plate nesta ponta. */
  recess?: number;
}

/** Vão aberto na double top plate: `[x, x + width]` em x do painel. */
export interface PlateCut {
  x: number;
  width: number;
}

export interface PlateOptions {
  start?: PlateEndLap;
  end?: PlateEndLap;
  cuts?: readonly PlateCut[];
}

/**
 * Os três plates da parede, na ordem bottom, top, double top (a double top pode sair em mais de uma peça).
 *
 * @param length         comprimento da parede (polegadas)
 * @param height         altura total da parede, da base da bottom plate ao topo da double top
 * @param section        seção nominal da parede
 * @param plateThickness espessura real de cada plate (1.5)
 * @param opts           laps e cortes da double top plate (S14)
 * @throws RangeError    se `length <= 0`, `plateThickness <= 0` ou `height <= 3·plateThickness`
 *                       (não sobra espaço para stud); lap negativo, `extend` e `recess` na mesma ponta,
 *                       corte fora da peça ou double top sem nenhum pedaço
 */
export function layoutPlates(
  length: number,
  height: number,
  section: WallSection,
  plateThickness: number = NOMINAL_2X_THICKNESS,
  opts: PlateOptions = {},
): Member[] {
  if (!Number.isFinite(length) || !Number.isFinite(height) || !Number.isFinite(plateThickness)) {
    throw new RangeError('layoutPlates: argumentos devem ser números finitos');
  }
  if (length <= 0) {
    throw new RangeError(`layoutPlates: length deve ser > 0 (recebido ${length})`);
  }
  if (plateThickness <= 0) {
    throw new RangeError(`layoutPlates: plateThickness deve ser > 0 (recebido ${plateThickness})`);
  }
  if (height <= 3 * plateThickness) {
    throw new RangeError(
      `layoutPlates: altura ${height}" não comporta 3 plates de ${plateThickness}" mais um stud`,
    );
  }

  const base = { section, orientation: 'horizontal' as const };
  const doubleTopY = height - plateThickness;
  const doubleTops: Member[] = doubleTopPieces(length, opts).map(({ x, length: l }) => ({
    role: 'doubleTopPlate',
    y: doubleTopY,
    length: l,
    x,
    ...base,
  }));
  return [
    { role: 'bottomPlate', y: 0, length, x: 0, ...base },
    { role: 'topPlate', y: height - 2 * plateThickness, length, x: 0, ...base },
    ...doubleTops,
  ];
}

/** Trechos `[x, x + length]` da double top plate depois dos laps e dos cortes. */
function doubleTopPieces(length: number, opts: PlateOptions): { x: number; length: number }[] {
  const x0 = 0 - lap('start', opts.start);
  const x1 = length + lap('end', opts.end);
  if (x1 - x0 <= EPS) {
    throw new RangeError(`layoutPlates: double top plate sem comprimento (de ${x0}" a ${x1}")`);
  }

  const cuts = [...(opts.cuts ?? [])].sort((a, b) => a.x - b.x);
  const pieces: { x: number; length: number }[] = [];
  let cursor = x0;
  for (const [i, c] of cuts.entries()) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.width) || c.width <= 0) {
      throw new RangeError(`layoutPlates: cuts[${i}] inválido (x=${c.x}, width=${c.width})`);
    }
    const lo = c.x;
    const hi = c.x + c.width;
    // Corte inteiramente fora da double top (S15): a faixa cai no lap do painel vizinho, que a corta.
    if (hi <= x0 + EPS || lo >= x1 - EPS) continue;
    if (lo < x0 - EPS || hi > x1 + EPS) {
      throw new RangeError(
        `layoutPlates: cuts[${i}] de ${lo}" a ${hi}" sai da double top plate (de ${x0}" a ${x1}")`,
      );
    }
    if (lo < cursor - EPS) {
      throw new RangeError(`layoutPlates: cuts[${i}] de ${lo}" a ${hi}" sobrepõe o corte anterior`);
    }
    if (lo - cursor > EPS) pieces.push({ x: cursor, length: lo - cursor });
    cursor = Math.max(cursor, hi);
  }
  if (x1 - cursor > EPS) pieces.push({ x: cursor, length: x1 - cursor });
  if (pieces.length === 0) {
    throw new RangeError('layoutPlates: os cortes consumiram a double top plate inteira');
  }
  return pieces;
}

/** Deslocamento líquido de uma ponta: `extend` positivo para fora, `recess` para dentro. */
function lap(end: 'start' | 'end', e: PlateEndLap | undefined): number {
  if (e === undefined) return 0;
  const extend = e.extend ?? 0;
  const recess = e.recess ?? 0;
  if (!Number.isFinite(extend) || extend < 0 || !Number.isFinite(recess) || recess < 0) {
    throw new RangeError(`layoutPlates: ${end} com lap inválido (extend=${extend}, recess=${recess})`);
  }
  if (extend > EPS && recess > EPS) {
    throw new RangeError(`layoutPlates: ${end} com extend e recess ao mesmo tempo`);
  }
  return extend - recess;
}
