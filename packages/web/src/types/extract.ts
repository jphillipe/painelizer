/** Resultado da extração como a tela o vê (sem depender do pacote extract: trafega servidor → cliente). */

import type { DrawingRef } from '@/lib/drawings';
import type { Notice } from './panels';

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
  /** Base do header (topo do RO) do subfloor, quando o projeto não dá. */
  headerHeight: string;
  /** Peitoril das janelas do subfloor, quando as elevações não dão. */
  sillHeight: string;
  floors: string;
  floorSpan: '' | 'center' | 'clear';
  snow: string;
  width: string;
  wind: string;
  exposure: '' | 'B' | 'C' | 'D';
}

export const EMPTY_PROJECT_DATA: ProjectData = { wallHeight: '', headerHeight: '', sillHeight: '', floors: '', floorSpan: '', snow: '', width: '', wind: '', exposure: '' };

/** Proveniência de uma leitura (o `ReadingProvenance` do extract, em forma de dado para o arquivo de projeto). */
export interface ReadingProvenance {
  /** Hash curto (sha-256, 16 hex) do system prompt completo do extract na hora da leitura. */
  promptHash: string;
  model: string;
  effort: string;
  maxTokens: number;
  /** Opções de recorte efetivas (`dpi`, `maxPerPage`, `format`…), ou `false` sem recortes. */
  tiles: Record<string, unknown> | false;
}

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
      /** O que impede o `build` (parser, motor, altura); vazio = pode gerar. Arquivo de antes da S26: lido do texto (`readingNotices`). */
      problems: Notice[];
      warnings: Notice[];
      report: string;
      model: string;
      /** Tokens da API; o cache (system prompt) vem à parte desde a S25. */
      usage: { inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number };
      pagesSent: { name: string; pages: number[] }[];
      /**
       * Com que prompt e parâmetros a leitura foi feita (S25): hash do system prompt, modelo pedido, effort, teto
       * de saída e opções de recorte. Ausente em leitura gravada ou anterior à S25.
       */
      provenance?: ReadingProvenance;
      /** Os desenhos no Storage de onde a leitura saiu (S22.3); ausente sem Supabase ou numa leitura gravada. */
      drawings?: DrawingRef[];
    }
  | {
      ok: false;
      reason: 'no_key' | 'input' | 'extraction' | 'api' | 'cancelled';
      /** Em inglês, para a tela. */
      message: string;
      /** Código do erro da leitura (S26), quando o extract deu um. */
      code?: string;
      /** A frase original (português, do extract), só para "Details". */
      detail?: string;
      rawText?: string;
    };

/** Leitura em andamento, para a tela de espera: id do job no servidor (M7), quando começou e o que foi enviado. */
export interface ExtractJob {
  jobId: string;
  startedAt: number;
  files: { name: string; size: number }[];
  /** Retomado da sessão depois de um F5: o resultado vem pelo job do servidor, não pela action original. */
  resumed?: boolean;
}

/** Progresso de um job no servidor (M7), consultado pela tela de espera. */
export interface ExtractProgressInfo {
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'unknown';
  phase?: 'preparing' | 'waiting' | 'reading';
  inputTokens?: number;
  outputTokens: number;
  elapsedMs: number;
  message?: string;
}

/** Prévia do que será enviado (M7), antes de pagar. */
export type ExtractPreview =
  | {
      ok: true;
      files: {
        name: string;
        kind: 'pdf' | 'image';
        /** Páginas que vão (PDF), com folha, título do carimbo e categoria (planta, schedule…) quando lidos. */
        pages: { page: number; sheet?: string; title?: string; category?: string }[];
        /** Páginas úteis que ficaram fora do orçamento, com a categoria. */
        dropped: { page: number; sheet?: string; category: string }[];
      }[];
      pagesTotal: number;
      images: number;
      /** Já inclui os recortes (estimados). */
      encodedBytes: number;
      /** Recortes em alta resolução das plantas que vão junto (2026-10-30). */
      tiles: { count: number; encodedBytes: number };
      /** Caracteres do texto posicionado enviado: o termo por densidade do estimador de custo (S25). */
      textChars?: number;
    }
  | { ok: false; message: string; detail?: string };

export const ACCEPTED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const ACCEPTED_UPLOAD_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;
