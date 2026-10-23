/**
 * Regra de negócio do visualizador (docs/10-design.md §7): JSON do projeto → painéis, arquivos e avisos.
 * Só servidor; puro (sem fs, sem rede). Único lugar do app que importa `cli/project`, `cli/build` e
 * `cli/examples`.
 */

import 'server-only';
import ringgoldReading from '@/samples/ringgold-st-multifamily-reading.json' with { type: 'json' };
import { buildProject, BuildError, panelizeProject, type BuildResult } from 'cli/build';
import { EXAMPLES } from 'cli/examples';
import { parseProject, ProjectError, type Project } from 'cli/project';
import type { Panel } from 'core';
import type { CheckResult, Example, GenerateResult, PanelSummary } from '@/types/panels';

export type { CheckResult, Example, GeneratedFile, GenerateResult, PanelSummary } from '@/types/panels';

type Run = { ok: true; project: Project; built: BuildResult } | { ok: false; problems: string[] };

/** Parser + motor. Nunca lança por causa do projeto: JSON inválido, parser e motor viram `problems`. */
function run(projectText: string): Run {
  try {
    const project = parseProject(projectText, 'project');
    return { ok: true, project, built: buildProject(project) };
  } catch (e) {
    return { ok: false, problems: problemsOf(e) };
  }
}

function problemsOf(e: unknown): string[] {
  if (e instanceof ProjectError) return [e.message];
  if (e instanceof BuildError) return e.problems;
  if (e instanceof RangeError) return [e.message];
  throw e;
}

function summarize(panels: readonly Panel[]): { panels: PanelSummary[]; warnings: string[] } {
  return {
    panels: panels.map((p) => ({
      id: p.id,
      wallId: p.wallId,
      length: p.length,
      pieces: p.members.reduce((n, m) => n + (m.plies ?? 1), 0),
      weightLb: p.weightLb,
    })),
    warnings: panels.flatMap((p) => p.warnings.map((w) => `${p.id} ${w.code}: ${w.message}`)),
  };
}

/** "Generate panels": painéis, arquivos (folhas, planta, listas) e avisos. */
export function generate(projectText: string): GenerateResult {
  const r = run(projectText);
  if (!r.ok) return r;
  return {
    ok: true,
    projectName: r.project.name,
    ...summarize(r.built.panels),
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

/**
 * Checagem do editor (S21): o que o motor diria desta versão do projeto, sem mandar os arquivos. M8: só a
 * painelização (`panelizeProject`), sem desenhar folha nem escrever CSV — era o `buildProject` inteiro a cada
 * pausa de 600 ms, e o tempo ia quase todo nas folhas SVG.
 */
export function check(projectText: string): CheckResult {
  try {
    const project = parseProject(projectText, 'project');
    const { panels, problems } = panelizeProject(project);
    if (problems.length > 0) return { ok: false, problems };
    return { ok: true, projectName: project.name, ...summarize(panels) };
  } catch (e) {
    return { ok: false, problems: problemsOf(e) };
  }
}

/**
 * Exemplos para testar sem desenhos (2026-10-23): primeiro a leitura real da IA do 26 Ringgold St (resposta
 * gravada em 2026-10-15, `src/samples`), que passa pela mesma conversão da extração e abre com proveniência; depois
 * os projetos do CLI. Os fatos de cada card vêm do próprio arquivo, não de texto fixo.
 */
export function listExamples(): Example[] {
  const reading: Example = {
    id: 'ringgold-reading',
    label: 'Ringgold St MultiFamily · AI reading',
    kind: 'reading',
    facts: readingFacts(ringgoldReading),
    text: JSON.stringify(ringgoldReading),
  };
  // O `ringgold-checkpoint` do CLI (4 painéis do checkpoint 2) fica fora: a leitura real já é o Ringgold (2026-10-23).
  return [reading, ...EXAMPLES.filter((e) => e.id !== 'ringgold-checkpoint').map((e) => ({ id: e.id, label: e.label, kind: 'project' as const, facts: projectFacts(e.text), text: e.text }))];
}

function readingFacts(r: { walls?: { openings?: unknown[] }[]; level?: number; sheets?: { plan?: string | null; schedule?: string | null } }): string {
  const walls = r.walls ?? [];
  const openings = walls.reduce((n, w) => n + (w.openings?.length ?? 0), 0);
  const sheets = [r.sheets?.plan, r.sheets?.schedule].filter((x): x is string => typeof x === 'string' && x !== '');
  return [`${walls.length} walls`, `${openings} openings`, ...(r.level === undefined ? [] : [`level ${r.level}`]), ...(sheets.length > 0 ? [`from ${sheets.join(' + ')}`] : [])].join(' · ');
}

function projectFacts(text: string): string {
  let walls = 0;
  try {
    const p = JSON.parse(text) as { walls?: unknown[] };
    walls = Array.isArray(p.walls) ? p.walls.length : 0;
  } catch {
    /* fatos vazios */
  }
  const r = check(text);
  return [`${walls} walls`, ...(r.ok ? [`${r.panels.length} panels`] : []), ...(r.ok && r.warnings.length > 0 ? [`${r.warnings.length} warnings`] : [])].join(' · ');
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
