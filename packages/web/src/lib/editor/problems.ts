/**
 * Issues do editor (S21): o que o modelo, o parser do CLI, o motor e a extração apontam, cada um ligado à parede
 * e à abertura que cita, para a lista de issues selecionar a peça certa e a lista de paredes contar por linha.
 *
 * As mensagens do parser e do motor são strings em português (`parede W01, abertura J1: …`, `1-S2-P1
 * HEADER_JACKS_BELOW_TABLE: …`, `project.walls[2].openings[0].center: …`); o texto original fica intacto em
 * `text`, e os ids saem por varredura dos ids conhecidos do projeto (tokens inteiros, para `S2` não casar
 * dentro de `S2-D1` nem de `1-S2-P1`). Caminhos do parser (`walls[i]`) só valem para a revisão que foi checada.
 */

import { draftFormat, isPlanWall, type DraftProblem, type ProjectDraft } from './draft';

export type Severity = 'problem' | 'warning';
/** `draft` = leitura tolerante do arquivo; `geometry` = frameWalls no cliente (S21.2); `project` = sem parede. */
export type IssueSource = 'draft' | 'geometry' | 'parser' | 'engine' | 'extraction' | 'project';

export interface Issue {
  severity: Severity;
  source: IssueSource;
  /** Mensagem original, sem tradução. */
  text: string;
  /** Família da issue do próprio editor (`wall.height`, `opening.position`, `plan.open`…): agrupa na lista (S21.4). */
  kind?: string;
  code?: string;
  wallId?: string;
  /** Outras paredes citadas na mesma mensagem (`paredes N1 e S1 se cruzam`): contam nas duas. */
  alsoWalls?: string[];
  openingId?: string;
  panelId?: string;
  /** Caminho do campo (`walls[2].openings[0].center`), quando a mensagem o traz. */
  path?: string;
}

/** Ids do projeto na ordem do arquivo: os índices dos caminhos do parser mapeiam por aqui. */
export interface IdIndex {
  walls: string[];
  /** Por parede, ids das aberturas na ordem do arquivo. */
  openings: Map<string, string[]>;
}

export function idIndex(draft: ProjectDraft): IdIndex {
  return {
    walls: draft.walls.map((w) => w.id),
    openings: new Map(draft.walls.map((w) => [w.id, w.openings.map((o) => o.id)])),
  };
}

const PATH_RE = /(?:^|[\s.:])walls\[(\d+)\](?:\.openings\[(\d+)\])?((?:\.[A-Za-z]+(?:\[\d+\])?)*)/;
const SOURCE_RE = /^(parser|motor|planta|altura|lista de material): /;
const EXTRACTION_RE = /^extração ([A-Z][A-Z0-9_]*): /;
const WARNING_RE = /^(\S+) ([A-Z][A-Z0-9_]+): /;
const PANEL_ID_RE = /^(\d+)-(.+)-P(\d+)$/;

/** Problema (string do service ou da extração) → issue com a parede e a abertura que ele cita. */
export function parseProblem(text: string, ids: IdIndex): Issue {
  return locate({ severity: 'problem', source: 'engine', text }, text, ids);
}

/** Aviso do motor (`<painel> CODE: …`) ou da extração (`extração CODE: …`) → issue. */
export function parseWarning(text: string, ids: IdIndex): Issue {
  const issue: Issue = { severity: 'warning', source: 'engine', text };
  const ext = EXTRACTION_RE.exec(text);
  if (ext) return locate(issue, text, ids);
  const m = WARNING_RE.exec(text);
  if (m) {
    const panelId = m[1]!;
    issue.code = m[2]!;
    issue.panelId = panelId;
    const p = PANEL_ID_RE.exec(panelId);
    const wallId = p !== null && ids.walls.includes(p[2]!) ? p[2]! : undefined;
    if (wallId !== undefined) issue.wallId = wallId;
    const rest = text.slice(m[0].length);
    const found = idsInMessage(rest, ids, wallId);
    if (issue.wallId === undefined && found.wallId !== undefined) issue.wallId = found.wallId;
    if (found.openingId !== undefined) issue.openingId = found.openingId;
    return issue;
  }
  return locate(issue, text, ids);
}

export function parseEngineResult(r: { problems?: readonly string[]; warnings?: readonly string[] }, ids: IdIndex): Issue[] {
  return [...(r.problems ?? []).map((p) => parseProblem(p, ids)), ...(r.warnings ?? []).map((w) => parseWarning(w, ids))];
}

