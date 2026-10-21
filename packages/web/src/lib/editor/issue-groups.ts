/**
 * Grupos de issues (S21.4): a lista do editor mostra um item por família ("Wall height is missing · 30 walls")
 * em vez de uma linha por parede. A chave é o `kind` do próprio editor, o código do motor/extração ou, sem
 * nenhum dos dois, o texto com os ids trocados por um marcador. O título é inglês (mapa abaixo); o texto
 * original de cada issue fica intacto em `items` — nunca some, só vira detalhe (docs/10-design.md §3).
 */

import type { IdIndex, Issue, Severity } from './problems';

/** O que a interface oferece para resolver o grupo de uma vez. */
export type IssueAction = 'projectData' | 'projectSettings' | 'openWall';

export interface IssueGroup {
  key: string;
  severity: Severity;
  title: string;
  count: number;
  /** Paredes citadas, sem repetir, na ordem em que aparecem. */
  wallIds: string[];
  openingIds: string[];
  items: Issue[];
  action?: IssueAction;
}

/** Títulos em inglês por `kind` (editor), código da extração ou código do motor. */
export const ISSUE_TITLES: Readonly<Record<string, string>> = {
  // editor (draftIssues / geometryIssues)
  'wall.height': 'Wall height is missing',
  'wall.section': 'Section (2x4 or 2x6) is missing',
  'wall.exterior': 'Exterior / interior is not set',
  'wall.bearing': 'Bearing / non-bearing is not set',
  'wall.length': 'Wall length is missing',
  'wall.ends': 'Wall needs both start and end',
  'wall.planLength': 'A wall in plan has no length',
  'wall.planLayoutOrigin': 'A wall in plan has no layout origin',
  'wall.duplicateId': 'Duplicate wall id',
  'wall.noAxis': 'Wall is not parallel to an axis',
  'plan.open': 'The plan does not close',
  'walls.mixed': 'Walls mix plan and length formats',
  'walls.empty': 'The project has no walls',
  'opening.position': 'Opening position is missing',
  'opening.size': 'Rough opening size is missing',
  'opening.type': 'Window or door is not set',
  'opening.tag': 'Opening tag is not in the schedule',
  'opening.headerMark': 'Header mark is not in the schedule',
  'opening.duplicateId': 'Duplicate opening id',
  'config.studSpacing': 'Stud spacing is missing',
  'config.studLength': 'Precut stud lengths are missing',
  'config.building': 'Snow load and building width are missing (IRC header table)',
  'wall.floorsSupported': 'Floors above the wall are missing (IRC header table)',
  // extração (packages/extract)
  ABERTURA_SEM_POSICAO: 'Opening position not found in the drawing',
  ABERTURA_SEM_MEDIDA: 'Opening size not found in the drawing',
  ALTURA_PADRAO: 'Default header height used',
  ALTURA_RO_PORTA: 'Door RO height assumed',
  FOLHAS_FORA: 'Sheets left out of the reading',
  // motor (packages/core)
  HEADER_JACKS_BELOW_TABLE: 'Fewer jack studs than the IRC table',
  HEADER_KINGS_BELOW_TABLE: 'Fewer king studs than the IRC table',
  OPENING_NEAR_CORNER: 'Opening too close to a corner',
  OPENING_AT_TEE: 'Opening at a tee',
  OPENING_NUDGED: 'Opening moved to clear a stud',
  PANEL_OVERWEIGHT: 'Panel over the weight limit',
  STUD_LENGTH_MISMATCH: 'Stud length not in the precut list',
  STUD_HEIGHT_ABOVE_LIMIT: 'Stud height above the IRC limit',
  STUDS_OVERLAP: 'Studs overlap',
  DOOR_RO_HEIGHT_MISMATCH: 'Door RO height differs from the header height',
  FIRE_BLOCKING_REQUIRED: 'Fire blocking required',
  SPECIES_NOT_IN_TABLE: 'Species not covered by the IRC table',
  WIND_SPEED_MISSING: 'Wind speed is missing (king stud table)',
};

const ISSUE_ACTIONS: Readonly<Record<string, IssueAction>> = {
  'wall.height': 'projectData',
  'config.studLength': 'projectData',
  'config.building': 'projectData',
  'wall.floorsSupported': 'projectData',
  'config.studSpacing': 'projectSettings',
  WIND_SPEED_MISSING: 'projectSettings',
  SPECIES_NOT_IN_TABLE: 'projectSettings',
};

/** Problemas do motor sem código, reconhecidos pelo texto (`packages/core`): título em inglês e ação. */
const TEXT_TITLES: readonly { re: RegExp; title: string; action?: IssueAction }[] = [
  { re: /sem header no projeto e sem config\.building/, title: 'Bearing wall needs snow load and building width (IRC header table)', action: 'projectData' },
  { re: /header fora da tabela/, title: 'Header outside the IRC table — engineer required' },
  { re: /não cabe na plate/, title: 'Opening does not fit on the plate' },
  { re: /stud de canto .* não cabe/, title: 'Corner stud does not fit on the plate' },
];

