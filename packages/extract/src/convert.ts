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
  /** Base do header (topo do RO) do subfloor quando o projeto não dá; ausente = padrão da fábrica (P2). */
  headerHeight?: string;
  /** Peitoril das janelas do subfloor, para os tipos de janela em que o modelo não leu; medida em texto. */
  sillHeight?: string;
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
  /**
   * Avisos (`<painel> <código>: mensagem`): da extração (abertura sem posição, fora do projeto) e do motor no
   * build. Não impedem nada, mas o revisor precisa ver.
   */
  warnings: string[];
}

const PLATE = 1.5;

/** P2 (resposta da fábrica): topo dos RO a 82 1/2" do subfloor quando o projeto não indica outra altura. */
export const FACTORY_HEADER_HEIGHT = `6' - 10 1/2"`;

/** Altura de header do projeto: lida, senão informada pelo humano, senão a padrão da fábrica. */
export function projectHeaderHeight(out: ExtractionOutput, opts: ConvertOptions): { value: string; factory: boolean } {
  const given = out.headerHeight ?? opts.headerHeight;
  return given === null || given === undefined ? { value: FACTORY_HEADER_HEIGHT, factory: true } : { value: given, factory: false };
}

/** Peitoril de um tipo de janela: lido, senão informado pelo humano. */
function sillOf(t: ExtractionOutput['openingTypes'][number], opts: ConvertOptions): string | null {
  return t.kind === 'window' ? (t.sillHeight ?? opts.sillHeight ?? null) : null;
}

/**
 * Aviso das aberturas que ficam com a altura padrão da fábrica (P2) porque nem o projeto nem o humano deram:
 * portas sem altura própria e janelas sem altura própria nem peitoril. Vazio quando a altura veio do projeto.
 */
export function defaultHeightWarnings(out: ExtractionOutput, opts: ConvertOptions = {}): string[] {
  const header = projectHeaderHeight(out, opts);
  if (!header.factory) return [];
  const types = new Map(out.openingTypes.map((t) => [t.tag, t]));
  const ids: string[] = [];
  for (const w of out.walls) {
    for (const o of w.openings) {
      if (o.headerHeight !== null || isUnplaced(o) || isUnsized(o) || needsDoorHeight(o)) continue;
      const t = o.tag === null ? undefined : types.get(o.tag);
      const kind = t?.kind ?? o.type;
      if (kind === 'window' && t !== undefined && sillOf(t, opts) !== null) continue;
      ids.push(o.id);
    }
  }
  if (ids.length === 0) return [];
  return [
    `extração ALTURA_PADRAO: ${ids.length} abertura(s) sem altura no projeto ficam com o topo do RO a ${FACTORY_HEADER_HEIGHT} ` +
      `do subfloor (padrão da fábrica, P2): ${ids.slice(0, 10).join(', ')}${ids.length > 10 ? '…' : ''} — confira nas ` +
      'elevações ou informe a altura do header / do peitoril',
  ];
}

function strip<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

/**
 * Porta ou vão sem tag com a largura do RO lida e sem a altura: o RO vai do subfloor à base do header (P4), então
 * a altura do RO é a altura de header do projeto. Só nesse caso; o resto continua como a leitura deu.
 */
function needsDoorHeight(o: OpeningOut): boolean {
  return o.tag === null && o.type === 'door' && o.roughWidth !== null && o.roughHeight === null;
}

/** Abertura sem tag nem medida que dê o RO: não dá para enquadrar; fica fora com aviso, como a sem posição. */
function isUnsized(o: OpeningOut): boolean {
  return o.tag === null && !needsDoorHeight(o) && (o.roughWidth === null || o.roughHeight === null);
}

function openingJson(o: OpeningOut, headerHeight: string): Record<string, unknown> {
  return strip({
    id: o.id,
    tag: o.tag,
    type: o.tag === null ? o.type : null,
    center: o.center,
    offset: o.center === null ? o.offset : null,
    roughWidth: o.roughWidth,
    roughHeight: needsDoorHeight(o) ? (o.headerHeight ?? headerHeight) : o.roughHeight,
    headerHeight: o.headerHeight,
  });
}

function wallJson(w: WallOut, defaultHeight: string | null, opts: ConvertOptions, headerHeight: string): Record<string, unknown> {
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
    openings: w.openings.filter((o) => !isUnplaced(o) && !isUnsized(o)).map((o) => openingJson(o, headerHeight)),
  });
}

/** Abertura que o modelo leu sem eixo nem borda (não achou cota e não inventou). */
function isUnplaced(o: OpeningOut): boolean {
  return o.center === null && o.offset === null;
}

/**
 * Aberturas sem posição ficam fora do projeto (decisão do humano, 2026-10-15): a parede sai em painéis sem
 * elas e o revisor recebe um aviso por abertura, em vez de nada ser gerado até existir o editor.
 */
export function unplacedOpenings(out: ExtractionOutput, opts: ConvertOptions = {}): string[] {
  const header = projectHeaderHeight(out, opts).value;
  return out.walls.flatMap((w) =>
    w.openings.flatMap((o) => {
      const what = `parede ${w.id}, abertura ${o.id} (${o.tag ?? o.type ?? '?'})`;
      if (isUnplaced(o)) {
        return [
          `extração ABERTURA_SEM_POSICAO: ${what}: a leitura não achou a cota do eixo — os painéis da parede saem ` +
            'SEM esta abertura; enquadre na obra ou informe a posição',
        ];
      }
      if (isUnsized(o)) {
        return [
          `extração ABERTURA_SEM_MEDIDA: ${what}: sem tag no schedule e sem largura/altura do RO na leitura — os ` +
            'painéis da parede saem SEM esta abertura; enquadre na obra ou informe o RO',
        ];
      }
      if (needsDoorHeight(o)) {
        return [
          `extração ALTURA_RO_PORTA: ${what}: a leitura deu a largura do RO (${o.roughWidth}) mas não a altura — ` +
            `RO do subfloor até a base do header, ${o.headerHeight ?? header} (P4); confira`,
        ];
      }
      return [];
    }),
  );
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
      sillHeight: sillOf(t, opts),
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
    headerHeight: projectHeaderHeight(out, opts).value,
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
    walls: out.walls.map((w) => wallJson(w, height, opts, projectHeaderHeight(out, opts).value)),
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
  const warnings: string[] = [...unplacedOpenings(out, opts), ...defaultHeightWarnings(out, opts)];
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
