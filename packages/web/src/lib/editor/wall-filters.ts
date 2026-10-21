/**
 * Filtros da lista de paredes do workspace (S21.4): tudo, o que pede atenção (issue ou confiança baixa da IA),
 * só confiança baixa e, desde a M5, o que ainda não foi revisado; mais o pavimento, compartilhado com a planta.
 * Puro, para a lista ser testável sem DOM.
 */

import type { DraftWall } from './draft';
import type { Issue } from './problems';
import type { WallProvenance } from './provenance';
import { isReviewed } from './state';

export type WallFilter = 'all' | 'attention' | 'lowConfidence' | 'notReviewed';
export type LevelFilter = number | 'all';

/** Abaixo disto a leitura da IA pede conferência (mesmo limiar do badge "to double-check"). */
export const LOW_CONFIDENCE = 0.7;

export function hasLowConfidence(p: WallProvenance | undefined): boolean {
  if (p === undefined) return false;
  return p.confidence < LOW_CONFIDENCE || [...p.openings.values()].some((o) => o.confidence < LOW_CONFIDENCE);
}

export function wallNeedsAttention(wallId: string, issuesByWall: ReadonlyMap<string | undefined, Issue[]>, provenance: ReadonlyMap<string, WallProvenance>): boolean {
  return (issuesByWall.get(wallId)?.length ?? 0) > 0 || hasLowConfidence(provenance.get(wallId));
}

type FilterableWall = Pick<DraftWall, 'id' | 'extra' | 'level'>;

export function onLevel<W extends Pick<DraftWall, 'level'>>(w: W, level: LevelFilter): boolean {
  return level === 'all' || (w.level ?? 1) === level;
}

export function filterWalls<W extends FilterableWall>(walls: readonly W[], filter: WallFilter, issuesByWall: ReadonlyMap<string | undefined, Issue[]>, provenance: ReadonlyMap<string, WallProvenance>, level: LevelFilter = 'all'): W[] {
  const byLevel = walls.filter((w) => onLevel(w, level));
  if (filter === 'all') return byLevel;
  if (filter === 'lowConfidence') return byLevel.filter((w) => hasLowConfidence(provenance.get(w.id)));
  if (filter === 'notReviewed') return byLevel.filter((w) => !isReviewed(w));
  return byLevel.filter((w) => wallNeedsAttention(w.id, issuesByWall, provenance));
}

/** Contagem por filtro, para os chips. */
export function countByFilter<W extends FilterableWall>(walls: readonly W[], issuesByWall: ReadonlyMap<string | undefined, Issue[]>, provenance: ReadonlyMap<string, WallProvenance>, level: LevelFilter = 'all'): Record<WallFilter, number> {
  return {
    all: filterWalls(walls, 'all', issuesByWall, provenance, level).length,
    attention: filterWalls(walls, 'attention', issuesByWall, provenance, level).length,
    lowConfidence: filterWalls(walls, 'lowConfidence', issuesByWall, provenance, level).length,
    notReviewed: filterWalls(walls, 'notReviewed', issuesByWall, provenance, level).length,
  };
}
