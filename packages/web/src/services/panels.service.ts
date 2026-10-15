/**
 * Regra de negócio do visualizador (docs/10-design.md §7): JSON do projeto → painéis, arquivos e avisos.
 * Só servidor; puro (sem fs, sem rede). Único lugar do app que importa `cli/project`, `cli/build` e
 * `cli/examples`.
 */

import 'server-only';
import { buildProject, BuildError } from 'cli/build';
import { EXAMPLES } from 'cli/examples';
import { parseProject, ProjectError } from 'cli/project';

export interface PanelSummary {
  id: string;
  wallId: string;
  length: number;
  pieces: number;
  weightLb: number | undefined;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export type GenerateResult =
  | { ok: true; projectName: string; panels: PanelSummary[]; files: GeneratedFile[]; warnings: string[] }
  | { ok: false; problems: string[] };

/** Nunca lança por causa do projeto: JSON inválido, parser e motor viram `problems`. */
export function generate(projectText: string): GenerateResult {
  try {
    const project = parseProject(projectText, 'project');
    const built = buildProject(project);
    return {
      ok: true,
      projectName: project.name,
      panels: built.panels.map((p) => ({
        id: p.id,
        wallId: p.wallId,
        length: p.length,
        pieces: p.members.reduce((n, m) => n + (m.plies ?? 1), 0),
        weightLb: p.weightLb,
      })),
      files: built.files.map((f) => ({ path: f.path, content: f.content })),
      warnings: built.warnings.map((w) => `${w.panelId} ${w.warning.code}: ${w.warning.message}`),
    };
  } catch (e) {
    if (e instanceof ProjectError) return { ok: false, problems: [e.message] };
    if (e instanceof BuildError) return { ok: false, problems: e.problems };
    if (e instanceof RangeError) return { ok: false, problems: [e.message] };
    throw e;
  }
}

export interface ExampleInfo {
  id: string;
  label: string;
}

export function listExamples(): ExampleInfo[] {
  return EXAMPLES.map((e) => ({ id: e.id, label: e.label }));
}

export function exampleText(id: string): string | undefined {
  return EXAMPLES.find((e) => e.id === id)?.text;
}
