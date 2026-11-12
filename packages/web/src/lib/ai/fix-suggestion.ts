/**
 * Sugestão de resolução por IA (S51) — a parte pura: o que vai para a IA (`suggestPrompt`), a conferência do que
 * volta (`toDraftEdits`) e a descrição das edições para a tela (`describeEdits`).
 *
 * A IA não entra no motor. Ela propõe edições do projeto num vocabulário fechado; cada edição é conferida aqui contra
 * o projeto (alvo existe, campo vale para o alvo, valor é válido) e só então vira `DraftEdit` — a mesma moeda do
 * conserto em grupo (S49), aplicada pelo editor num passo só de desfazer, depois do clique do humano. Quem diz se a
 * proposta resolve é a checagem do motor, antes e depois (`services/suggest.service.ts`).
 */

import { headerSection, readField } from 'cli/schema';
import type { FixSuggestion } from 'extract/suggest';
import type { DraftConfig, DraftOpening, DraftWall, ProjectDraft } from '@/lib/editor/draft';
import type { IssueGroup } from '@/lib/editor/issue-groups';
import { helpFor } from '@/lib/editor/issue-help';
import { formatMeasure } from '@/lib/editor/measure';
import { issueMessage } from '@/lib/editor/problems';
import type { DraftEdit } from '@/lib/editor/state';

/** Ocorrências que vão para a IA; acima disso o total é dito e as primeiras bastam (são iguais na maioria das causas). */
export const MAX_OCCURRENCES = 40;
/** Sem parede citada (issue de projeto) vão as primeiras paredes, só para contexto. */
const MAX_CONTEXT_WALLS = 40;

export interface SuggestOccurrence {
  wallId?: string;
  openingId?: string;
  message: string;
  params?: Readonly<Record<string, unknown>>;
}

/** A causa como a IA a recebe. */
export interface SuggestIssue {
  family: string;
  severity: 'problem' | 'warning';
  title: string;
  what?: string;
  fix?: string;
  summary?: string;
  /** Ocorrências na linha; `occurrences` pode trazer menos. */
  total: number;
  occurrences: SuggestOccurrence[];
}

export function issueForSuggestion(group: IssueGroup): SuggestIssue {
  const help = group.items[0] === undefined ? undefined : helpFor(group.items[0]);
  return {
    family: group.family,
    severity: group.severity,
    title: group.title,
    ...(help === undefined ? {} : { what: help.what, fix: help.fix }),
    ...(group.summary === undefined ? {} : { summary: group.summary }),
    total: group.count,
    occurrences: group.items.slice(0, MAX_OCCURRENCES).map((i) => ({
      ...(i.wallId === undefined ? {} : { wallId: i.wallId }),
      ...(i.openingId === undefined ? {} : { openingId: i.openingId }),
      message: issueMessage(i),
      ...(i.params === undefined ? {} : { params: i.params }),
    })),
  };
}

