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

/** O que o humano informa e os desenhos não trazem; texto como no formulário ('' = não informado). */
export interface ProjectData {
  wallHeight: string;
  floors: string;
  floorSpan: '' | 'center' | 'clear';
  snow: string;
  width: string;
  wind: string;
  exposure: '' | 'B' | 'C' | 'D';
}

export const EMPTY_PROJECT_DATA: ProjectData = { wallHeight: '', floors: '', floorSpan: '', snow: '', width: '', wind: '', exposure: '' };

export type ExtractOutcome =
  | {
      ok: true;
      /** A resposta do modelo como veio (formato interno), para reaplicar dados do projeto sem nova chamada. */
      output: unknown;
      /** Dados do projeto aplicados nesta conversão. */
      given: ProjectData;
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

/** Leitura em andamento, para a tela de espera: quando começou e o que foi enviado. */
export interface ExtractJob {
  startedAt: number;
  files: { name: string; size: number }[];
}

export const ACCEPTED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const ACCEPTED_UPLOAD_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;
