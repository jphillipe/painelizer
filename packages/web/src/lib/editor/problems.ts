/**
 * Issues do editor (S21): o que o modelo, o parser do CLI, o motor e a extração apontam, cada um ligado à parede
 * e à abertura que cita, para a lista de issues selecionar a peça certa e a lista de paredes contar por linha.
 *
 * S26: motor, parser e leitura mandam `Notice` (código, ids, parâmetros); a parede e a abertura vêm dos campos,
 * nunca do texto. O texto original (português) fica intacto em `text`, só para "Details"; a frase da tela é
 * `issueMessage` (`lib/messages.en.ts`). Caminhos do parser (`walls[i]`) só valem para a revisão que foi checada.
 */

import { englishMessage } from '@/lib/messages.en';
import type { Notice } from '@/types/panels';
import { draftFormat, isPlanWall, type DraftProblem, type ProjectDraft } from './draft';
import { hasUnknownWallType, missingWallFields, wallFieldNames, withWallType } from './wall-types';

export type Severity = 'problem' | 'warning';
/** `draft` = leitura tolerante do arquivo; `geometry` = frameWalls no cliente (S21.2); `project` = sem parede. */
export type IssueSource = 'draft' | 'geometry' | 'parser' | 'engine' | 'extraction' | 'project';

