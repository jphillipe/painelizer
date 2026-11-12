/**
 * Conserto em grupo (S49): o que a linha de uma causa oferece para resolver todas as ocorrências de uma vez, e as
 * edições que isso dá (`DraftEdit`, aplicadas pelo editor num commit só — um Ctrl+Z desfaz o conserto inteiro).
 * Nada aqui edita: só decide e monta. Só as aberturas listadas na linha entram.
 *
 * - Header (`HEADER_OUT_OF_TABLE`, `FLAT_HEADER_CRIPPLES`, `FLAT_HEADER_SPAN`): o header do engenheiro vai direto em
 *   cada abertura (`header`), nunca pelo header schedule — a entrada do schedule exige kings, que passariam por cima
 *   da tabela de vento (R602.7.5) nas paredes externas.
 * - Altura de porta × header (`DOOR_RO_HEIGHT_MISMATCH`): só o humano sabe qual medida vale. Usar a altura do header
 *   como RO não muda a madeira (studs, plates, header: o RO da porta não entra na geometria das peças; a chapa de
 *   sheathing, quando há, acompanha o RO); pôr o header na altura do RO muda o framing.
 */

import type { ProjectDraft } from './draft';
import type { IssueGroup, OpeningInfo } from './issue-groups';
import type { DraftEdit } from './state';

export interface OpeningRef {
  wallId: string;
  openingId: string;
}

/** Aberturas que um "Set header" alcança: todas as da linha (`all`) ou as de um tipo (`tag:<T>`; sem tipo, `tag:`). */
export interface HeaderScope {
  key: string;
  label: string;
  openings: OpeningRef[];
}

export type GroupFix =
  | { kind: 'setHeader'; scopes: HeaderScope[] }
  | { kind: 'doorHeight'; roughHeight: number; headerBase: number; openings: OpeningRef[] };

const HEADER_FAMILIES: ReadonlySet<string> = new Set([
  'HEADER_OUT_OF_TABLE',
  'FLAT_HEADER_CRIPPLES',
  'FLAT_HEADER_SPAN',
]);

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** As aberturas da linha, sem repetir, na ordem das ocorrências. */
function refsOf(group: IssueGroup): OpeningRef[] {
  const seen = new Set<string>();
  const out: OpeningRef[] = [];
  for (const i of group.items) {
    if (i.wallId === undefined || i.openingId === undefined || seen.has(i.openingId)) continue;
    seen.add(i.openingId);
    out.push({ wallId: i.wallId, openingId: i.openingId });
  }
  return out;
}

