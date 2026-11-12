'use client';

import { createContext, useContext, type Dispatch, type ReactNode } from 'react';
import type { ShownBreaks } from '@/lib/editor/breaks';
import type { ProjectDraft } from '@/lib/editor/draft';
import type { PlanGeometry } from '@/lib/editor/geometry';
import type { IssueGroup } from '@/lib/editor/issue-groups';
import type { Issue } from '@/lib/editor/problems';
import type { SaveStatus } from '@/lib/editor/project-sync';
import type { WallProvenance } from '@/lib/editor/provenance';
import type { ProjectDataNeeds } from '@/lib/editor/requirements';
import type { EditorAction, EditorState } from '@/lib/editor/state';
import type { DrawingRef } from '@/lib/drawings';
import type { SupabaseEnv } from '@/lib/supabase/env';
import type { ExtractOutcome } from '@/types/extract';
import type { SaveConflictActions } from './editor-top-bar';
import type { CheckState } from './use-project-check';

/**
 * O editor aberto (S30, no lugar das 28 props do `Workspace`): o reducer e tudo que o `WallEditor` deriva do
 * draft — geometria, issues, proveniência, quebras de painel, checagem do motor. Só existe com um draft carregado.
 */
export interface EditorContextValue {
  state: EditorState;
  draft: ProjectDraft;
  dispatch: Dispatch<EditorAction>;
  geometry: PlanGeometry | undefined;
  issues: readonly Issue[];
  issuesByWall: ReadonlyMap<string | undefined, Issue[]>;
  groups: readonly IssueGroup[];
  provenance: ReadonlyMap<string, WallProvenance>;
  /** Quebras de painel por parede (S29): as do draft (revisor) ou as da última checagem, com os candidatos. */
  breaks: ReadonlyMap<string, ShownBreaks>;
  check: CheckState;
  /** Causas (S46), não ocorrências: `problems` = o que trava; `warnings` = o que pede decisão; `problemWalls` = paredes com problema. */
  counts: { problems: number; warnings: number; problemWalls: number };
  /** A checagem achou problema mas montou alguma parede: a lista de avisos ainda pode crescer (S46). */
  partial: boolean;
  /** Checagem em dia e sem problema: o "Generate" acende. */
  ready: boolean;
  /** O que o motor exige deste projeto; `needsData` = a leitura veio sem altura / precuts (card "Before you review"). */
  needs: ProjectDataNeeds;
  needsData: boolean;
  name: string;
  slug: string;
}

/**
 * O projeto como a tela 02 o recebe de fora (S30, `ProjectIOContext`): a leitura da IA, gerar painéis, recomeçar,
 * os desenhos (para a planta por baixo) e o auto-save no servidor. Quem fornece é o `NewProjectView`.
 */
export interface ProjectIO {
  /** Leitura da IA de onde o projeto veio (proveniência, notas, relatório); ausente para exemplo e arquivo. */
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  onOutcome: (outcome: ExtractOutcome) => void;
  /** Geração de painéis em curso. */
  pending: boolean;
  onGenerate: () => void;
  /** `StepBar` compacta, para a top bar. */
  steps: ReactNode;
  onStartOver: () => void;
  /** Arquivos soltos no passo 01 (M6: planta por baixo). */
  sourceFiles: readonly File[];
  /** Desenhos no Storage de onde a leitura saiu (S22.3) e as chaves para baixá-los. */
  storedDrawings: readonly DrawingRef[];
  storage: SupabaseEnv | undefined;
  /** Auto-save no servidor (S22.1): o chip da top bar, o "Retry" dele e as saídas do conflito (S23, A4). */
  save: SaveStatus | undefined;
  onRetrySave: (() => void) | undefined;
  saveActions: SaveConflictActions | undefined;
}

export const EditorContext = createContext<EditorContextValue | null>(null);
export const ProjectIOContext = createContext<ProjectIO | null>(null);

export function useEditor(): EditorContextValue {
  const v = useContext(EditorContext);
  if (v === null) throw new Error('useEditor fora do EditorContext');
  return v;
}

export function useProjectIO(): ProjectIO {
  const v = useContext(ProjectIOContext);
  if (v === null) throw new Error('useProjectIO fora do ProjectIOContext');
  return v;
}
