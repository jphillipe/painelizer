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
  FLAT_HEADER_CRIPPLES: {
    what: 'A non-bearing opening whose flat header sits more than 24" below the top plate. The panel keeps the flat header and adds cripples above it.',
    fix: 'Have the factory review it, or select the opening and specify a header.',
  },
  DOOR_RO_HEIGHT_MISMATCH: { what: 'The door rough opening does not match the header height.', fix: 'Check the door height and the header height in Project settings.' },
  SPECIES_NOT_IN_TABLE: { what: 'The IRC header table is for SPF No. 2; the project specifies another species.', fix: 'Fine to leave if the engineer accepts the SPF sizes, else set the species in Project settings.' },
  // motor — erros
  HEADER_OUT_OF_TABLE: {
    what: 'The IRC table has no header for this span with these loads: an engineer has to size it.',
    fix: 'Select the opening and specify the header (section and plies) the engineer gives you, or check floor span and floors above in Project settings.',
  },
  PANEL_BREAK_INVALID: {
    what: 'A panel break you set is on an opening, a tee, a corner or off the stud layout.',
    fix: 'Select the wall and drag the break to one of the marked spots on the plan, or reset the wall to automatic breaks.',
  },
  PANEL_TOO_LONG: {
    what: 'With the breaks you set, one panel is longer than the max panel length in Project settings.',
    fix: 'Select the wall and add a break on the plan, or reset the wall to automatic breaks.',
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
  'plan.open': { what: 'The walls do not close into a house: two walls cross, or four ends meet at a point.', fix: 'Fix the end of one of the walls named; drag it on the plan or edit start / end.' },
  'wall.noAxis': { what: 'The wall is not parallel to the x or y axis.', fix: 'Edit start / end so one coordinate is the same on both.' },

  // S47: toda família tem "o que é" e "como resolver", citando o campo pelo nome da tela.
  // editor — parede
  'wall.section': { what: 'The wall has no stud section and its wall type does not give one.', fix: 'Select the wall and set Section (2x4 or 2x6), or give it a wall type.' },
  'wall.exterior': { what: 'The wall does not say whether it is exterior or interior.', fix: 'Select the wall and set Position.' },
  'wall.bearing': { what: 'The wall does not say whether it carries load.', fix: 'Select the wall and set Load: bearing walls get IRC headers, non-bearing walls get a flat header.' },
  'wall.wallType': {
    what: 'The wall uses a wall type that is not in the project wall types, and the wall itself does not give section, position or load.',
    fix: 'Select the wall and pick an existing Wall type, or add the type to the project wall types.',
  },
  'wall.length': { what: 'A wall given by length has no length.', fix: 'Select the wall and type its Length.' },
  'wall.ends': { what: 'A wall drawn in plan needs both a start and an end point.', fix: 'Select the wall and fill in Start and End, or drag its ends on the plan.' },
  'wall.planLength': {
    what: 'A wall drawn in plan also carries a length; in plan the length comes from its start and end.',
    fix: 'This comes from a hand-edited project file: remove "length" from that wall in the file and open it again.',
  },
  'wall.planLayoutOrigin': {
    what: 'A wall drawn in plan also carries a layout origin; in plan the layout comes from the corners.',
    fix: 'This comes from a hand-edited project file: remove "layoutOrigin" from that wall in the file and open it again.',
  },
  'wall.duplicateId': { what: 'Two walls have the same id.', fix: 'Select one of them and change its Id.' },
  'walls.mixed': {
    what: 'Some walls are drawn in plan (start / end) and others only have a length; a project uses one form.',
    fix: 'Give every wall a start and an end, or keep them all by length.',
  },
  'walls.empty': { what: 'There is nothing to frame yet.', fix: 'Draw a wall on the plan (Draw wall) or add one with Add wall.' },
  // editor — abertura
  'opening.size': { what: 'The opening has no schedule type and no rough opening size.', fix: 'Select the opening and type RO width and RO height, or pick a type in Size by.' },
  'opening.type': { what: 'The opening has no schedule type and does not say whether it is a window or a door.', fix: 'Select the opening and set Type, or pick a type in Size by.' },
  'opening.tag': { what: 'The opening uses a type that is not in the opening schedule.', fix: 'Select the opening and pick an existing type in Size by, or add the type to the schedule.' },
  'opening.headerMark': {
    what: 'The opening points to a header mark that is not in the header schedule.',
    fix: 'Select the opening and pick another option in Header, or add the mark to the header schedule.',
  },
  'opening.duplicateId': { what: 'Two openings have the same id; opening ids are unique in the project.', fix: 'Select one of them and change its Id.' },
  // editor — projeto
  'config.studSpacing': { what: 'The project does not say how far apart the studs are.', fix: 'Open Project settings and set Stud spacing (16" is the usual value).' },

  // motor — avisos
  WALL_TYPE_MISMATCH: {
    what: 'The wall sets a section, position or load different from its wall type; the panel follows the wall.',
    fix: 'If that is intended, leave it. Otherwise select the wall and clear the field, or pick another Wall type.',
  },
  BLOCKING_SKIPPED: {
    what: 'A blocking row has no blocks across an opening, a tee ladder or another row at the same height.',
    fix: 'Leave it if the row is meant to stop there; otherwise select the wall and change the row Center height or its From / To.',
  },

  // motor — erros de abertura e header
  HEADER_DATA_MISSING: {
    what: 'A bearing wall with openings gets its headers from the IRC table, which needs the ground snow load, the building width and the floors the wall carries.',
    fix: 'Fill in the building data in Project settings and the floors above on the wall, or give the opening its own Header.',
  },
  KINGS_OUT_OF_TABLE: {
    what: 'The wind table (R602.7.5) has no king stud count for this opening width and wind speed.',
    fix: 'Select the opening and type the King studs per side the engineer gives you.',
  },
  OPENING_OUT_OF_WALL: { what: 'With its king and jack studs the opening runs past the end of the wall.', fix: 'Select the opening and move it in from the end, or make the wall longer.' },
  CORNER_STUD_OFF_PLATE: {
    what: 'The corner stud does not fit on the wall plate: the wall is too short for its corner.',
    fix: 'Check the wall ends on the plan: lengthen the wall, or change which wall runs through the corner (Start corner / End corner).',
  },
  HEADER_TOO_THICK: { what: 'The header given for the opening is thicker than the wall.', fix: 'Select the opening and reduce Plies or change Header section, or make the wall 2x6.' },
  HEADER_ABOVE_TOP_PLATE: {
    what: 'The header sits so high that it would pass the top plate.',
    fix: 'Select the opening and lower Top of RO, pick a shallower header, or raise the wall Height.',
  },
  HEADER_NO_ROOM_FOR_JACK: { what: 'The top of the rough opening is so low that no jack stud fits under the header.', fix: 'Select the opening and raise Top of RO.' },
  SILL_NO_ROOM: { what: 'The bottom of the rough opening is so low that the sill does not fit on the bottom plate.', fix: 'Select the opening and raise Sill height, or make it a door.' },
  OPENINGS_TOO_CLOSE: {
    what: 'Two openings are too close for their jack studs and a shared king stud.',
    fix: 'Select one of them and move it away, or replace the two with one wider opening.',
  },
  OPENING_TAG_UNKNOWN: { what: 'The opening uses a type that is not in the opening schedule.', fix: 'Select the opening and pick an existing type in Size by, or add the type to the schedule.' },
  HEADER_MARK_UNKNOWN: {
    what: 'The opening points to a header mark that is not in the header schedule.',
    fix: 'Select the opening and pick another option in Header, or add the mark to the header schedule.',
  },
  OPENING_TYPE_MISSING: { what: 'The opening has no schedule type and does not say whether it is a window or a door.', fix: 'Select the opening and set Type, or pick a type in Size by.' },
  OPENING_SIZE_MISSING: { what: 'The opening has no schedule type and no rough opening size.', fix: 'Select the opening and type RO width and RO height, or pick a type in Size by.' },
  OPENING_POSITION_MISSING: { what: 'The opening has no center and no left edge.', fix: 'Select it and type the position, or drag it on the plan.' },

  // motor — erros da planta
  WALLS_CROSS: { what: 'Two walls cross each other.', fix: 'Select one of them and split it at the crossing (Split at), so the walls meet end to side.' },
  WALLS_OVERLAP: { what: 'Two walls lie on top of each other along the same line.', fix: 'Remove the duplicate, or shorten one so they meet end to end.' },
  WALL_END_TWO_JOINTS: {
    what: 'One wall end meets two walls at the same point: four ends at a point, or a corner and a tee together.',
    fix: 'Move one of the walls so each end meets a single wall.',
  },
  CORNER_ENDS_CONFLICT: {
    what: 'Both walls of a corner are told the same thing: both run through it, or both stop at it.',
    fix: 'Select one of the walls and set its Start corner / End corner back to Auto.',
  },
  SPLIT_TEE_ENDS: {
    what: 'A wall meets two walls right where they join in line, and the corner rule set on it cannot be honoured there.',
    fix: 'Select the wall and set that end (Start corner / End corner) back to Auto.',
  },
  WALL_OFF_AXIS: { what: 'The wall is not parallel to the x or y axis.', fix: 'Edit start / end so one coordinate is the same on both.' },
  WALL_ZERO_LENGTH: { what: 'Start and end of the wall are the same point.', fix: 'Select the wall and move one end, or remove the wall.' },
  TEE_IN_OPENING: { what: 'An interior wall meets this wall inside a rough opening.', fix: 'Move the opening or the interior wall so the tee lands on studs, not in the opening.' },
  TEE_WITHOUT_STUD: {
    what: 'Where an interior wall meets this wall there is no stud on one side to hold the ladder blocking.',
    fix: 'Move the interior wall or the opening next to it by a few inches.',
  },

  // motor — erros de painel e de plate
  CANNOT_SPLIT: {
    what: 'The wall is longer than the panel limit and has no free layout stud where it could be split.',
    fix: 'Select the wall and add a break on the plan, raise Max panel length in Project settings, or move the opening that covers the split zone.',
  },
  LAP_NO_ROOM: {
    what: 'After a panel break there is no room for the double top plate to lap onto the next panel.',
    fix: 'Select the wall and move the break, or lower Top plate lap / Min lap in Project settings.',
  },
  SPLICE_NO_STUD: {
    what: 'A plate is longer than the longest stock length and there is no stud where it could be spliced.',
    fix: 'Select the wall and add a panel break, or add a longer length to Stock lengths in Project settings.',
  },
  PIECE_OVER_STOCK: { what: 'A piece in the material list is longer than the longest stock length.', fix: 'Add a longer length to Stock lengths in Project settings.' },
  PANEL_FILE_CLASH: { what: 'Two panels would be written to the same file name.', fix: 'Rename one of the walls so the panel ids differ.' },

  // motor — erros de studs extras, posts, blocking e sheathing
  EXTRA_STUD_IN_OPENING: {
    what: 'An extra stud falls on the king studs, jack studs or rough opening of an opening.',
    fix: 'Select the wall and move the extra stud (Left edge), or remove it.',
  },
  EXTRA_STUD_OUT_OF_WALL: { what: 'An extra stud runs past the end of the wall.', fix: 'Select the wall and correct the extra stud Left edge or Count.' },
  POST_INVALID: { what: 'A post has no valid position or size.', fix: 'Select the wall and set the post Left edge and Size (4x4, 4x6 or 6x6).' },
  POST_DEPTH_MISMATCH: { what: 'The post has no face equal to the wall depth.', fix: 'Select the wall and pick a post Size that fills the wall thickness.' },
  POST_OUT_OF_WALL: { what: 'A post runs past the end of the wall.', fix: 'Select the wall and correct the post Left edge.' },
  POST_IN_OPENING: { what: 'A post falls on the king studs, jack studs or rough opening of an opening.', fix: 'Select the wall and move the post, or move the opening.' },
  POST_OVERLAP: { what: 'A post lands on another full-height stud.', fix: 'Select the wall and move the post or the stud it lands on.' },
  BLOCKING_PRESET_UNKNOWN: {
    what: 'A blocking row uses a preset that the project does not have.',
    fix: 'Select the wall and pick another preset for the row, or add the preset to the project blocking presets.',
  },
  BLOCKING_ROW_INVALID: {
    what: 'A blocking row is outside the wall, or its center does not fit between the plates.',
    fix: 'Select the wall and correct the row Center height and its From / To.',
  },
  SHEATHING_INVALID: { what: 'A sheathing setting is out of range (thickness, sheet size, overhang or nailing).', fix: 'Open Project settings and correct the sheathing values.' },

  // arquivo e motor
  PROJECT_INVALID: { what: 'A value in the project file is not valid.', fix: 'See Details for the field; correct it in the editor or in the file and open it again.' },
  PROJECT_JSON_INVALID: { what: 'The file is not valid JSON, so it cannot be opened as a project.', fix: 'Fix the syntax in a text editor, or download the project file again from the app.' },
  ENGINE_INTERNAL: { what: 'The engine stopped on an internal check.', fix: 'See Details for the engine message and send it to support with the project file.' },
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