/** Regras e vocabulário: a parte estável do pedido (vai com cache). */
export const SUGGEST_SYSTEM = `You help a reviewer fix one issue in a wall panelization project for US light wood frame construction (IRC). A deterministic engine frames the walls from the project data and reports issues. You propose edits to the project data; the reviewer approves them; the engine then re-checks. You never frame anything yourself.

## What you receive
A JSON object with:
- "issue": the issue family, its title, what it means, how it is usually fixed, and its occurrences (wall id, opening id, message, parameters).
- "project": the project settings and only the walls the issue cites, with their openings and the opening types they use.
- "readingNotes": notes from the AI reading of the drawings, when the project came from one. They may quote the drawings.

All measures are decimal inches. Heights are measured from the subfloor. Opening positions are measured from the wall start, along the wall. An opening is placed by "center" (center of the rough opening) or by "offset" (its left edge), never both.

## How the engine works (what you need)
- A bearing wall gets each opening's header from the IRC tables (snow load, building width, floors carried). Outside the tables the engine stops and asks for the header the engineer specified.
- A non-bearing wall gets a flat header. More than 24" between it and the top plate adds cripples above and a warning for the factory.
- "headerHeight" on an opening is the top of its rough opening (the underside of the header). Without it, the project "headerHeight" applies.
- A door's rough opening height does not move any lumber: the header sits at "headerHeight". A mismatch between the two is only a warning. An opening type's "roughHeight" applies to every opening of that type.
- King studs and jack studs flank an opening; neighbouring openings need room for both.

## What you return
- "explanation": one to three plain sentences for the reviewer — what is wrong and what your edits do. No jargon about this prompt.
- "confidence": "high" when the project data alone settles it, "medium" when you chose between reasonable options, "low" when you are guessing.
- "needsFromHuman": what information is missing and where the reviewer finds it (for example the structural framing plan or the door schedule). Empty string when nothing is missing.
- "edits": a list of single-field changes. Each has "target", the ids that locate it, "field" and "value" (always text).

## Edit vocabulary
- target "opening" (needs "wallId" and "openingId"): center, offset, roughWidth, roughHeight, sillHeight, headerHeight (measures); jackStuds, kingStuds (whole numbers, per side); headerSection (for example "2x10", "2x12", "LVL 1.75x11.875") together with headerPlies (whole number) — always give both.
- target "wall" (needs "wallId"): height (measure); section ("2x4" or "2x6"); exterior, bearing ("true" or "false"); floorsSupported (whole number, 0 or more).
- target "openingType" (needs "tag"): roughWidth, roughHeight, width, height, sillHeight (measures).
- target "project": headerHeight, studSpacing, buildingWidth (measures); groundSnowLoad (psf); windSpeed (mph).
An empty "value" clears an optional field (roughWidth, roughHeight, sillHeight, headerHeight, jackStuds, kingStuds, headerSection). Use only ids and tags that appear in "project".

## Rules
1. Never invent a structural value. Header section and plies, jack and king stud counts, whether a wall is bearing or exterior, floors carried, stud spacing, snow load, building width and wind speed come from the engineer or the drawings. Propose one only when that exact value is stated in "project" or "readingNotes", and say where in the explanation. Otherwise return no edit for it and use "needsFromHuman". Never change one of these just to make an issue disappear.
2. Prefer the smallest change that removes the issue, and the one that does not move lumber when one exists. Say in the explanation when an edit changes the framing.
3. When several occurrences share the cause, fix them the same way. Prefer one edit on the opening type or the project setting over many identical edits, but only when every opening it affects should change.
4. Do not move or resize openings unless the issue is about their position or size; then move them the minimum the message asks for.
5. If you cannot fix the issue from the data given, return an empty "edits" list. That is a good answer: the reviewer then knows what to look for.
6. Write in English.`;

/** O trecho do projeto que a causa toca: sem as chaves do editor (`$…`), sem os catálogos que ela não usa. */
function projectSlice(
  issue: SuggestIssue,
  draft: ProjectDraft,
): { config: Record<string, unknown>; walls: Record<string, unknown>[] } {
  const cited = new Set(issue.occurrences.map((o) => o.wallId).filter((w): w is string => w !== undefined));
  const walls = cited.size > 0 ? draft.walls.filter((w) => cited.has(w.id)) : draft.walls.slice(0, MAX_CONTEXT_WALLS);
  const tags = new Set(walls.flatMap((w) => w.openings.map((o) => o.tag)).filter((t): t is string => t !== undefined));
  const marks = new Set(
    walls.flatMap((w) => w.openings.map((o) => o.headerMark)).filter((m): m is string => m !== undefined),
  );
  const pick = <T>(table: Record<string, T> | undefined, keys: ReadonlySet<string>): Record<string, T> =>
    Object.fromEntries(Object.entries(table ?? {}).filter(([k]) => keys.has(k)));
  const c: DraftConfig = draft.config;
  const config: Record<string, unknown> = {
    ...(c.studSpacing === undefined ? {} : { studSpacing: c.studSpacing }),
    ...(c.studLength === undefined ? {} : { studLength: c.studLength }),
    ...(c.headerHeight === undefined ? {} : { headerHeight: c.headerHeight }),
    ...(c.building === undefined ? {} : { building: c.building }),
    ...(c.panel === undefined ? {} : { panel: c.panel }),
    ...(c.stockLengths === undefined ? {} : { stockLengths: c.stockLengths }),
    openingTypes: pick(c.openingTypes, tags),
    ...(marks.size === 0 ? {} : { headerSchedule: pick(c.headerSchedule, marks) }),
  };
  const withoutExtra = <T extends { extra?: unknown }>(o: T): Omit<T, 'extra'> => {
    const { extra: _extra, ...rest } = o;
    return rest;
  };
  return { config, walls: walls.map((w) => ({ ...withoutExtra(w), openings: w.openings.map(withoutExtra) })) };
}