function locate(issue: Issue, text: string, ids: IdIndex): Issue {
  let body = text;
  const ext = EXTRACTION_RE.exec(body);
  if (ext) {
    issue.source = 'extraction';
    issue.code = ext[1]!;
    body = body.slice(ext[0].length);
  } else {
    const src = SOURCE_RE.exec(body);
    if (src) {
      const tag = src[1]!;
      issue.source = tag === 'parser' ? 'parser' : tag === 'altura' || tag === 'lista de material' ? 'project' : 'engine';
      if (tag === 'planta') issue.kind = 'plan.open'; // mesma família do erro que a geometria vê no cliente
      body = body.slice(src[0].length);
    }
    // O motor pede o mesmo que o draft já apontou: mesma família, para a lista não mostrar duas vezes.
    if (/sem config\.building/.test(body)) issue.kind = 'config.building';
    else if (/sem wall\.floorsSupported/.test(body)) issue.kind = 'wall.floorsSupported';
    else if (/^altura: /.test(text)) issue.kind = 'wall.height';
    if (issue.source === 'project') return issue; // lista paredes por nome, mas o problema é do projeto inteiro
  }
  const path = PATH_RE.exec(body);
  if (path) {
    issue.source = issue.source === 'engine' ? 'parser' : issue.source;
    const wallId = ids.walls[Number(path[1])];
    if (wallId !== undefined) {
      issue.wallId = wallId;
      if (path[2] !== undefined) {
        const openingId = ids.openings.get(wallId)?.[Number(path[2])];
        if (openingId !== undefined) issue.openingId = openingId;
      }
    }
    issue.path = `walls[${path[1]}]${path[2] === undefined ? '' : `.openings[${path[2]}]`}${path[3] ?? ''}`;
    return issue;
  }
  const found = idsInMessage(body, ids);
  if (found.wallId !== undefined) issue.wallId = found.wallId;
  if (found.openingId !== undefined) issue.openingId = found.openingId;
  const others = wallIdsIn(body, ids).filter((w) => w !== issue.wallId);
  if (issue.wallId !== undefined && others.length > 0) issue.alsoWalls = others;
  return issue;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whole = (id: string): RegExp => new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(id)}(?![A-Za-z0-9_-])`);

/**
 * Parede e abertura citadas numa mensagem: `parede W01`, `paredes N1 e S1`, `"W01"` (id duplicado) ou, no
 * fim, qualquer id conhecido com 2+ caracteres como token inteiro. A abertura vem de `abertura <id>` e precisa
 * existir na parede achada (ou em qualquer parede, que então define a parede).
 */
export function idsInMessage(text: string, ids: IdIndex, preferWall?: string): { wallId?: string; openingId?: string } {
  const out: { wallId?: string; openingId?: string } = {};
  const named = [...text.matchAll(/\bparedes? ([^\s:,()]+)/g)].map((m) => m[1]!);
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  const candidates = [...named, ...quoted].find((c) => ids.walls.includes(c));
  if (preferWall !== undefined) out.wallId = preferWall;
  else if (candidates !== undefined) out.wallId = candidates;
  else {
    const byLength = [...ids.walls].filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
    const hit = byLength.find((w) => whole(w).test(text));
    if (hit !== undefined) out.wallId = hit;
  }
  const ab = /\babertura ([^\s:,()]+)/.exec(text);
  if (ab) {
    const openingId = ab[1]!;
    if (out.wallId !== undefined && ids.openings.get(out.wallId)?.includes(openingId)) {
      out.openingId = openingId;
    } else {
      for (const [wallId, list] of ids.openings) {
        if (list.includes(openingId)) {
          out.wallId = wallId;
          out.openingId = openingId;
          break;
        }
      }
    }
  }
  return out;
}

/** Todas as paredes citadas numa mensagem como token inteiro (mais longas primeiro), na ordem em que aparecem. */
export function wallIdsIn(text: string, ids: IdIndex): string[] {
  const hits: { id: string; at: number }[] = [];
  for (const id of [...ids.walls].sort((a, b) => b.length - a.length)) {
    const m = whole(id).exec(text);
    if (m !== null && !hits.some((h) => h.at <= m.index && m.index < h.at + h.id.length)) hits.push({ id, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id);
}

/** O que o modelo já sabe antes do parser: campos obrigatórios ausentes, ids repetidos, formato misto, catálogo. */
export function draftIssues(draft: ProjectDraft, load: readonly DraftProblem[]): Issue[] {
  const ids = idIndex(draft);
  // Problema de carga num campo do config entra na família desse campo (`config.studLength` null e "precut
  // stud lengths are missing" são a mesma coisa para o humano).
  const issues: Issue[] = load.map((p) => {
    const issue: Issue = { severity: 'problem', source: 'draft', text: p.path === '' ? p.text : `${p.path}: ${p.text}` };
    const config = /^(?:project\.)?(config\.[A-Za-z]+)/.exec(p.path);
    if (config) issue.kind = config[1]!;
    return locate(issue, p.path, ids);
  });
  const problem = (kind: string, text: string, loc: { wallId?: string; openingId?: string } = {}): void => {
    issues.push({ severity: 'problem', source: 'draft', kind, text, ...loc });
  };
  const c = draft.config;
  if (c.studSpacing === undefined) problem('config.studSpacing', 'config.studSpacing: stud spacing is missing (16" is the usual value)');
  if (c.studLength === undefined || c.studLength.length === 0) problem('config.studLength', 'config.studLength: precut stud lengths are missing (wall height minus three plates)');
  const format = draftFormat(draft);
  if (format === 'mixed') problem('walls.mixed', 'walls: some walls are in plan (start/end) and some by length — use one format');
  if (format === 'empty') problem('walls.empty', 'walls: the project has no walls');
  const seen = new Set<string>();
  const openingIds = new Set<string>();
  for (const w of draft.walls) {
    const loc = { wallId: w.id };
    if (seen.has(w.id)) problem('wall.duplicateId', `wall ${w.id}: duplicate id`, loc);
    seen.add(w.id);
    if (isPlanWall(w)) {
      if (w.start === undefined || w.end === undefined) problem('wall.ends', `wall ${w.id}: needs both start and end`, loc);
      if (w.length !== undefined) problem('wall.planLength', `wall ${w.id}: a wall in plan has no length (it comes from start/end)`, loc);
      if (w.layoutOrigin !== undefined) problem('wall.planLayoutOrigin', `wall ${w.id}: a wall in plan has no layoutOrigin (it comes from the corners)`, loc);
    } else if (w.length === undefined) {
      problem('wall.length', `wall ${w.id}: length is missing`, loc);
    }
    if (w.height === undefined) problem('wall.height', `wall ${w.id}: height is missing`, loc);
    if (w.section === undefined) problem('wall.section', `wall ${w.id}: section is missing (2x4 or 2x6)`, loc);
    if (w.exterior === undefined) problem('wall.exterior', `wall ${w.id}: exterior / interior is not set`, loc);
    if (w.bearing === undefined) problem('wall.bearing', `wall ${w.id}: bearing / non-bearing is not set`, loc);
    // Header pela tabela IRC (core/rules/openingHeader.ts): parede portante com abertura sem header próprio
    // precisa de config.building (neve + largura) e de floorsSupported. O motor diria o mesmo, 600 ms depois.
    if (w.bearing === true && w.openings.some((o) => o.header === undefined && o.headerMark === undefined)) {
      const b = c.building;
      if (b === undefined || b.groundSnowLoad === undefined || b.buildingWidth === undefined) {
        problem('config.building', `wall ${w.id}: bearing wall with openings needs config.building (snow load and building width) for the IRC header table`, loc);
      }
      if (w.floorsSupported === undefined) problem('wall.floorsSupported', `wall ${w.id}: floors above the wall are missing (IRC header table)`, loc);
    }
    for (const o of w.openings) {
      const oloc = { wallId: w.id, openingId: o.id };
      if (openingIds.has(o.id)) problem('opening.duplicateId', `opening ${o.id}: duplicate id (opening ids are unique in the project)`, oloc);
      openingIds.add(o.id);
      if (o.tag !== undefined && c.openingTypes?.[o.tag] === undefined) problem('opening.tag', `opening ${o.id}: type "${o.tag}" is not in the opening schedule`, oloc);
      if (o.headerMark !== undefined && c.headerSchedule?.[o.headerMark] === undefined) problem('opening.headerMark', `opening ${o.id}: header "${o.headerMark}" is not in the header schedule`, oloc);
      if (o.tag === undefined) {
        if (o.type === undefined) problem('opening.type', `opening ${o.id}: window or door? (no schedule tag)`, oloc);
        if (o.roughWidth === undefined || o.roughHeight === undefined) problem('opening.size', `opening ${o.id}: rough opening size is missing (no schedule tag)`, oloc);
      }
      if (o.center === undefined && o.offset === undefined) problem('opening.position', `opening ${o.id}: position is missing (center or left edge)`, oloc);
    }
  }
  return issues;
}

/** Issues por parede (`undefined` = projeto inteiro). */
export function byWall(issues: readonly Issue[]): Map<string | undefined, Issue[]> {
  const out = new Map<string | undefined, Issue[]>();
  for (const i of issues) {
    for (const wallId of [i.wallId, ...(i.alsoWalls ?? [])]) {
      const list = out.get(wallId) ?? [];
      list.push(i);
      out.set(wallId, list);
    }
  }
  return out;
}

export function countIssues(issues: readonly Issue[]): { problems: number; warnings: number } {
  let problems = 0;
  let warnings = 0;
  for (const i of issues) if (i.severity === 'problem') problems += 1; else warnings += 1;
  return { problems, warnings };
}