export interface Issue {
  severity: Severity;
  source: IssueSource;
  /** Mensagem original, sem tradução (o editor já escreve em inglês; motor e leitura, em português). */
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
  /** Parâmetros do código (S26): é deles que sai a frase em inglês. */
  params?: Readonly<Record<string, unknown>>;
  hypothesis?: string;
  /**
   * Parede e abertura como o aviso as citou, existam ou não no draft: a abertura que a leitura deixou fora
   * (`OPENING_UNPLACED`) não está no projeto, mas o "Add opening" precisa do id dela.
   */
  cited?: { wallId?: string; openingId?: string };
  /** S50: aviso que o revisor marcou como revisado (`lib/editor/reviewed-issues.ts`); nunca num problema. */
  reviewed?: boolean;
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
const PANEL_ID_RE = /^\d+-(.+)-P\d+$/;

/** A frase em inglês da issue: a do código (com os parâmetros), senão o próprio texto (o editor já escreve em inglês). */
export function issueMessage(issue: Issue): string {
  if (issue.code === undefined) return issue.text;
  return englishMessage({ code: issue.code, wallId: issue.cited?.wallId ?? issue.wallId, openingId: issue.cited?.openingId ?? issue.openingId, panelId: issue.panelId, path: issue.path, params: issue.params }) ?? issue.text;
}

/** O texto original difere da frase mostrada: "Details" tem algo a acrescentar. */
export function hasOriginal(issue: Issue): boolean {
  return issueMessage(issue) !== issue.text;
}

/** Família do editor que o código repete (o draft já aponta o mesmo em inglês): a lista mostra uma vez. */
function kindOf(n: Notice): string | undefined {
  if (n.code === 'HEADER_DATA_MISSING') return n.params?.['missing'] === 'floorsSupported' ? 'wall.floorsSupported' : 'config.building';
  if (n.code === 'WALL_HEIGHT_MISSING') return 'wall.height';
  // S35: o draft já aponta a tag fora do catálogo e o campo que nem a parede nem o tipo dão.
  if (n.code === 'WALL_TYPE_UNKNOWN') return 'wall.wallType';
  if (n.code === 'WALL_FIELD_MISSING') {
    const first = Array.isArray(n.params?.['fields']) ? (n.params['fields'] as unknown[])[0] : undefined;
    if (typeof first === 'string') return `wall.${first}`;
  }
  if (n.stage === 'plan') return 'plan.open'; // mesma família do erro que a geometria vê no cliente
  // Campo do config que o parser recusou: a família do draft (`config.studLength` vazio = "precut stud lengths are missing").
  const config = n.path === undefined ? null : /^(config\.[A-Za-z]+)/.exec(n.path);
  if (config) return config[1]!;
  return undefined;
}

/** Aviso/problema com código → issue ligada à parede e à abertura do draft. */
export function issueFromNotice(n: Notice, severity: Severity, ids: IdIndex): Issue {
  const source: IssueSource = n.stage === 'bom' || n.code === 'WALL_HEIGHT_MISSING' ? 'project' : (n.source ?? 'engine');
  const issue: Issue = { severity, source, text: n.message, code: n.code };
  const kind = kindOf(n);
  if (kind !== undefined) issue.kind = kind;
  if (n.params !== undefined) issue.params = n.params;
  if (n.hypothesis !== undefined) issue.hypothesis = n.hypothesis;
  if (n.panelId !== undefined) issue.panelId = n.panelId;
  if (n.wallId !== undefined || n.openingId !== undefined) {
    issue.cited = { ...(n.wallId === undefined ? {} : { wallId: n.wallId }), ...(n.openingId === undefined ? {} : { openingId: n.openingId }) };
  }
  if (source === 'project') return issue; // lista paredes por nome, mas o problema é do projeto inteiro

  if (n.path !== undefined) locatePath(issue, n.path, ids);
  let wallId = n.wallId !== undefined && ids.walls.includes(n.wallId) ? n.wallId : issue.wallId;
  if (wallId === undefined && n.panelId !== undefined) {
    const p = PANEL_ID_RE.exec(n.panelId);
    if (p !== null && ids.walls.includes(p[1]!)) wallId = p[1]!;
  }
  if (n.openingId !== undefined) {
    if (wallId !== undefined && ids.openings.get(wallId)?.includes(n.openingId)) issue.openingId = n.openingId;
    else if (wallId === undefined) {
      for (const [w, list] of ids.openings) {
        if (list.includes(n.openingId)) {
          wallId = w;
          issue.openingId = n.openingId;
          break;
        }
      }
    }
  }
  if (wallId !== undefined) issue.wallId = wallId;
  const others = (n.alsoWalls ?? []).filter((w) => w !== wallId && ids.walls.includes(w));
  if (others.length > 0) issue.alsoWalls = others;
  return issue;
}

export function parseEngineResult(r: { problems?: readonly Notice[]; warnings?: readonly Notice[] }, ids: IdIndex): Issue[] {
  return [...(r.problems ?? []).map((p) => issueFromNotice(p, 'problem', ids)), ...(r.warnings ?? []).map((w) => issueFromNotice(w, 'warning', ids))];
}

/** Caminho do parser (`walls[2].openings[0].center`, estrutural) → parede e abertura pelo índice. */
function locatePath(issue: Issue, text: string, ids: IdIndex): Issue {
  const path = PATH_RE.exec(text);
  if (!path) return issue;
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

/** O que o modelo já sabe antes do parser: campos obrigatórios ausentes, ids repetidos, formato misto, catálogo. */
export function draftIssues(draft: ProjectDraft, load: readonly DraftProblem[]): Issue[] {
  const ids = idIndex(draft);
  // Problema de carga num campo do config entra na família desse campo (`config.studLength` null e "precut
  // stud lengths are missing" são a mesma coisa para o humano).
  const issues: Issue[] = load.map((p) => {
    const issue: Issue = { severity: 'problem', source: 'draft', text: p.path === '' ? p.text : `${p.path}: ${p.text}` };
    const config = /^(?:project\.)?(config\.[A-Za-z]+)/.exec(p.path);
    if (config) issue.kind = config[1]!;
    return locatePath(issue, p.path, ids);
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
    // S35: seção, posição e carga podem vir do tipo de parede; só falta o que nem a parede nem o tipo dão.
    const typed = withWallType(c, w);
    if (hasUnknownWallType(c, w) && missingWallFields(c, w).length > 0) {
      problem('wall.wallType', `wall ${w.id}: wall type "${w.wallType}" is not in the project wall types and the wall does not give ${wallFieldNames(missingWallFields(c, w))}`, loc);
    } else {
      if (typed.section === undefined) problem('wall.section', `wall ${w.id}: section is missing (2x4 or 2x6)`, loc);
      if (typed.exterior === undefined) problem('wall.exterior', `wall ${w.id}: exterior / interior is not set`, loc);
      if (typed.bearing === undefined) problem('wall.bearing', `wall ${w.id}: bearing / non-bearing is not set`, loc);
    }
    // Header pela tabela IRC (core/rules/openingHeader.ts): parede portante com abertura sem header próprio
    // precisa de config.building (neve + largura) e de floorsSupported. O motor diria o mesmo, 600 ms depois.
    if (typed.bearing === true && w.openings.some((o) => o.header === undefined && o.headerMark === undefined)) {
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
