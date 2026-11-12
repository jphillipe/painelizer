/**
 * Onde o clique numa issue leva (S47): cada família (o `kind` do editor ou o código do motor / da leitura — a mesma
 * chave do grupo) sabe qual campo a resolve. O alvo é a seleção (abertura, parede ou projeto) mais os `id` de DOM do
 * campo, que o inspetor e o diálogo de configurações já usam (`o-<abertura>-hby`, `w-<parede>-height`, `b-wind`).
 * Mais de um `id` = candidatos em ordem: vale o primeiro que estiver na tela (a posição da abertura é `center` ou
 * `offset`, conforme o draft). O clique nunca edita nada: só seleciona e foca.
 */

import type { Issue } from './problems';
import type { Selection } from './state';

export interface IssueFocus {
  selection: Selection;
  /** Candidatos em ordem; o primeiro que existir na tela recebe o foco. */
  fieldIds: string[];
}

type Target =
  { scope: 'opening' | 'wall'; fields: readonly string[] } | { scope: 'project'; fields: readonly string[] };

const opening = (...fields: string[]): Target => ({ scope: 'opening', fields });
const wall = (...fields: string[]): Target => ({ scope: 'wall', fields });
const project = (...fields: string[]): Target => ({ scope: 'project', fields });

const HEADER = opening('hby');
const TOP_OF_RO = opening('hh');
const POSITION = opening('center', 'offset');
const WALL_ENDS = wall('sx');

const TARGETS: Readonly<Record<string, Target>> = {
  // abertura — header
  HEADER_OUT_OF_TABLE: HEADER,
  FLAT_HEADER_CRIPPLES: HEADER,
  FLAT_HEADER_SPAN: HEADER,
  HEADER_TOO_THICK: HEADER,
  HEADER_MARK_UNKNOWN: HEADER,
  'opening.headerMark': HEADER,
  // abertura — alturas
  DOOR_RO_HEIGHT_MISMATCH: TOP_OF_RO,
  HEADER_ABOVE_TOP_PLATE: TOP_OF_RO,
  HEADER_NO_ROOM_FOR_JACK: TOP_OF_RO,
  SILL_NO_ROOM: opening('sill'),
  DOOR_RO_HEIGHT_ASSUMED: opening('rh'),
  // abertura — posição
  OPENING_NEAR_CORNER: POSITION,
  OPENING_AT_TEE: POSITION,
  OPENING_NUDGED: POSITION,
  OPENINGS_TOO_CLOSE: POSITION,
  OPENING_OFF_PLATE: POSITION,
  OPENING_OUT_OF_WALL: POSITION,
  OPENING_ESTIMATED: POSITION,
  OPENING_POSITION_MISSING: POSITION,
  'opening.position': POSITION,
  // abertura — tipo e tamanho
  OPENING_TAG_UNKNOWN: opening('size'),
  'opening.tag': opening('size'),
  OPENING_SIZE_MISSING: opening('rw'),
  'opening.size': opening('rw'),
  OPENING_TYPE_MISSING: opening('type'),
  'opening.type': opening('type'),
  // abertura — studs
  HEADER_JACKS_BELOW_TABLE: opening('jacks'),
  HEADER_KINGS_BELOW_TABLE: opening('kings'),
  KINGS_OUT_OF_TABLE: opening('kings'),
  'opening.duplicateId': opening('id'),
  // parede
  'wall.height': wall('height'),
  STUD_LENGTH_MISMATCH: wall('height'),
  STUD_HEIGHT_ABOVE_LIMIT: wall('height'),
  'wall.section': wall('section'),
  'wall.exterior': wall('ext'),
  'wall.bearing': wall('bearing'),
  'wall.wallType': wall('type'),
  WALL_TYPE_MISMATCH: wall('type'),
  'wall.floorsSupported': wall('floors'),
  'wall.length': wall('len'),
  'wall.duplicateId': wall('id'),
  'wall.ends': WALL_ENDS,
  'wall.noAxis': WALL_ENDS,
  WALL_OFF_AXIS: WALL_ENDS,
  WALL_ZERO_LENGTH: WALL_ENDS,
  // projeto (Project settings)
  WIND_SPEED_MISSING: project('b-wind'),
  'config.building': project('b-snow'),
  HEADER_DATA_MISSING: project('b-snow'),
  'config.studSpacing': project('c-spacing'),
  'config.studLength': project('c-precuts'),
  DEFAULT_HEADER_HEIGHT: project('c-hh'),
  PANEL_OVERWEIGHT: project('pn-weight'),
  PIECE_OVER_STOCK: project('c-stock'),
};

/** Onde o clique numa issue leva. `undefined`: família sem alvo, ou issue sem a parede / abertura que o alvo pede. */
export function focusFor(issue: Issue): IssueFocus | undefined {
  const target = TARGETS[issue.kind ?? issue.code ?? ''];
  if (target === undefined) return undefined;
  if (target.scope === 'project') return { selection: { kind: 'project' }, fieldIds: [...target.fields] };
  if (issue.wallId === undefined) return undefined;
  if (target.scope === 'wall')
    return {
      selection: { kind: 'wall', wallId: issue.wallId },
      fieldIds: target.fields.map((f) => `w-${issue.wallId}-${f}`),
    };
  if (issue.openingId === undefined) return undefined;
  return {
    selection: { kind: 'opening', wallId: issue.wallId, openingId: issue.openingId },
    fieldIds: target.fields.map((f) => `o-${issue.openingId}-${f}`),
  };
}