/** Teto das notas da leitura no pedido: são contexto, não o assunto; o que fica de fora é contado e dito. */
export const MAX_NOTES_CHARS = 20_000;

function cappedNotes(notes: readonly string[]): { readingNotes: string[]; readingNotesOmitted?: number } {
  const kept: string[] = [];
  let used = 0;
  for (const note of notes) {
    if (used + note.length > MAX_NOTES_CHARS) break;
    kept.push(note);
    used += note.length;
  }
  return kept.length === notes.length
    ? { readingNotes: kept }
    : { readingNotes: kept, readingNotesOmitted: notes.length - kept.length };
}

/** O pedido: as regras (estáveis) e a causa com o trecho do projeto. Nenhum desenho, nenhum dado de conta. */
export function suggestPrompt(
  issue: SuggestIssue,
  draft: ProjectDraft,
  notes: readonly string[] = [],
): { system: string; user: string } {
  return {
    system: SUGGEST_SYSTEM,
    user: JSON.stringify({ issue, project: projectSlice(issue, draft), ...cappedNotes(notes) }, null, 1),
  };
}

type SuggestedEdit = FixSuggestion['edits'][number];
type Kind = 'measure' | 'position' | 'count' | 'count0' | 'load' | 'speed' | 'section' | 'bool';
interface Rule {
  kind: Kind;
  /** Texto vazio apaga o campo. */
  clearable?: boolean;
}

const OPENING_RULES: Readonly<Record<string, Rule>> = {
  center: { kind: 'position' },
  offset: { kind: 'position' },
  roughWidth: { kind: 'measure', clearable: true },
  roughHeight: { kind: 'measure', clearable: true },
  sillHeight: { kind: 'position', clearable: true },
  headerHeight: { kind: 'measure', clearable: true },
  jackStuds: { kind: 'count', clearable: true },
  kingStuds: { kind: 'count', clearable: true },
};
const WALL_RULES: Readonly<Record<string, Rule>> = {
  height: { kind: 'measure' },
  section: { kind: 'section' },
  exterior: { kind: 'bool' },
  bearing: { kind: 'bool' },
  floorsSupported: { kind: 'count0' },
};
const TYPE_RULES: Readonly<Record<string, Rule>> = {
  roughWidth: { kind: 'measure', clearable: true },
  roughHeight: { kind: 'measure', clearable: true },
  width: { kind: 'measure' },
  height: { kind: 'measure' },
  sillHeight: { kind: 'position', clearable: true },
};
const CONFIG_RULES: Readonly<Record<string, Rule>> = {
  headerHeight: { kind: 'measure', clearable: true },
  studSpacing: { kind: 'measure' },
};
const BUILDING_RULES: Readonly<Record<string, Rule>> = {
  groundSnowLoad: { kind: 'load' },
  buildingWidth: { kind: 'measure' },
  windSpeed: { kind: 'speed' },
};

