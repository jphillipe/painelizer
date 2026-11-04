/**
 * Ajuda por família de issue (S21.4): o que a mensagem do motor / da extração significa para quem revisa e o que
 * fazer, mais o "conserto rápido" que a interface oferece sem abrir nada (vento, altura de header, abertura que a
 * leitura não posicionou). Texto em inglês; a mensagem original continua nos detalhes.
 */

import type { ProjectDraft } from './draft';
import { parseMeasureText } from './measure';
import type { Issue } from './problems';
import { isReviewed } from './state';

/** P2: topo do RO a 82 1/2" do subfloor (`FACTORY_HEADER_HEIGHT` do extract). */
const FACTORY_HEADER_HEIGHT = `6' - 10 1/2"`;

export interface IssueHelp {
  /** O que aconteceu, em uma frase. */
  what: string;
  /** Como resolver, em uma frase; "Fine to leave" quando a fábrica resolve na bancada. */
  fix: string;
}

export const ISSUE_HELP: Readonly<Record<string, IssueHelp>> = {
  // motor — avisos
  WIND_SPEED_MISSING: {
    what: 'Exterior walls with openings get their king studs from IRC table R602.7.5, which depends on the wind speed. Without it the engine uses 1 king per side.',
    fix: 'Type the wind speed from the structural notes below; every exterior opening is recalculated at once.',
  },
  OPENING_AT_TEE: {
    what: 'An interior wall meets this wall in a T right where an opening is: king and jack studs and the ladder blocking want the same spot.',
    fix: 'Check the plan: move the opening or the interior wall a few inches apart. Left as is, the shop sorts it out on the bench.',
  },
  OPENING_NUDGED: {
    what: 'The opening touched a stud or the end of the wall by up to 1 1/2", so the engine slid it the minimum to fit.',
    fix: 'Usually a reading imprecision: check the dimension on the drawing and correct the position if needed.',
  },
  OPENING_NEAR_CORNER: {
    what: 'The king stud lands so close to the end of the wall that the end stud does not fit.',
    fix: 'Either push the opening against the corner or move it away by a stud width.',
  },
  HEADER_JACKS_BELOW_TABLE: {
    what: 'Two openings are so close that the second jack stud does not fit between them; the engine used 1 jack per side.',
    fix: 'If the engineer wants two jacks, move the openings apart or give the opening its own header.',
  },
  HEADER_KINGS_BELOW_TABLE: {
    what: 'Neighbouring openings share king studs because there is no room for the number the wind table asks.',
    fix: 'Move the openings apart, or accept the shared kings if the engineer agrees.',
  },
  // S26: o mesmo código com outro motivo (`params.reason`): o projeto pediu menos que a tabela.
  'HEADER_JACKS_BELOW_TABLE:table': {
    what: 'The opening asks for fewer jack studs than the IRC header table needs for this header and span; the panel uses what was asked.',
    fix: 'Check the jack studs with the engineer, or clear them on the opening to use the table.',
  },
  'HEADER_KINGS_BELOW_TABLE:table': {
    what: 'The opening asks for fewer king studs than table R602.7.5 needs for this span and wind; the panel uses what was asked.',
    fix: 'Check the king studs with the engineer, or clear them on the opening to use the table.',
  },
  STUDS_OVERLAP: {
    what: 'Two stud marks fall on top of each other.',
    fix: 'Fine to leave: the shop doubles the stud or skips the mark.',
  },
  PANEL_OVERWEIGHT: { what: 'The panel is heavier than the limit in Project settings.', fix: 'Lower the max panel length in Project settings or raise the weight limit.' },
  STUD_LENGTH_MISMATCH: { what: 'The stud this wall needs is not one of the precut lengths.', fix: 'Add the length to the precut list in Project settings, or change the wall height.' },
  STUD_HEIGHT_ABOVE_LIMIT: { what: 'The studs are taller than the IRC limit for this section and spacing.', fix: 'Use 2x6 or a tighter spacing, or get an engineer to sign off.' },
  DOOR_RO_HEIGHT_MISMATCH: { what: 'The door rough opening does not match the header height.', fix: 'Check the door height and the header height in Project settings.' },
  FIRE_BLOCKING_REQUIRED: { what: 'A stud cavity is taller than the code allows without fire blocking.', fix: 'The shop adds blocking; nothing to change in the plan.' },
  SPECIES_NOT_IN_TABLE: { what: 'The IRC header table is for SPF No. 2; the project specifies another species.', fix: 'Fine to leave if the engineer accepts the SPF sizes, else set the species in Project settings.' },
  // motor — erros
  HEADER_OUT_OF_TABLE: {
    what: 'The IRC table has no header for this span with these loads: an engineer has to size it.',
    fix: 'Select the opening and specify the header (section and plies) the engineer gives you, or check floor span and floors above in Project settings.',
  },
  OPENING_OFF_PLATE: { what: 'The opening runs past the end of the wall plate.', fix: 'Move the opening or lengthen the wall.' },
  FLAT_HEADER_SPAN: {
    what: 'A non-bearing wall can only use a flat header up to the code limit; this opening is wider.',
    fix: 'Select the opening and specify a header.',
  },
  // extração
  OPENING_UNPLACED: {
    what: 'The AI found this door or window on the plan but no dimension to its axis, so the opening is NOT in the project: the wall panels come out without it.',
    fix: 'Add it at the wall center with the button and drag it into place on the plan, or let the shop cut it on site.',
  },
  OPENING_UNSIZED: {
    what: 'The AI found an opening with no schedule tag and no rough opening size, so it is not in the project.',
    fix: 'Add it with the button, then give it a type and a rough opening in the inspector.',
  },
  DEFAULT_HEADER_HEIGHT: {
    what: 'The set has no elevations or schedule with a head height, so these openings use the factory default top of RO.',
    fix: 'If the elevations say otherwise, type the header height below; it applies to every opening without its own.',
  },
  DOOR_RO_HEIGHT_ASSUMED: {
    what: 'The reading gave this door its RO width but not its height; the RO runs from the subfloor to the header.',
    fix: 'Check the door schedule; set the RO height on the opening if it differs.',
  },
  SHEETS_DROPPED: { what: 'Some useful sheets did not fit the page budget of the reading.', fix: 'Send fewer files, or the specific sheets, and read again.' },
  OPENING_ESTIMATED: {
    what: 'The plan has no dimension for this opening, so the AI measured its position on the drawing by scale. It is in the project at the approximate spot.',
    fix: 'Check it against the plan, drag it into place if needed, then mark the wall as reviewed.',
  },
  ROOM_WITHOUT_DOOR: {
    what: 'The AI listed this room but found no door into it: either it is an open passage or the reading missed the door.',
    fix: 'Check the plan; if there is a door, select the wall and add the opening (O), with the tag from the door schedule.',
  },
  SHEET_DUPLICATE: {
    what: 'The same sheet number came in two files; only one copy went to the AI (the one with a title in the stamp).',
    fix: 'If the other copy is a newer revision, pick its pages and read again.',
  },
  NO_TITLE_BLOCK: {
    what: 'No sheet number was found in any title block, so the first pages of each PDF went as plans, without high-res crops.',
    fix: 'Pick the plan pages and read again: picked pages get the high-res crops.',
  },
  TILES_DROPPED: {
    what: 'Some high-resolution crops of the plan were left out so the request would fit the API size limit; small symbols in those regions may have been missed.',
    fix: 'Send fewer sheets or pick the pages, and read again.',
  },
  // editor
  'wall.height': { what: 'The engine cannot cut studs without the wall height.', fix: 'Fill in the project data, or set the height on each wall.' },
  'config.studLength': { what: 'The precut stud lengths are missing (wall height minus three plates).', fix: 'Fill in the project data; the wall height derives them.' },
  'config.building': { what: 'Bearing walls with openings get their headers from the IRC table, which needs the ground snow load and the building width.', fix: 'Fill in the project data.' },
  'wall.floorsSupported': { what: 'The IRC header table needs how many floors the wall carries.', fix: 'Fill in the project data, or set it per wall.' },
  'opening.position': { what: 'The opening has no center and no left edge.', fix: 'Select it and type the position, or drag it on the plan.' },
  'plan.open': { what: 'The walls do not close into a house: two walls cross, or three ends meet at a point.', fix: 'Fix the end of one of the walls named; drag it on the plan or edit start / end.' },
  'wall.noAxis': { what: 'The wall is not parallel to the x or y axis.', fix: 'Edit start / end so one coordinate is the same on both.' },
};