function actionFor(issue: Issue): IssueAction | undefined {
  const mapped = ISSUE_ACTIONS[issue.kind ?? issue.code ?? ''];
  if (mapped !== undefined) return mapped;
  if (issue.kind === undefined && issue.code === undefined) {
    const t = TEXT_TITLES.find((x) => x.re.test(issue.text));
    if (t?.action !== undefined) return t.action;
    if (/config\.building|floorsSupported/.test(issue.text)) return 'projectData';
  }
  return undefined;
}

const PREFIX_RE = /^(?:extração [A-Z][A-Z0-9_]*|parser|motor|planta|altura|lista de material|\S+ [A-Z][A-Z0-9_]+): /;
const LEAD_RE = /^(?:paredes?|aberturas?|walls?|openings?|config|painel|panel)\b[^:]*: /i;
const ID_MARK = '▢';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Texto sem prefixo de origem e com os ids do projeto (paredes, aberturas) trocados por `▢`; números ficam. */
export function normalizeText(text: string, ids: IdIndex): string {
  let out = text.replace(PREFIX_RE, '');
  const walls = [...ids.walls].sort((a, b) => b.length - a.length);
  // ids de painel (`1-S2-P1`) primeiro: um marcador só
  for (const id of walls) out = out.replace(new RegExp(`(?<![A-Za-z0-9_-])\\d+-${escapeRe(id)}-P\\d+(?![A-Za-z0-9_-])`, 'g'), ID_MARK);
  const all = [...walls, ...[...ids.openings.values()].flat()].filter((id) => id.length >= 2).sort((a, b) => b.length - a.length);
  for (const id of all) out = out.replace(new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(id)}(?![A-Za-z0-9_-])`, 'g'), ID_MARK);
  return out;
}

export function groupKey(issue: Issue, ids: IdIndex): string {
  return issue.kind ?? issue.code ?? `${issue.severity}:${normalizeText(issue.text, ids)}`;
}

function humanize(code: string): string {
  const words = code.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Título do grupo: mapa por chave; sem mapa, o código humanizado ou o texto normalizado sem o "parede ▢:" inicial. */
export function groupTitle(issue: Issue, ids: IdIndex): string {
  const mapped = ISSUE_TITLES[issue.kind ?? issue.code ?? ''];
  if (mapped !== undefined) return mapped;
  if (issue.code !== undefined) return humanize(issue.code);
  const known = TEXT_TITLES.find((x) => x.re.test(issue.text));
  if (known !== undefined) return known.title;
  const text = normalizeText(issue.text, ids).replace(LEAD_RE, '').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Problemas antes de avisos; dentro de cada severidade, grupos maiores primeiro, empate pela ordem de chegada. */
export function groupIssues(issues: readonly Issue[], ids: IdIndex): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = groupKey(issue, ids);
    let g = groups.get(key);
    if (g === undefined) {
      g = { key, severity: issue.severity, title: groupTitle(issue, ids), count: 0, wallIds: [], openingIds: [], items: [] };
      const action = actionFor(issue);
      if (action !== undefined) g.action = action;
      groups.set(key, g);
    }
    g.count += 1;
    g.items.push(issue);
    for (const w of [issue.wallId, ...(issue.alsoWalls ?? [])]) if (w !== undefined && !g.wallIds.includes(w)) g.wallIds.push(w);
    if (issue.openingId !== undefined && !g.openingIds.includes(issue.openingId)) g.openingIds.push(issue.openingId);
  }
  const list = [...groups.values()];
  for (const g of list) if (g.action === undefined && g.wallIds.length === 1 && g.count === 1) g.action = 'openWall';
  const rank = (s: Severity): number => (s === 'problem' ? 0 : 1);
  return list.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.severity) - rank(b.g.severity) || b.g.count - a.g.count || a.i - b.i).map(({ g }) => g);
}

/** Famílias que o formulário de dados do projeto resolve (altura, precuts, estrutural). */
export const PROJECT_DATA_KINDS: ReadonlySet<string> = new Set(['wall.height', 'config.studLength', 'config.building', 'wall.floorsSupported']);

/** A leitura veio sem o que o desenho não traz (altura, precuts, dados do estrutural). */
export function needsProjectData(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.kind !== undefined && PROJECT_DATA_KINDS.has(i.kind));
}

/**
 * Issues do motor que repetem uma família que o draft já apontou na mesma parede saem da lista: o humano vê uma
 * vez "Floors above the wall are missing", não duas (uma em inglês do editor, outra em português do motor).
 */
export function dropRepeated(engine: readonly Issue[], own: readonly Issue[]): Issue[] {
  return engine.filter((e) => e.kind === undefined || !own.some((o) => o.kind === e.kind && (o.wallId === e.wallId || o.wallId === undefined || e.wallId === undefined)));
}