/** O valor (texto) no tipo do campo; `undefined` com `ok` = apagar; `ok: false` = inválido. */
function parseValue(
  rule: Rule,
  text: string,
): { ok: true; value: number | boolean | string | undefined } | { ok: false } {
  const t = text.trim();
  if (t === '') return rule.clearable === true ? { ok: true, value: undefined } : { ok: false };
  if (rule.kind === 'bool')
    return t === 'true' ? { ok: true, value: true } : t === 'false' ? { ok: true, value: false } : { ok: false };
  if (rule.kind === 'section') return t === '2x4' || t === '2x6' ? { ok: true, value: t } : { ok: false };
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false };
  const whole = Number.isInteger(n);
  const valid =
    rule.kind === 'measure'
      ? n > 0
      : rule.kind === 'position' || rule.kind === 'load'
        ? n >= 0
        : rule.kind === 'speed'
          ? n >= 1
          : rule.kind === 'count'
            ? whole && n >= 1
            : whole && n >= 0;
  return valid ? { ok: true, value: n } : { ok: false };
}

/**
 * As edições da IA conferidas contra o projeto. Alvo que não existe, campo que não vale para o alvo e valor inválido
 * são recusados (com o motivo, em inglês, para a tela); o resto vira `DraftEdit`, um por alvo, na ordem em que cada
 * alvo apareceu.
 */
export function toDraftEdits(
  suggestion: FixSuggestion,
  draft: ProjectDraft,
): { edits: DraftEdit[]; rejected: string[] } {
  const rejected: string[] = [];
  const patches = new Map<string, { edit: DraftEdit; patch: Record<string, unknown> }>();
  /** Seção e plies de header pedidos por abertura: só valem juntos (ou sobre um header que já existe). */
  const headers = new Map<
    string,
    { wall: DraftWall; opening: DraftOpening; section?: string | null; plies?: number }
  >();
  const slot = (key: string, make: () => DraftEdit): Record<string, unknown> => {
    let entry = patches.get(key);
    if (entry === undefined) {
      const edit = make();
      entry = { edit, patch: edit.patch as Record<string, unknown> };
      patches.set(key, entry);
    }
    return entry.patch;
  };
  const reject = (e: SuggestedEdit, where: string, why: string): void => {
    rejected.push(`${where} ${e.field}: ${why}`);
  };
  const apply = (
    e: SuggestedEdit,
    where: string,
    rules: Readonly<Record<string, Rule>>,
    patch: () => Record<string, unknown>,
  ): void => {
    const rule = rules[e.field];
    if (rule === undefined) return reject(e, where, 'this field does not apply here');
    const parsed = parseValue(rule, e.value);
    if (!parsed.ok) return reject(e, where, `"${e.value}" is not a valid value`);
    const p = patch();
    p[e.field] = parsed.value;
    // eixo e borda não convivem: dar um apaga o outro
    if (e.field === 'center') p['offset'] = undefined;
    if (e.field === 'offset') p['center'] = undefined;
  };

  for (const e of suggestion.edits) {
    if (e.target === 'opening') {
      const wall = draft.walls.find((w) => w.id === e.wallId);
      const opening = wall?.openings.find((o) => o.id === e.openingId);
      const where = `opening ${e.openingId || '?'}`;
      if (wall === undefined || opening === undefined) {
        rejected.push(`${where} (wall ${e.wallId || '?'}): not in the project`);
        continue;
      }
      const key = `opening:${wall.id}/${opening.id}`;
      const patch = (): Record<string, unknown> =>
        slot(key, () => ({ target: 'opening', wallId: wall.id, openingId: opening.id, patch: {} }));
      if (e.field === 'headerSection' || e.field === 'headerPlies') {
        const h = headers.get(key) ?? { wall, opening };
        if (e.field === 'headerSection') {
          const s = e.value.trim();
          if (s === '') h.section = null;
          else if (readField(headerSection, s).ok) h.section = s;
          else {
            reject(e, where, `"${e.value}" is not a header section (2x4…2x12, or LVL / PSL width x depth)`);
            continue;
          }
        } else {
          const plies = parseValue({ kind: 'count' }, e.value);
          if (!plies.ok || typeof plies.value !== 'number') {
            reject(e, where, `"${e.value}" is not a valid value`);
            continue;
          }
          h.plies = plies.value;
        }
        headers.set(key, h);
        continue;
      }
      apply(e, where, OPENING_RULES, patch);
    } else if (e.target === 'wall') {
      const wall = draft.walls.find((w) => w.id === e.wallId);
      if (wall === undefined) {
        rejected.push(`wall ${e.wallId || '?'}: not in the project`);
        continue;
      }
      apply(e, `wall ${wall.id}`, WALL_RULES, () =>
        slot(`wall:${wall.id}`, () => ({ target: 'wall', wallId: wall.id, patch: {} })),
      );
    } else if (e.target === 'openingType') {
      if (draft.config.openingTypes === undefined || !Object.hasOwn(draft.config.openingTypes, e.tag)) {
        rejected.push(`opening type ${e.tag || '?'}: not in the project`);
        continue;
      }
      apply(e, `opening type ${e.tag}`, TYPE_RULES, () =>
        slot(`type:${e.tag}`, () => ({ target: 'openingType', tag: e.tag, patch: {} })),
      );
    } else if (BUILDING_RULES[e.field] !== undefined) {
      apply(e, 'project', BUILDING_RULES, () => slot('building', () => ({ target: 'building', patch: {} })));
    } else {
      apply(e, 'project', CONFIG_RULES, () => slot('config', () => ({ target: 'config', patch: {} })));
    }
  }

  for (const [key, h] of headers) {
    const where = `opening ${h.opening.id}`;
    const patch = (): Record<string, unknown> =>
      slot(key, () => ({ target: 'opening', wallId: h.wall.id, openingId: h.opening.id, patch: {} }));
    if (h.section === null) {
      // seção vazia: volta para a tabela / peça deitada
      Object.assign(patch(), { header: undefined, headerMark: undefined });
      continue;
    }
    const existing = h.opening.header;
    const section = h.section ?? (typeof existing?.section === 'string' ? existing.section : undefined);
    const plies = h.plies ?? existing?.plies;
    if (section === undefined || plies === undefined) {
      rejected.push(`${where} header: a header needs section and plies together`);
      continue;
    }
    Object.assign(patch(), { header: { section, plies }, headerMark: undefined });
  }

  // alvo cujo patch ficou vazio (tudo recusado) não vira edição
  const edits = [...patches.values()].filter((p) => Object.keys(p.patch).length > 0).map((p) => p.edit);
  return { edits, rejected };
}