/** Ajuda pela família do editor ou pelo código (S26: nada pelo texto). */
export function helpFor(issue: Issue): IssueHelp | undefined {
  const reason = issue.params?.['reason'];
  const variant = issue.code !== undefined && typeof reason === 'string' ? ISSUE_HELP[`${issue.code}:${reason}`] : undefined;
  return variant ?? ISSUE_HELP[issue.kind ?? issue.code ?? ''] ?? (issue.code === undefined ? undefined : ISSUE_HELP[issue.code]);
}

/** Conserto que a lista oferece na hora, sem abrir inspetor nem configurações. */
export type QuickFix =
  | { kind: 'wind' }
  | { kind: 'headerHeight' }
  | { kind: 'addOpening'; wallId: string; openingId: string; tag: string | undefined };

export function quickFixFor(issue: Issue): QuickFix | undefined {
  if (issue.code === 'WIND_SPEED_MISSING') return { kind: 'wind' };
  if (issue.code === 'DEFAULT_HEADER_HEIGHT') return { kind: 'headerHeight' };
  if ((issue.code === 'OPENING_UNPLACED' || issue.code === 'OPENING_UNSIZED') && issue.wallId !== undefined) {
    // A abertura não existe no draft (a leitura a deixou fora): o id vem do aviso (`cited`), não do índice.
    const openingId = issue.cited?.openingId;
    const tag = issue.params?.['tag'];
    if (openingId !== undefined) return { kind: 'addOpening', wallId: issue.wallId, openingId, tag: typeof tag === 'string' ? tag : undefined };
  }
  return undefined;
}

