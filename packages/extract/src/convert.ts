/**
 * Da resposta do modelo (`ExtractionOutput`) para o JSON de projeto do CLI, e o relatório de revisão
 * que acompanha o JSON. O JSON gerado passa por `projectFrom` do CLI antes de ser entregue: o que o
 * CLI recusar vira `problems`, não exceção — a saída da extração é sempre revisada por humano.
 */

import { parseFeetInches } from 'core';
import { buildProject, BuildError } from 'cli/build';
import { projectFrom, ProjectError } from 'cli/project';
import type { ExtractionOutput, OpeningOut, WallOut } from './schema';

export interface ConvertOptions {
  date?: string;
  revision?: string;
  /** Pré-cortes de stud da fábrica; ausente = derivado da altura de cada parede (altura − 3 plates). */
  studLength?: readonly number[];
  /** Altura de parede quando os desenhos não trazem cortes (o modelo deixa `wallHeight` null); medida em texto. */
  wallHeight?: string;
  /** Dados do estrutural que o conjunto de arquiteto não traz; cada campo só entra onde o modelo deixou null. */
  building?: {
    groundSnowLoad?: number;
    buildingWidth?: string;
    windSpeed?: number;
    exposure?: 'B' | 'C' | 'D';
  };
  /** Pavimentos acima das paredes portantes e apoio do piso, quando os desenhos não dizem (só onde o modelo deixou null). */
  floorsSupported?: number;
  floorSpan?: 'center' | 'clear';
}

/** Altura padrão do projeto: a lida pelo modelo, senão a informada pelo humano. */
export function defaultWallHeight(out: ExtractionOutput, opts: ConvertOptions): string | null {
  return out.wallHeight ?? opts.wallHeight ?? null;
}

/** Paredes que ficariam sem altura: o CLI não gera nada sem ela. */
export function wallsWithoutHeight(out: ExtractionOutput, opts: ConvertOptions): string[] {
  const dflt = defaultWallHeight(out, opts);
  return out.walls.filter((w) => w.height === null && dflt === null).map((w) => w.id);
}

export interface Converted {
  /** JSON de entrada do CLI (`panelizer build`). */
  project: Record<string, unknown>;
  /** O que impede o `build`: erros do parser do CLI (`parser: …`) ou do motor (`motor: …`). Vazio = o build roda. */
  problems: string[];
  /** Avisos do motor no build (`<painel> <código>: mensagem`); não impedem nada, mas o revisor precisa ver. */
  warnings: string[];
}

const PLATE = 1.5;

function strip<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

function openingJson(o: OpeningOut): Record<string, unknown> {
  return strip({
    id: o.id,
    tag: o.tag,
    type: o.tag === null ? o.type : null,
    center: o.center,
    offset: o.center === null ? o.offset : null,
    roughWidth: o.roughWidth,
    roughHeight: o.roughHeight,
    headerHeight: o.headerHeight,
  });
}

function wallJson(w: WallOut, defaultHeight: string | null, opts: ConvertOptions): Record<string, unknown> {
  const inPlan = w.start !== null && w.end !== null;
  const ends = strip({ start: w.endsStart, end: w.endsEnd });
  // Dados estruturais do humano só em parede portante e só onde o modelo não leu.
  const floorsSupported = w.floorsSupported ?? (w.bearing ? (opts.floorsSupported ?? null) : null);
  const floorSpan = w.floorSpan ?? (w.bearing ? (opts.floorSpan ?? null) : null);
  return strip({
    id: w.id,
    start: inPlan ? w.start : null,
    end: inPlan ? w.end : null,
    ends: inPlan && Object.keys(ends).length > 0 ? ends : null,
    length: inPlan ? null : w.length,
    height: w.height ?? defaultHeight,
    section: w.section,
    exterior: w.exterior,
    bearing: w.bearing,
    floorsSupported,
    floorSpan,
    level: w.level,
    wallType: w.wallType,
    openings: w.openings.map(openingJson),
  });
}

/** Pré-cortes derivados: altura de cada parede menos as três plates, sem repetição, crescente. */
export function derivedStudLengths(out: ExtractionOutput, opts: ConvertOptions = {}): number[] {
  const heights = new Set<number>();
  const dflt = defaultWallHeight(out, opts);
  for (const w of out.walls) {
    const h = w.height ?? dflt;
    if (h !== null) heights.add(parseFeetInches(h));
  }
  return [...heights].map((h) => h - 3 * PLATE).filter((l) => l > 0).sort((a, b) => a - b);
}

