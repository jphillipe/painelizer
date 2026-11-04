/**
 * Quebras de painel no editor (S29): o que a planta e o inspetor mostram e as contas do arraste. As quebras do
 * motor e os candidatos chegam da checagem (`CheckResult.walls`, em x do arquivo); as do revisor estão no draft
 * (`wall.panelBreaks`), que vale sobre o resultado da checagem (pode estar atrasado ou recusado). Puro.
 */

import type { CheckResult, WallBreaks } from '@/types/panels';
import type { DraftWall } from './draft';

/** Quebras e candidatos por parede, da última checagem que os trouxe. */
export function breaksByWall(result: CheckResult | undefined): ReadonlyMap<string, WallBreaks> {
  return new Map((result?.walls ?? []).map((w) => [w.wallId, w]));
}

export interface ShownBreaks {
  /** x do arquivo, crescentes. */
  breaks: readonly number[];
  /** Quebras do revisor (`panelBreaks`) em vez das do motor. */
  manual: boolean;
  /** Onde a parede pode ser quebrada (vazio enquanto a checagem não respondeu). */
  candidates: readonly number[];
}

/** O que desenhar: as do revisor quando o draft as tem (mesmo recusadas), senão as do motor. */
export function shownBreaks(wall: Pick<DraftWall, 'panelBreaks'>, info: WallBreaks | undefined): ShownBreaks {
  const candidates = info?.candidates ?? [];
  if (wall.panelBreaks !== undefined) return { breaks: wall.panelBreaks, manual: true, candidates };
  return { breaks: info?.breaks ?? [], manual: false, candidates };
}

/** Candidato mais perto de `along`; sem candidatos, `along` a `step` (o motor diz depois se serve). */
export function snapBreak(along: number, candidates: readonly number[], step: number): number {
  if (candidates.length === 0) return step > 0 ? Math.round(along / step) * step : along;
  let best = candidates[0]!;
  for (const c of candidates) if (Math.abs(c - along) < Math.abs(best - along)) best = c;
  return best;
}

/** A quebra `index` vai para `to`; a lista volta ordenada e sem repetição. */
export function movedBreak(breaks: readonly number[], index: number, to: number): number[] {
  return tidy(breaks.map((b, i) => (i === index ? to : b)));
}

export function withBreak(breaks: readonly number[], at: number): number[] {
  return tidy([...breaks, at]);
}

export function withoutBreak(breaks: readonly number[], index: number): number[] {
  return breaks.filter((_, i) => i !== index);
}

/**
 * Onde "Add break" põe a quebra: o candidato livre mais perto do meio do trecho mais longo (com as quebras de
 * agora). `undefined` sem candidato livre.
 */
export function suggestBreak(
  length: number,
  breaks: readonly number[],
  candidates: readonly number[],
): number | undefined {
  const bounds = [0, ...breaks, length];
  const free = candidates.filter((c) => !breaks.some((b) => Math.abs(b - c) < 1e-6));
  let best: { at: number; span: number; dist: number } | undefined;
  for (let i = 1; i < bounds.length; i++) {
    const a = bounds[i - 1]!;
    const b = bounds[i]!;
    const mid = (a + b) / 2;
    for (const c of free) {
      if (c <= a || c >= b) continue;
      const cand = { at: c, span: b - a, dist: Math.abs(c - mid) };
      if (
        best === undefined ||
        cand.span > best.span + 1e-6 ||
        (Math.abs(cand.span - best.span) <= 1e-6 && cand.dist < best.dist)
      )
        best = cand;
    }
  }
  return best?.at;
}

/** Comprimentos dos painéis com estas quebras. */
export function panelLengths(length: number, breaks: readonly number[]): number[] {
  const bounds = [0, ...breaks, length];
  return bounds.slice(1).map((b, i) => b - bounds[i]!);
}

function tidy(list: readonly number[]): number[] {
  return [...new Set(list)].sort((a, b) => a - b);
}
