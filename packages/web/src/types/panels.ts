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

export type GenerateResult =
  | { ok: true; projectName: string; panels: PanelSummary[]; files: GeneratedFile[]; warnings: string[] }
  | { ok: false; problems: string[] };

export interface Example {
  id: string;
  label: string;
  text: string;
}