/** Monta o JSON do CLI. Não valida: ver `convert`. */
export function toProject(out: ExtractionOutput, opts: ConvertOptions = {}): Record<string, unknown> {
  const studLength = opts.studLength ?? derivedStudLengths(out, opts);
  const height = defaultWallHeight(out, opts);
  const given = opts.building ?? {};
  const building = strip({
    groundSnowLoad: out.building.groundSnowLoad ?? given.groundSnowLoad,
    buildingWidth: out.building.buildingWidth ?? given.buildingWidth,
    windSpeed: out.building.windSpeed ?? given.windSpeed,
    exposure: out.building.exposure ?? given.exposure,
    species: out.building.species,
  });
  const openingTypes: Record<string, unknown> = {};
  for (const t of out.openingTypes) {
    openingTypes[t.tag] = strip({
      kind: t.kind,
      width: t.width,
      height: t.height,
      frame: t.kind === 'door' ? t.frame : null,
      sillHeight: t.kind === 'window' ? t.sillHeight : null,
      roughWidth: t.roughWidth,
      roughHeight: t.roughHeight,
      description: t.description,
    });
  }
  const headerSchedule: Record<string, unknown> = {};
  for (const h of out.headerSchedule) {
    headerSchedule[h.mark] = strip({
      section: h.section,
      plies: h.plies,
      jackStuds: h.jackStuds,
      kingStuds: h.kingStuds,
      description: h.description,
    });
  }
  const config = strip({
    studSpacing: 16,
    studThickness: 1.5,
    plateThickness: 1.5,
    studLength: studLength.length > 0 ? studLength : null,
    headerHeight: out.headerHeight,
    // O CLI exige neve e largura juntas; sem as duas, a tabela IRC não é consultada.
    building: building['groundSnowLoad'] !== undefined && building['buildingWidth'] !== undefined ? building : null,
    openingTypes: Object.keys(openingTypes).length > 0 ? openingTypes : null,
    headerSchedule: Object.keys(headerSchedule).length > 0 ? headerSchedule : null,
  });
  return strip({
    name: out.projectName,
    date: opts.date,
    revision: opts.revision,
    config,
    walls: out.walls.map((w) => wallJson(w, height, opts)),
  });
}

/**
 * `toProject` seguido do parser do CLI e do motor (`buildProject`, puro): erros viram `problems`, avisos
 * viram `warnings`. O motor roda aqui para o revisor saber antes do `build` o que a planta extraída não
 * resolve sozinha (header fora da tabela, aberturas coladas…).
 */
export function convert(out: ExtractionOutput, opts: ConvertOptions = {}): Converted {
  const project = toProject(out, opts);
  const problems: string[] = [];
  const warnings: string[] = [];
  const noHeight = wallsWithoutHeight(out, opts);
  if (noHeight.length > 0) {
    // O parser do CLI reclamaria de `studLength`; a causa é a altura, e é isso que o revisor precisa saber.
    problems.push(
      `altura: os desenhos não trazem cortes nem pé-direito (${noHeight.length} parede(s) sem altura: ${noHeight.slice(0, 5).join(', ')}${noHeight.length > 5 ? '…' : ''}); informe a altura da parede (subfloor ao topo da double top plate)`,
    );
    return { project, problems, warnings };
  }
  try {
    const parsed = projectFrom(project, out.projectName);
    const built = buildProject(parsed);
    for (const w of built.warnings) warnings.push(`${w.panelId} ${w.warning.code}: ${w.warning.message}`);
  } catch (e) {
    if (e instanceof ProjectError) problems.push(`parser: ${e.message}`);
    else if (e instanceof BuildError) for (const p of e.problems) problems.push(`motor: ${p}`);
    else if (e instanceof RangeError) problems.push(`motor: ${e.message}`);
    else throw e;
  }
  return { project, problems, warnings };
}

export interface ReportOptions {
  /** Abaixo disto o item entra na lista "revisar". */
  threshold?: number;
}

function pt(p: { x: string; y: string } | null): string {
  return p === null ? '—' : `(${p.x}, ${p.y})`;
}

/**
 * Relatório de revisão em Markdown: o que foi lido, com a evidência e a confiança de cada item, e a
 * lista do que precisa de olho humano (confiança baixa, medida ausente, problemas do CLI).
 */
