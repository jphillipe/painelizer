/**
 * Regra de negócio do visualizador (docs/10-design.md §7): JSON do projeto → painéis, arquivos e avisos.
 * Só servidor; puro (sem fs, sem rede). Único lugar do app que importa `cli/project`, `cli/build` e
 * `cli/examples`.
 */

import 'server-only';
import { buildProject, BuildError } from 'cli/build';
import { EXAMPLES } from 'cli/examples';
import { parseProject, ProjectError } from 'cli/project';
import type { Example, GenerateResult } from '@/types/panels';

export type { Example, GeneratedFile, GenerateResult, PanelSummary } from '@/types/panels';

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

/** Os exemplos do CLI, com o texto, para o formulário oferecer. */
export function listExamples(): Example[] {
  return EXAMPLES.map((e) => ({ id: e.id, label: e.label, text: e.text }));
}

export function exampleText(id: string): string | undefined {
  return EXAMPLES.find((e) => e.id === id)?.text;
}

/** Planta de painéis da casa 28x40 (o próprio motor), para a tela usar como ilustração antes de haver resultado. */
export function illustrationPlan(): string | undefined {
  const text = exampleText('house-28x40');
  if (text === undefined) return undefined;
  const r = generate(text);
  return r.ok ? r.files.find((f) => f.path === 'plan.svg')?.content : undefined;
}
