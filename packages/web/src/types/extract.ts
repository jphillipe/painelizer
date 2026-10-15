/** Resultado da extração como a tela o vê (sem depender do pacote extract: trafega servidor → cliente). */

export interface OpeningReview {
  id: string;
  /** Tag do schedule ou tipo (`window`/`door`), o que houver. */
  kind: string;
  /** Eixo (`center`) ou borda (`offset`) como texto do desenho. */
  position: string;
  confidence: number;
}

export interface WallReview {
  id: string;
  /** `(0", 0") → (12' - 0", 0")` em planta, ou o comprimento em parede solta. */
  geometry: string;
  section: '2x4' | '2x6';
  wallType: string | null;
  exterior: boolean;
  bearing: boolean;
  openings: OpeningReview[];
  confidence: number;
  evidence: string;
}

export type ExtractOutcome =
  | {
      ok: true;
      projectName: string;
      level: number;
      origin: string;
      /** JSON de entrada do CLI, formatado: é o que "Generate panels" manda ao motor. */
      projectText: string;
      walls: WallReview[];
      openingTypes: { tag: string; kind: string; size: string; confidence: number }[];
      notes: string[];
      /** O que impede o `build` (`parser: …`, `motor: …`); vazio = pode gerar. */
      problems: string[];
      warnings: string[];
      report: string;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      pagesSent: { name: string; pages: number[] }[];
    }
  | {
      ok: false;
      reason: 'no_key' | 'input' | 'extraction' | 'api';
      message: string;
      rawText?: string;
    };

export const ACCEPTED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const ACCEPTED_UPLOAD_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;
