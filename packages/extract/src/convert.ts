/**
 * Da resposta do modelo (`ExtractionOutput`) para o JSON de projeto do CLI, e o relatório de revisão
 * que acompanha o JSON. O JSON gerado passa por `projectFrom` do CLI antes de ser entregue: o que o
 * CLI recusar vira `problems`, não exceção — a saída da extração é sempre revisada por humano.
 */

import { parseFeetInches } from 'core';
import { buildProject, BuildError } from 'cli/build';
import { projectFrom, ProjectError } from 'cli/project';
import { extractionNotice, noticeText, type ReadingNotice } from './notices';
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
  /** O que impede o `build`: erros do parser do CLI, do motor ou dado faltando (altura). Vazio = o build roda. */
  problems: ReadingNotice[];
  /**
   * Avisos da extração (abertura sem posição, fora do projeto) e do motor no build (com `panelId`). Não impedem
   * nada, mas o revisor precisa ver. Texto do CLI: `noticeText`.
   */
  warnings: ReadingNotice[];
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
export function defaultHeightWarnings(out: ExtractionOutput, opts: ConvertOptions = {}): ReadingNotice[] {
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
    extractionNotice(
      'DEFAULT_HEADER_HEIGHT',
      `${ids.length} opening(s) with no height in the project get the top of RO at ${FACTORY_HEADER_HEIGHT} ` +
        `above subfloor (factory default, P2): ${ids.slice(0, 10).join(', ')}${ids.length > 10 ? '…' : ''} — check the ` +
        'elevations or enter the header / sill height',
      {},
      { count: ids.length, height: FACTORY_HEADER_HEIGHT, openingIds: ids },
    ),
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
    wallType: w.wallType === null || w.wallType.trim() === '' ? null : w.wallType.trim(),
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
export function unplacedOpenings(out: ExtractionOutput, opts: ConvertOptions = {}): ReadingNotice[] {
  const header = projectHeaderHeight(out, opts).value;
  return out.walls.flatMap((w) =>
    w.openings.flatMap((o) => {
      const what = `Wall ${w.id}, opening ${o.id} (${o.tag ?? o.type ?? '?'})`;
      const where = { wallId: w.id, openingId: o.id };
      const kind = { ...(o.tag === null ? {} : { tag: o.tag }), ...(o.type === null ? {} : { type: o.type }) };
      if (isUnplaced(o)) {
        return [
          extractionNotice(
            'OPENING_UNPLACED',
            `${what}: the reading found no centerline dimension — the wall's panels come out WITHOUT this opening; frame it in the field or enter the position`,
            where,
            kind,
          ),
        ];
      }
      if (isUnsized(o)) {
        return [
          extractionNotice(
            'OPENING_UNSIZED',
            `${what}: no schedule tag and no RO width/height in the reading — the wall's panels come out WITHOUT this opening; frame it in the field or enter the RO`,
            where,
            kind,
          ),
        ];
      }
      if (needsDoorHeight(o)) {
        const headerHeight = o.headerHeight ?? header;
        return [
          extractionNotice(
            'DOOR_RO_HEIGHT_ASSUMED',
            `${what}: the reading gave the RO width (${o.roughWidth}) but not the height — RO from subfloor to the bottom of the header, ${headerHeight} (P4); check it`,
            where,
            { ...kind, roughWidth: o.roughWidth ?? '', headerHeight },
          ),
        ];
      }
      return [];
    }),
  );
}

/** Abertura cuja posição o modelo mediu no recorte pela escala (sem cota nem regra): entra no projeto, mas avisa. */
function isScaled(o: OpeningOut): boolean {
  return o.positionSource === 'scaled' && !isUnplaced(o);
}

/**
 * Aberturas com posição estimada pela escala (decisão do humano, 2026-10-30): ficam no projeto no lugar
 * aproximado, com um aviso por abertura para o revisor conferir a cota — melhor do que sumir da parede.
 */
export function estimatedOpenings(out: ExtractionOutput): ReadingNotice[] {
  return out.walls.flatMap((w) =>
    w.openings
      .filter((o) => isScaled(o) && !isUnsized(o))
      .map((o) =>
        extractionNotice(
          'OPENING_ESTIMATED',
          `Wall ${w.id}, opening ${o.id} (${o.tag ?? o.type ?? '?'}): position scaled from the drawing, ` +
            `no dimension (confidence ${o.confidence.toFixed(2)}) — check the position on the plan and adjust`,
          { wallId: w.id, openingId: o.id },
          { ...(o.tag === null ? {} : { tag: o.tag }), ...(o.type === null ? {} : { type: o.type }), confidence: Number(o.confidence.toFixed(2)) },
        ),
      ),
  );
}

/** Cômodos que o modelo listou sem nenhuma porta: ou é um vão aberto, ou a leitura perdeu a porta. */
export function roomsWithoutDoors(out: ExtractionOutput): ReadingNotice[] {
  return out.rooms
    .filter((r) => r.doors.length === 0)
    .map((r) =>
      extractionNotice(
        'ROOM_WITHOUT_DOOR',
        `${r.name}${r.level === null ? '' : ` (level ${r.level})`}: no door found` +
          `${r.note === null || r.note.trim() === '' ? '' : ` — ${r.note.trim()}`}; check the plan and add the opening to the right wall`,
        {},
        { room: r.name, ...(r.level === null ? {} : { level: r.level }) },
      ),
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
  // Tipos de parede da folha de partition types (S35): seção e posição; a leitura não diz se a parede é portante,
  // então `bearing` fica na parede. Tag ou descrição em branco não entram (o parser do CLI as recusaria).
  const wallTypes: Record<string, unknown> = {};
  for (const t of out.wallTypes) {
    const tag = t.tag.trim();
    if (tag === '') continue;
    wallTypes[tag] = strip({
      section: t.section,
      exterior: t.exterior,
      description: t.description.trim() === '' ? null : t.description,
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
    wallTypes: Object.keys(wallTypes).length > 0 ? wallTypes : null,
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
  const problems: ReadingNotice[] = [];
  const warnings: ReadingNotice[] = [...unplacedOpenings(out, opts), ...estimatedOpenings(out), ...roomsWithoutDoors(out), ...defaultHeightWarnings(out, opts)];
  const noHeight = wallsWithoutHeight(out, opts);
  if (noHeight.length > 0) {
    // O parser do CLI reclamaria de `studLength`; a causa é a altura, e é isso que o revisor precisa saber.
    problems.push({
      source: 'project',
      code: 'WALL_HEIGHT_MISSING',
      message: `the drawings have no sections or wall height (${noHeight.length} wall(s) with no height: ${noHeight.slice(0, 5).join(', ')}${noHeight.length > 5 ? '…' : ''}); enter the wall height (subfloor to top of double top plate)`,
      params: { count: noHeight.length, wallIds: noHeight },
    });
    return { project, problems, warnings };
  }
  try {
    const parsed = projectFrom(project, out.projectName);
    const built = buildProject(parsed);
    for (const w of built.warnings) warnings.push({ source: 'engine', panelId: w.panelId, ...w.warning });
  } catch (e) {
    if (e instanceof ProjectError) problems.push(parserNotice(e, out.projectName));
    else if (e instanceof BuildError) for (const p of e.problems) problems.push({ source: 'engine', ...p });
    else if (e instanceof RangeError) problems.push({ source: 'engine', code: 'ENGINE_INTERNAL', message: e.message });
    else throw e;
  }
  return { project, problems, warnings };
}

/** Erro do parser → problema: o caminho relativo ao projeto (`walls[2].openings`) e, se veio do core, o código dele. */
function parserNotice(e: ProjectError, source: string): ReadingNotice {
  const path = e.path.startsWith(`${source}.`) ? e.path.slice(source.length + 1) : e.path;
  const n: ReadingNotice = { source: 'parser', code: 'PROJECT_INVALID', message: e.message, path, params: { path } };
  const engine = e.engine;
  if (engine !== undefined) {
    n.code = engine.code;
    n.params = { ...engine.params, path };
    if (engine.wallId !== undefined) n.wallId = engine.wallId;
    if (engine.openingId !== undefined) n.openingId = engine.openingId;
  }
  return n;
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

  lines.push(`# Extraction — ${out.projectName}`);
  lines.push('');
  lines.push(
    `Level ${out.level} · plan ${out.sheets.plan ?? '?'} · schedule ${out.sheets.schedule ?? '—'} · elevations ${out.sheets.elevations ?? '—'}`,
  );
  lines.push(`Origin: ${out.origin}`);
  lines.push(`Wall height: ${out.wallHeight ?? 'not read'} · default top of RO: ${out.headerHeight ?? 'not read'}`);
  lines.push('');

  lines.push('## Walls');
  lines.push('');
  lines.push('| id | from → to / length | section | type | ext | bearing | conf | evidence |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const w of out.walls) {
    const geo = w.start !== null && w.end !== null ? `${pt(w.start)} → ${pt(w.end)}` : (w.length ?? '—');
    lines.push(
      `| ${w.id} | ${geo} | ${w.section} | ${w.wallType ?? '—'} | ${w.exterior ? 'yes' : 'no'} | ${w.bearing ? 'yes' : 'no'} | ${w.confidence.toFixed(2)} | ${w.evidence} |`,
    );
    if (w.confidence < threshold) review.push(`wall ${w.id}: confidence ${w.confidence.toFixed(2)}`);
    if ((w.start === null || w.end === null) && w.length === null) review.push(`wall ${w.id}: no geometry`);
    for (const o of w.openings) {
      if (o.confidence < threshold) review.push(`opening ${o.id} (${w.id}): confidence ${o.confidence.toFixed(2)}`);
      if (o.center === null && o.offset === null) review.push(`opening ${o.id} (${w.id}): no position`);
      else if (o.positionSource === 'scaled') review.push(`opening ${o.id} (${w.id}): position scaled from the drawing`);
      if (o.tag === null && (o.type === null || o.roughWidth === null || o.roughHeight === null)) {
        review.push(`opening ${o.id} (${w.id}): no tag and no complete RO`);
      }
    }
  }
  lines.push('');

  const openings = out.walls.flatMap((w) => w.openings.map((o) => ({ w, o })));
  if (openings.length > 0) {
    lines.push('## Openings');
    lines.push('');
    lines.push('| id | wall | tag/type | center | source | RO | top of RO | conf | evidence |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const { w, o } of openings) {
      const ro = o.roughWidth !== null || o.roughHeight !== null ? `${o.roughWidth ?? '?'} × ${o.roughHeight ?? '?'}` : 'catalog';
      lines.push(
        `| ${o.id} | ${w.id} | ${o.tag ?? o.type ?? '—'} | ${o.center ?? (o.offset !== null ? `edge ${o.offset}` : '—')} | ${o.positionSource ?? '—'} | ${ro} | ${o.headerHeight ?? '—'} | ${o.confidence.toFixed(2)} | ${o.evidence} |`,
      );
    }
    lines.push('');
  }

  if (out.openingTypes.length > 0) {
    lines.push('## Opening schedule');
    lines.push('');
    lines.push('| tag | type | nominal | frame | sill | RO | conf | evidence |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const t of out.openingTypes) {
      const ro = t.roughWidth !== null || t.roughHeight !== null ? `${t.roughWidth ?? '?'} × ${t.roughHeight ?? '?'}` : '—';
      lines.push(
        `| ${t.tag} | ${t.kind} | ${t.width} × ${t.height} | ${t.frame ?? '—'} | ${t.sillHeight ?? '—'} | ${ro} | ${t.confidence.toFixed(2)} | ${t.evidence} |`,
      );
      if (t.confidence < threshold) review.push(`type ${t.tag}: confidence ${t.confidence.toFixed(2)}`);
    }
    lines.push('');
  }

  if (out.wallTypes.length > 0) {
    lines.push('## Wall types');
    lines.push('');
    for (const t of out.wallTypes) {
      lines.push(`- **${t.tag}** ${t.section} ${t.exterior ? 'exterior' : 'interior'} — ${t.description} (${t.evidence})`);
    }
    lines.push('');
  }

  if (out.rooms.length > 0) {
    lines.push('## Rooms');
    lines.push('');
    lines.push('| room | level | doors | note |');
    lines.push('|---|---|---|---|');
    for (const r of out.rooms) {
      lines.push(`| ${r.name} | ${r.level ?? '—'} | ${r.doors.length === 0 ? '**none**' : r.doors.join(', ')} | ${r.note ?? ''} |`);
      if (r.doors.length === 0) review.push(`room ${r.name}: no door`);
    }
    lines.push('');
  }

  for (const p of converted.problems) review.push(noticeText(p));

  lines.push('## Review');
  lines.push('');
  if (review.length === 0) lines.push('Nothing below the threshold; check against the plan anyway.');
  for (const r of review) lines.push(`- ${r}`);
  lines.push('');

  if (converted.warnings.length > 0) {
    lines.push('## Engine warnings');
    lines.push('');
    for (const w of converted.warnings) lines.push(`- ${noticeText(w)}`);
    lines.push('');
  }

  if (out.notes.length > 0) {
    lines.push('## Model notes');
    lines.push('');
    for (const n of out.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}