export function reviewReport(out: ExtractionOutput, converted: Converted, opts: ReportOptions = {}): string {
  const threshold = opts.threshold ?? 0.7;
  const review: string[] = [];
  const lines: string[] = [];

  lines.push(`# Extração — ${out.projectName}`);
  lines.push('');
  lines.push(
    `Pavimento ${out.level} · planta ${out.sheets.plan ?? '?'} · schedule ${out.sheets.schedule ?? '—'} · elevações ${out.sheets.elevations ?? '—'}`,
  );
  lines.push(`Origem: ${out.origin}`);
  lines.push(`Altura de parede: ${out.wallHeight ?? 'não lida'} · topo de RO padrão: ${out.headerHeight ?? 'não lido'}`);
  lines.push('');

  lines.push('## Paredes');
  lines.push('');
  lines.push('| id | de → até / comprimento | seção | tipo | ext | portante | conf | evidência |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const w of out.walls) {
    const geo = w.start !== null && w.end !== null ? `${pt(w.start)} → ${pt(w.end)}` : (w.length ?? '—');
    lines.push(
      `| ${w.id} | ${geo} | ${w.section} | ${w.wallType ?? '—'} | ${w.exterior ? 'sim' : 'não'} | ${w.bearing ? 'sim' : 'não'} | ${w.confidence.toFixed(2)} | ${w.evidence} |`,
    );
    if (w.confidence < threshold) review.push(`parede ${w.id}: confiança ${w.confidence.toFixed(2)}`);
    if ((w.start === null || w.end === null) && w.length === null) review.push(`parede ${w.id}: sem geometria`);
    for (const o of w.openings) {
      if (o.confidence < threshold) review.push(`abertura ${o.id} (${w.id}): confiança ${o.confidence.toFixed(2)}`);
      if (o.center === null && o.offset === null) review.push(`abertura ${o.id} (${w.id}): sem posição`);
      if (o.tag === null && (o.type === null || o.roughWidth === null || o.roughHeight === null)) {
        review.push(`abertura ${o.id} (${w.id}): sem tag e sem RO completo`);
      }
    }
  }
  lines.push('');

  const openings = out.walls.flatMap((w) => w.openings.map((o) => ({ w, o })));
  if (openings.length > 0) {
    lines.push('## Aberturas');
    lines.push('');
    lines.push('| id | parede | tag/tipo | eixo | RO | topo RO | conf | evidência |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const { w, o } of openings) {
      const ro = o.roughWidth !== null || o.roughHeight !== null ? `${o.roughWidth ?? '?'} × ${o.roughHeight ?? '?'}` : 'catálogo';
      lines.push(
        `| ${o.id} | ${w.id} | ${o.tag ?? o.type ?? '—'} | ${o.center ?? (o.offset !== null ? `borda ${o.offset}` : '—')} | ${ro} | ${o.headerHeight ?? '—'} | ${o.confidence.toFixed(2)} | ${o.evidence} |`,
      );
    }
    lines.push('');
  }

  if (out.openingTypes.length > 0) {
    lines.push('## Schedule de aberturas');
    lines.push('');
    lines.push('| tag | tipo | nominal | batente | peitoril | RO | conf | evidência |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const t of out.openingTypes) {
      const ro = t.roughWidth !== null || t.roughHeight !== null ? `${t.roughWidth ?? '?'} × ${t.roughHeight ?? '?'}` : '—';
      lines.push(
        `| ${t.tag} | ${t.kind} | ${t.width} × ${t.height} | ${t.frame ?? '—'} | ${t.sillHeight ?? '—'} | ${ro} | ${t.confidence.toFixed(2)} | ${t.evidence} |`,
      );
      if (t.confidence < threshold) review.push(`tipo ${t.tag}: confiança ${t.confidence.toFixed(2)}`);
    }
    lines.push('');
  }

  if (out.wallTypes.length > 0) {
    lines.push('## Tipos de parede');
    lines.push('');
    for (const t of out.wallTypes) {
      lines.push(`- **${t.tag}** ${t.section} ${t.exterior ? 'externa' : 'interna'} — ${t.description} (${t.evidence})`);
    }
    lines.push('');
  }

  for (const p of converted.problems) review.push(p);

  lines.push('## Revisar');
  lines.push('');
  if (review.length === 0) lines.push('Nada abaixo do limiar; conferir mesmo assim contra a planta.');
  for (const r of review) lines.push(`- ${r}`);
  lines.push('');

  if (converted.warnings.length > 0) {
    lines.push('## Avisos do motor');
    lines.push('');
    for (const w of converted.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  if (out.notes.length > 0) {
    lines.push('## Notas do modelo');
    lines.push('');
    for (const n of out.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}
