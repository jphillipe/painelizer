/**
 * Filtros da lista de paredes do workspace (S21.4): tudo, o que pede atenção (issue ou confiança baixa da IA)
 * e só confiança baixa. Puro, para a lista ser testável sem DOM.
 */

import type { DraftWall } from './draft';
import type { Issue } from './problems';
import type { WallProvenance } from './provenance';

export type WallFilter = 'all' | 'attention' | 'lowConfidence';

/** Abaixo disto a leitura da IA pede conferência (mesmo limiar do badge "to double-check"). */
export const LOW_CONFIDENCE = 0.7;

export function hasLowConfidence(p: WallProvenance | undefined): boolean {
  if (p === undefined) return false;
  return p.confidence < LOW_CONFIDENCE || [...p.openings.values()].some((o) => o.confidence < LOW_CONFIDENCE);
}

export function wallNeedsAttention(wallId: string, issuesByWall: ReadonlyMap<string | undefined, Issue[]>, provenance: ReadonlyMap<string, WallProvenance>): boolean {
  return (issuesByWall.get(wallId)?.length ?? 0) > 0 || hasLowConfidence(provenance.get(wallId));
}

export function filterWalls<W extends Pick<DraftWall, 'id'>>(walls: readonly W[], filter: WallFilter, issuesByWall: ReadonlyMap<string | undefined, Issue[]>, provenance: ReadonlyMap<string, WallProvenance>): W[] {
  if (filter === 'all') return [...walls];
  if (filter === 'lowConfidence') return walls.filter((w) => hasLowConfidence(provenance.get(w.id)));
  return walls.filter((w) => wallNeedsAttention(w.id, issuesByWall, provenance));
}

/** Contagem por filtro, para os chips. */
export function countByFilter<W extends Pick<DraftWall, 'id'>>(walls: readonly W[], issuesByWall: ReadonlyMap<string | undefined, Issue[]>, provenance: ReadonlyMap<string, WallProvenance>): Record<WallFilter, number> {
  return {
    all: walls.length,
    attention: filterWalls(walls, 'attention', issuesByWall, provenance).length,
    lowConfidence: filterWalls(walls, 'lowConfidence', issuesByWall, provenance).length,
  };
}
