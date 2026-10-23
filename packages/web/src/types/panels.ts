/** Tipos do resultado do motor como o app os vê (sem dependência de core/cli: trafegam entre servidor e cliente). */

export interface PanelSummary {
  id: string;
  wallId: string;
  /** Polegadas. */
  length: number;
  /** Peças a cortar (plies contam). */
  pieces: number;
  weightLb: number | undefined;
}

export interface GeneratedFile {
  /** Caminho relativo com `/`: `cutlist.csv`, `plan.svg`, `panels/1-W01-P1.svg`. */
  path: string;
  content: string;
}

/** Linha da lista de material (M3): o mesmo que `bom.csv`, tipado para a tabela da tela. */
export interface BomRow {
  section: string;
  /** Polegadas: comercial, pré-corte, ou o próprio corte (engenheirado / oversize). */
  stockLength: number;
  kind: 'commercial' | 'precut' | 'engineered' | 'oversize';
  /** Peças a comprar. */
  qty: number;
  /** Soma dos cortes atendidos (polegadas). */
  cutTotal: number;
  waste: number;
  wastePercent: number;
}

/** Linha da lista de corte de um painel (`cutlist.csv`). */
export interface CutRow {
  role: string;
  section: string;
  length: number;
  qty: number;
}

export type GenerateResult =
  | {
      ok: true;
      projectName: string;
      panels: PanelSummary[];
      files: GeneratedFile[];
      warnings: string[];
      bom: BomRow[];
      /** Por painel, na ordem dos painéis. */
      cutLists: { panelId: string; lines: CutRow[] }[];
    }
  | { ok: false; problems: string[] };

/** Checagem do editor (S21): o que o motor diria, sem os arquivos. */
export type CheckResult =
  | { ok: true; projectName: string; panels: PanelSummary[]; warnings: string[] }
  | { ok: false; problems: string[] };

export interface Example {
  id: string;
  label: string;
  /** `project`: JSON do CLI, abre direto no editor. `reading`: resposta gravada da IA, passa pela mesma conversão da extração (com proveniência). */
  kind: 'project' | 'reading';
  /** Uma linha de fatos tirados do próprio arquivo ("27 walls · level 1"). */
  facts: string;
  text: string;
}