/**
 * Avisos da leitura são fixos (`outcome.warnings`): quando o humano já resolveu no draft, somem da lista —
 * abertura que a leitura não posicionou e agora existe; altura de header dada no projeto; porta com RO completo.
 */
export function readingWarningResolved(issue: Issue, draft: ProjectDraft): boolean {
  if (issue.source !== 'extraction') return false;
  const opening = (id: string) => draft.walls.flatMap((w) => w.openings).find((o) => o.id === id);
  switch (issue.code) {
    case 'OPENING_UNPLACED':
    case 'OPENING_UNSIZED': {
      const fix = quickFixFor(issue);
      return fix?.kind === 'addOpening' && opening(fix.openingId) !== undefined;
    }
    case 'DEFAULT_HEADER_HEIGHT': {
      // A conversão grava o padrão da fábrica em config.headerHeight junto com o aviso: resolvido só quando o
      // projeto passa a ter OUTRA altura (dada pelo humano). Aviso de antes da S26 vem sem parâmetro: o padrão é P2.
      const height = issue.params?.['height'];
      const standard = parseMeasureText(typeof height === 'string' ? height : FACTORY_HEADER_HEIGHT);
      const current = draft.config.headerHeight;
      if (current === undefined) return false;
      return !(standard !== undefined && standard.ok && standard.value !== undefined && Math.abs(standard.value - current) < 1 / 32);
    }
    case 'DOOR_RO_HEIGHT_ASSUMED':
      return issue.openingId !== undefined && opening(issue.openingId)?.roughHeight !== undefined;
    case 'OPENING_ESTIMATED': {
      // Posição medida pela escala: resolvido quando o humano revisou a parede (ou tirou a abertura).
      if (issue.wallId === undefined) return false;
      const wall = draft.walls.find((w) => w.id === issue.wallId);
      if (wall === undefined) return false;
      if (issue.openingId !== undefined && opening(issue.openingId) === undefined) return true;
      return isReviewed(wall);
    }
    default:
      return false;
  }
}