const LABELS: Readonly<Record<string, string>> = {
  center: 'Center of RO',
  offset: 'Left edge of RO',
  roughWidth: 'RO width',
  roughHeight: 'RO height',
  sillHeight: 'Sill height',
  headerHeight: 'Top of RO',
  jackStuds: 'Jack studs per side',
  kingStuds: 'King studs per side',
  header: 'Header',
  height: 'Height',
  section: 'Section',
  exterior: 'Position',
  bearing: 'Load',
  floorsSupported: 'Floors above',
  width: 'Width',
  studSpacing: 'Stud spacing',
  groundSnowLoad: 'Ground snow load',
  buildingWidth: 'Building width',
  windSpeed: 'Wind speed',
};
const MEASURES: ReadonlySet<string> = new Set([
  'center',
  'offset',
  'roughWidth',
  'roughHeight',
  'sillHeight',
  'headerHeight',
  'height',
  'width',
  'studSpacing',
  'buildingWidth',
]);

function valueText(field: string, value: unknown): string {
  if (value === undefined) return 'cleared';
  if (field === 'header' && typeof value === 'object' && value !== null) {
    const h = value as { section?: unknown; plies?: unknown };
    return `${String(h.section)} × ${String(h.plies)}`;
  }
  if (field === 'exterior') return value === true ? 'Exterior' : 'Interior';
  if (field === 'bearing') return value === true ? 'Bearing' : 'Non-bearing';
  if (field === 'groundSnowLoad') return `${String(value)} psf`;
  if (field === 'windSpeed') return `${String(value)} mph`;
  if (MEASURES.has(field) && typeof value === 'number') return formatMeasure(value);
  return String(value);
}

/** O que o patch muda, em inglês: "Header → 2x12 × 3; Jack studs per side → 2". A marca do schedule que sai junto com o header não é dita. */
function patchText(patch: Readonly<Record<string, unknown>>): string {
  const clearingPosition = 'center' in patch && 'offset' in patch;
  return Object.entries(patch)
    .filter(
      ([field, value]) =>
        !(field === 'headerMark' && value === undefined) &&
        !(clearingPosition && value === undefined && (field === 'center' || field === 'offset')),
    )
    .map(([field, value]) => `${LABELS[field] ?? field} → ${valueText(field, value)}`)
    .join('; ');
}

