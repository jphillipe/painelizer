/**
 * Proveniência da leitura da IA por id (S21): o editor trabalha sobre o draft, mas continua mostrando a
 * confiança e a evidência que a extração deu a cada parede e abertura. Juntado pelo id atual — parede
 * renomeada perde a proveniência (aceito).
 */

import type { WallReview } from '@/types/extract';

export interface OpeningProvenance {
  confidence: number;
  kind: string;
  position: string;
}

export interface WallProvenance {
  confidence: number;
  evidence: string;
  wallType: string | null;
  openings: Map<string, OpeningProvenance>;
}

export function provenanceIndex(walls: readonly WallReview[] | undefined): Map<string, WallProvenance> {
  const out = new Map<string, WallProvenance>();
  for (const w of walls ?? []) {
    out.set(w.id, {
      confidence: w.confidence,
      evidence: w.evidence,
      wallType: w.wallType,
      openings: new Map(w.openings.map((o) => [o.id, { confidence: o.confidence, kind: o.kind, position: o.position }])),
    });
  }
  return out;
}

/** Cor da confiança como na revisão (10-design): ≥ 0.9 ok, ≥ 0.7 aviso, abaixo erro. */
export function confidenceTone(value: number): 'success' | 'warning' | 'destructive' {
  return value >= 0.9 ? 'success' : value >= 0.7 ? 'warning' : 'destructive';
}
