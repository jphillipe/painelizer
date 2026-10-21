/**
 * Regra de negócio do visualizador (docs/10-design.md §7): JSON do projeto → painéis, arquivos e avisos.
 * Só servidor; puro (sem fs, sem rede). Único lugar do app que importa `cli/project`, `cli/build` e
 * `cli/examples`.
 */

import 'server-only';
import { buildProject, BuildError, type BuildResult } from 'cli/build';
import { EXAMPLES } from 'cli/examples';
import { parseProject, ProjectError, type Project } from 'cli/project';
import type { CheckResult, Example, GenerateResult, PanelSummary } from '@/types/panels';

export type { CheckResult, Example, GeneratedFile, GenerateResult, PanelSummary } from '@/types/panels';

type Run = { ok: true; project: Project; built: BuildResult } | { ok: false; problems: string[] };

/** Parser + motor. Nunca lança por causa do projeto: JSON inválido, parser e motor viram `problems`. */
function run(projectText: string): Run {
  try {
    const project = parseProject(projectText, 'project');
    return { ok: true, project, built: buildProject(project) };
  } catch (e) {
    if (e instanceof ProjectError) return { ok: false, problems: [e.message] };
    if (e instanceof BuildError) return { ok: false, problems: e.problems };
    if (e instanceof RangeError) return { ok: false, problems: [e.message] };
    throw e;
  }
}

function summarize(built: BuildResult): { panels: PanelSummary[]; warnings: string[] } {
  return {
    panels: built.panels.map((p) => ({
      id: p.id,
      wallId: p.wallId,
      length: p.length,
      pieces: p.members.reduce((n, m) => n + (m.plies ?? 1), 0),
      weightLb: p.weightLb,
    })),
    warnings: built.warnings.map((w) => `${w.panelId} ${w.warning.code}: ${w.warning.message}`),
  };
}

/** "Generate panels": painéis, arquivos (folhas, planta, listas) e avisos. */
export function generate(projectText: string): GenerateResult {
  const r = run(projectText);
  if (!r.ok) return r;
  return {
    ok: true,
    projectName: r.project.name,
    ...summarize(r.built),
    files: r.built.files.map((f) => ({ path: f.path, content: f.content })),
    bom: r.built.bom.map((l) => ({
      section: l.section,
      stockLength: l.stockLength,
      kind: l.engineered ? 'engineered' : l.oversize ? 'oversize' : l.precut ? 'precut' : 'commercial',
      qty: l.qty,
      cutTotal: l.cutTotal,
      waste: l.waste,
      wastePercent: l.wastePercent,
    })),
    cutLists: r.built.cutLists.map((c) => ({ panelId: c.panelId, lines: c.lines.map((x) => ({ role: x.role, section: x.section, length: x.length, qty: x.qty })) })),
  };
}

/** Checagem do editor (S21): o que o motor diria desta versão do projeto, sem mandar os arquivos. */
export function check(projectText: string): CheckResult {
  const r = run(projectText);
  if (!r.ok) return r;
  return { ok: true, projectName: r.project.name, ...summarize(r.built) };
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
