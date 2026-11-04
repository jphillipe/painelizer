/**
 * Emenda de plate acima do estoque (S15, P14 respondida).
 *
 * Regra (`splicePlates`): plate mais longa que o maior `stockLengths` sai em `ceil(L / estoque)` peças cortadas
 * sobre o centro de um stud de altura inteira do painel (cada peça apoia 3/4"). Ordem: top plate (emenda
 * defasada das pontas da double top), double top (defasada das emendas da top e das pontas da top plate), bottom
 * (sobre stud, sem outra restrição). Defasagem preferida `lap` (48"), mínima `minLap` (24"); da esquerda, a maior
 * peça que deixa o resto emendável.
 */

import type { PanelConfig } from '../config';
import { EPS, LENGTH_EPS } from '../eps';
import { isPlateRole, type Member, type Panel } from '../panel';
import { verticalWidth } from '../sections';
import { EngineError } from '../messages';

/** Centros dos studs e kings de altura inteira (em pé, não flat), crescentes: onde uma plate pode emendar. */
export function supportCenters(members: readonly Member[]): number[] {
  return members
    .filter((m) => m.role === 'kingStud' || (m.role === 'stud' && m.flat !== true))
    .map((m) => m.x + verticalWidth(m) / 2)
    .sort((a, b) => a - b);
}

/**
 * Plates mais longas que o maior comprimento comercial emendadas sobre studs (P14). Devolve um painel novo;
 * os demais members não mudam.
 *
 * @param wallId para as mensagens
 * @throws RangeError estoque inválido; sem stud onde emendar com as defasagens mínimas
 */
export function splicePlates(
  panel: Panel,
  stockLengths: readonly number[],
  cfg: PanelConfig,
  wallId: string = panel.wallId,
): Panel {
  if (stockLengths.length === 0) throw new EngineError('STOCK_EMPTY', {}, { scope: 'stockLengths' });
  for (const s of stockLengths) {
    if (!Number.isFinite(s) || s <= 0) throw new EngineError('STOCK_INVALID', {}, { scope: 'stockLengths', value: s });
  }
  const maxStock = Math.max(...stockLengths);
  const needs = (m: Member): boolean => isPlateRole(m.role) && m.length > maxStock + LENGTH_EPS;
  if (!panel.members.some(needs)) return panel;

  const supports = supportCenters(panel.members);
  const ends = (role: Member['role']): number[] =>
    panel.members.filter((m) => m.role === role).flatMap((m) => [m.x, m.x + m.length]);

  const pieces = new Map<Member, Member[]>();
  const cutsOf = (m: Member, avoid: readonly number[], prefer: boolean): number[] => {
    const cuts = pickCuts(m.x, m.x + m.length, maxStock, supports, avoid, prefer ? cfg.lap : 0, prefer ? cfg.minLap : 0, { wallId, role: m.role, memberLength: m.length });
    const bounds = [m.x, ...cuts, m.x + m.length];
    pieces.set(
      m,
      bounds.slice(1).map((end, i) => ({ ...m, x: bounds[i]!, length: end - bounds[i]! })),
    );
    return cuts;
  };

  // Top plate primeiro, defasada das pontas (juntas) da double top; depois a double top, defasada das emendas
  // da top e das pontas da top plate; a bottom emenda sobre stud sem outra restrição.
  const topCuts = panel.members.filter((m) => m.role === 'topPlate' && needs(m)).flatMap((m) => cutsOf(m, ends('doubleTopPlate'), true));
  for (const m of panel.members.filter((m) => m.role === 'doubleTopPlate' && needs(m))) {
    cutsOf(m, [...topCuts, ...ends('topPlate')], true);
  }
  for (const m of panel.members.filter((m) => m.role === 'bottomPlate' && needs(m))) cutsOf(m, [], false);

  return { ...panel, members: panel.members.flatMap((m) => pieces.get(m) ?? [m]) };
}

/**
 * Posições de corte de uma plate `[x0, x1]` em `ceil(L / maxStock)` peças, sobre `supports`, cada corte a
 * ≥ `prefer` (ou, se não der, ≥ `min`) de `avoid` e dos cortes já escolhidos. Da esquerda, a maior peça que
 * deixa o resto emendável.
 */
function pickCuts(
  x0: number,
  x1: number,
  maxStock: number,
  supports: readonly number[],
  avoid: readonly number[],
  prefer: number,
  min: number,
  what: { wallId: string; role: string; memberLength: number },
): number[] {
  const count = Math.ceil((x1 - x0) / maxStock - EPS) - 1;
  const cuts: number[] = [];
  let cursor = x0;
  for (let k = 0; k < count; k++) {
    const piecesLeft = count - k;
    const feasible = supports.filter(
      (c) => c > cursor + EPS && c - cursor <= maxStock + EPS && x1 - c <= piecesLeft * maxStock + EPS && c < x1 - EPS,
    );
    const taken = [...avoid, ...cuts];
    const farFrom = (gap: number) => feasible.filter((c) => taken.every((a) => Math.abs(c - a) >= gap - EPS));
    const pick = (farFrom(prefer).at(-1) ?? farFrom(min).at(-1));
    if (pick === undefined) {
      throw new EngineError(
        'SPLICE_NO_STUD',
        { wallId: what.wallId },
        { role: what.role, memberLength: what.memberLength, from: cursor, to: Math.min(x1, cursor + maxStock), min, maxStock },
      );
    }
    cuts.push(pick);
    cursor = pick;
  }
  return cuts;
}