/** As edições em linhas para a tela; edições iguais em várias aberturas (ou paredes) viram uma linha só. */
export function describeEdits(edits: readonly DraftEdit[], _draft?: ProjectDraft): string[] {
  const lines: { kind: 'opening' | 'wall' | 'single'; ids: string[]; subject: string; text: string }[] = [];
  for (const e of edits) {
    const text = patchText(e.patch as Record<string, unknown>);
    if (text === '') continue;
    if (e.target === 'opening' || e.target === 'wall') {
      const id = e.target === 'opening' ? e.openingId : e.wallId;
      const same = lines.find((l) => l.kind === e.target && l.text === text);
      if (same !== undefined) same.ids.push(id);
      else lines.push({ kind: e.target, ids: [id], subject: '', text });
    } else {
      lines.push({
        kind: 'single',
        ids: [],
        subject: e.target === 'openingType' ? `Opening type ${e.tag}` : 'Project settings',
        text,
      });
    }
  }
  return lines.map((l) => {
    if (l.kind === 'single') return `${l.subject}: ${l.text}`;
    const noun = l.kind === 'opening' ? 'opening' : 'wall';
    if (l.ids.length === 1) return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${l.ids[0]}: ${l.text}`;
    const shown = l.ids.length <= 4 ? l.ids.join(', ') : `${l.ids.slice(0, 3).join(', ')}, …`;
    return `${l.ids.length} ${noun}s (${shown}): ${l.text}`;
  });
}

const STRUCTURAL_OPENING: ReadonlySet<string> = new Set(['header', 'jackStuds', 'kingStuds']);
// `exterior` escolhe a tabela do header (e se a neve conta): trocar tira um erro de header sem resolver nada.
const STRUCTURAL_WALL: ReadonlySet<string> = new Set(['bearing', 'floorsSupported', 'section', 'exterior']);
const STRUCTURAL_CONFIG: ReadonlySet<string> = new Set(['studSpacing']);

/** A proposta mexe em valor que vem do engenheiro ou do desenho (header, jacks, kings, carga, dados do prédio). */
export function touchesStructural(edits: readonly DraftEdit[]): boolean {
  return edits.some((e) => {
    const fields = Object.keys(e.patch);
    if (e.target === 'building') return fields.length > 0;
    if (e.target === 'opening') return fields.some((f) => STRUCTURAL_OPENING.has(f));
    if (e.target === 'wall') return fields.some((f) => STRUCTURAL_WALL.has(f));
    if (e.target === 'config') return fields.some((f) => STRUCTURAL_CONFIG.has(f));
    return false;
  });
}

/**
 * A edição como viaja do servidor para a tela. A resposta de uma server action (como o JSON) perde as chaves com valor
 * `undefined` — e é assim que um patch diz "apague este campo". Na viagem a limpeza vai como `null`; `fromWire` a
 * devolve como `undefined` antes de aplicar. Sem isto o cartão diria "resolvido" e o Apply não mudaria nada.
 */
export type WireEdit = DraftEdit extends infer E
  ? E extends { patch: unknown }
    ? Omit<E, 'patch'> & { patch: Record<string, unknown> }
    : never
  : never;

export function toWire(edits: readonly DraftEdit[]): WireEdit[] {
  return edits.map(
    (e) =>
      ({
        ...e,
        patch: Object.fromEntries(Object.entries(e.patch).map(([k, v]) => [k, v === undefined ? null : v])),
      }) as WireEdit,
  );
}

export function fromWire(edits: readonly WireEdit[]): DraftEdit[] {
  return edits.map(
    (e) =>
      ({
        ...e,
        patch: Object.fromEntries(Object.entries(e.patch).map(([k, v]) => [k, v === null ? undefined : v])),
      }) as DraftEdit,
  );
}