/** O conserto que a causa oferece; `undefined` quando a família não tem um ou a linha não cita aberturas do projeto. */
export function groupFixFor(group: IssueGroup, openings?: ReadonlyMap<string, OpeningInfo>): GroupFix | undefined {
  const refs = refsOf(group);
  if (refs.length === 0) return undefined;
  if (HEADER_FAMILIES.has(group.key)) {
    const all: HeaderScope = {
      key: 'all',
      label: refs.length === 1 ? 'This opening' : `All ${refs.length} openings`,
      openings: refs,
    };
    const byTag = new Map<string, OpeningRef[]>();
    for (const r of refs) {
      const tag = openings?.get(r.openingId)?.tag ?? '';
      byTag.set(tag, [...(byTag.get(tag) ?? []), r]);
    }
    if (byTag.size < 2) return { kind: 'setHeader', scopes: [all] };
    // tipos em ordem alfabética; as aberturas sem tipo por último
    const tags = [...byTag.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
    return {
      kind: 'setHeader',
      scopes: [
        all,
        ...tags.map((tag) => ({
          key: `tag:${tag}`,
          label: `${tag === '' ? 'No type' : `Type ${tag}`} (${byTag.get(tag)!.length})`,
          openings: byTag.get(tag)!,
        })),
      ],
    };
  }
  if (group.key === 'DOOR_RO_HEIGHT_MISMATCH') {
    // O conserto vale para portas com as mesmas duas medidas. Uma porta diferente na linha não o tira das outras:
    // fica o maior conjunto (no empate, o primeiro), e a tela diz quantas portas ele alcança.
    type DoorSet = { roughHeight: number; headerBase: number; openings: OpeningRef[] };
    const sets = new Map<string, DoorSet>();
    for (const i of group.items) {
      const roughHeight = num(i.params?.['roughHeight']);
      const headerBase = num(i.params?.['headerBase']);
      const ref = refs.find((r) => r.openingId === i.openingId);
      if (roughHeight === undefined || headerBase === undefined || ref === undefined) continue;
      const key = `${roughHeight}|${headerBase}`;
      const set = sets.get(key) ?? { roughHeight, headerBase, openings: [] };
      if (!set.openings.includes(ref)) set.openings.push(ref);
      sets.set(key, set);
    }
    let best: DoorSet | undefined;
    for (const set of sets.values()) if (best === undefined || set.openings.length > best.openings.length) best = set;
    return best === undefined ? undefined : { kind: 'doorHeight', ...best };
  }
  return undefined;
}

export interface HeaderInput {
  section: string;
  plies: number;
  /** Jacks por lado; ausente = não mexe (a abertura fica com o que tinha; sem nada, o motor usa 1). */
  jackStuds?: number;
}

/**
 * Header direto em cada abertura do escopo; a marca do schedule sai (as duas formas não convivem). Os jacks, quando
 * informados, vão no campo da própria abertura ("Jack studs per side" do inspetor): é ele que o motor lê primeiro e
 * o único que a tela mostra.
 */
export function setHeaderEdits(scope: HeaderScope, header: HeaderInput): DraftEdit[] {
  const value = { section: header.section, plies: header.plies };
  return scope.openings.map((o) => ({
    target: 'opening',
    wallId: o.wallId,
    openingId: o.openingId,
    patch: {
      header: value,
      headerMark: undefined,
      ...(header.jackStuds === undefined ? {} : { jackStuds: header.jackStuds }),
    },
  }));
}

/**
 * As duas saídas do aviso de altura de porta.
 * - `roFromHeader`: o RO da porta passa a ser a altura do header (não muda o framing). Pelo tipo do catálogo quando
 *   TODAS as aberturas desse tipo (sem altura própria) estão na linha; senão, na abertura — o tipo pode servir a
 *   portas que não têm o aviso.
 * - `headerFromRo`: o topo do RO de cada abertura sobe até a altura do RO da porta (muda o framing).
 */
export function doorHeightEdits(
  fix: Extract<GroupFix, { kind: 'doorHeight' }>,
  choice: 'roFromHeader' | 'headerFromRo',
  draft: ProjectDraft,
): DraftEdit[] {
  if (choice === 'headerFromRo')
    return fix.openings.map((o) => ({
      target: 'opening',
      wallId: o.wallId,
      openingId: o.openingId,
      patch: { headerHeight: fix.roughHeight },
    }));
  const inFix = new Set(fix.openings.map((o) => o.openingId));
  const all = draft.walls.flatMap((w) => w.openings);
  const byId = new Map(all.map((o) => [o.id, o]));
  /** O tipo pode ser editado: toda abertura que depende da altura dele está na linha. */
  const typeIsOurs = (tag: string): boolean =>
    all.filter((o) => o.tag === tag && o.roughHeight === undefined).every((o) => inFix.has(o.id));
  const edits: DraftEdit[] = [];
  const typed = new Set<string>();
  for (const ref of fix.openings) {
    const o = byId.get(ref.openingId);
    if (o === undefined) continue;
    if (o.tag !== undefined && o.roughHeight === undefined && typeIsOurs(o.tag)) {
      if (!typed.has(o.tag)) {
        typed.add(o.tag);
        edits.push({ target: 'openingType', tag: o.tag, patch: { roughHeight: fix.headerBase } });
      }
    } else {
      edits.push({
        target: 'opening',
        wallId: ref.wallId,
        openingId: ref.openingId,
        patch: { roughHeight: fix.headerBase },
      });
    }
  }
  return edits;
}
