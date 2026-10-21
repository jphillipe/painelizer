/**
 * Ajuda por família de issue (S21.4): o que a mensagem do motor / da extração significa para quem revisa e o que
 * fazer, mais o "conserto rápido" que a interface oferece sem abrir nada (vento, altura de header, abertura que a
 * leitura não posicionou). Texto em inglês; a mensagem original continua nos detalhes.
 */

import type { ProjectDraft } from './draft';
import { parseMeasureText } from './measure';
import type { Issue } from './problems';

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
  // extração
  ABERTURA_SEM_POSICAO: {
    what: 'The AI found this door or window on the plan but no dimension to its axis, so the opening is NOT in the project: the wall panels come out without it.',
    fix: 'Add it at the wall center with the button and drag it into place on the plan, or let the shop cut it on site.',
  },
  ABERTURA_SEM_MEDIDA: {
    what: 'The AI found an opening with no schedule tag and no rough opening size, so it is not in the project.',
    fix: 'Add it with the button, then give it a type and a rough opening in the inspector.',
  },
  ALTURA_PADRAO: {
    what: 'The set has no elevations or schedule with a head height, so these openings use the factory default top of RO.',
    fix: 'If the elevations say otherwise, type the header height below; it applies to every opening without its own.',
  },
  ALTURA_RO_PORTA: {
    what: 'The reading gave this door its RO width but not its height; the RO runs from the subfloor to the header.',
    fix: 'Check the door schedule; set the RO height on the opening if it differs.',
  },
  FOLHAS_FORA: { what: 'Some useful sheets did not fit the page budget of the reading.', fix: 'Send fewer files, or the specific sheets, and read again.' },
  // editor
  'wall.height': { what: 'The engine cannot cut studs without the wall height.', fix: 'Fill in the project data, or set the height on each wall.' },
  'config.studLength': { what: 'The precut stud lengths are missing (wall height minus three plates).', fix: 'Fill in the project data; the wall height derives them.' },
  'config.building': { what: 'Bearing walls with openings get their headers from the IRC table, which needs the ground snow load and the building width.', fix: 'Fill in the project data.' },
  'wall.floorsSupported': { what: 'The IRC header table needs how many floors the wall carries.', fix: 'Fill in the project data, or set it per wall.' },
  'opening.position': { what: 'The opening has no center and no left edge.', fix: 'Select it and type the position, or drag it on the plan.' },
  'plan.open': { what: 'The walls do not close into a house: two walls cross, or three ends meet at a point.', fix: 'Fix the end of one of the walls named; drag it on the plan or edit start / end.' },
  'wall.noAxis': { what: 'The wall is not parallel to the x or y axis.', fix: 'Edit start / end so one coordinate is the same on both.' },
};

/** Problemas do motor sem código, reconhecidos pelo texto. */
const TEXT_HELP: readonly { re: RegExp; help: IssueHelp }[] = [
  {
    re: /header fora da tabela/,
    help: {
      what: 'The IRC table has no header for this span with these loads: an engineer has to size it.',
      fix: 'Select the opening and specify the header (section and plies) the engineer gives you, or check floor span and floors above in Project settings.',
    },
  },
  {
    re: /não cabe na plate/,
    help: { what: 'The opening runs past the end of the wall plate.', fix: 'Move the opening or lengthen the wall.' },
  },
  {
    re: /parede não portante com RO de/,
    help: { what: 'A non-bearing wall can only use a flat header up to the code limit; this opening is wider.', fix: 'Select the opening and specify a header.' },
  },
];

export function helpFor(issue: Issue): IssueHelp | undefined {
  const mapped = ISSUE_HELP[issue.kind ?? issue.code ?? ''];
  if (mapped !== undefined) return mapped;
  return TEXT_HELP.find((t) => t.re.test(issue.text))?.help;
}

/** Conserto que a lista oferece na hora, sem abrir inspetor nem configurações. */
export type QuickFix =
  | { kind: 'wind' }
  | { kind: 'headerHeight' }
  | { kind: 'addOpening'; wallId: string; openingId: string; tag: string | undefined };

export function quickFixFor(issue: Issue): QuickFix | undefined {
  if (issue.code === 'WIND_SPEED_MISSING') return { kind: 'wind' };
  if (issue.code === 'ALTURA_PADRAO') return { kind: 'headerHeight' };
  if ((issue.code === 'ABERTURA_SEM_POSICAO' || issue.code === 'ABERTURA_SEM_MEDIDA') && issue.wallId !== undefined) {
    // `extração ABERTURA_SEM_POSICAO: parede I9, abertura I9-U2-1 (U2): …` — a abertura não existe no draft, então o
    // id vem do texto, não do índice.
    const m = /\babertura (\S+?)(?: \(([^)]+)\))?:/.exec(issue.text);
    if (m) return { kind: 'addOpening', wallId: issue.wallId, openingId: m[1]!, tag: m[2] };
  }
  return undefined;
}

/**
 * Avisos da leitura são texto fixo (`outcome.warnings`): quando o humano já resolveu no draft, somem da lista —
 * abertura que a leitura não posicionou e agora existe; altura de header dada no projeto; porta com RO completo.
 */
export function readingWarningResolved(issue: Issue, draft: ProjectDraft): boolean {
  if (issue.source !== 'extraction') return false;
  const opening = (id: string) => draft.walls.flatMap((w) => w.openings).find((o) => o.id === id);
  switch (issue.code) {
    case 'ABERTURA_SEM_POSICAO':
    case 'ABERTURA_SEM_MEDIDA': {
      const fix = quickFixFor(issue);
      return fix?.kind === 'addOpening' && opening(fix.openingId) !== undefined;
    }
    case 'ALTURA_PADRAO': {
      // A conversão grava o padrão da fábrica em config.headerHeight junto com o aviso: resolvido só quando o
      // projeto passa a ter OUTRA altura (dada pelo humano).
      const m = /topo do RO a (.+?) do subfloor/.exec(issue.text);
      const standard = m === null ? undefined : parseMeasureText(m[1]!);
      const current = draft.config.headerHeight;
      if (current === undefined) return false;
      return !(standard !== undefined && standard.ok && standard.value !== undefined && Math.abs(standard.value - current) < 1 / 32);
    }
    case 'ALTURA_RO_PORTA':
      return issue.openingId !== undefined && opening(issue.openingId)?.roughHeight !== undefined;
    default:
      return false;
  }
}
