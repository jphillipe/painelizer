/**
 * Textos da folha do painel e da planta (S28.1 → S34), num lugar só: cabeçalho, vista, cotas, lista de peças,
 * cortes na obra, legenda, avisos e os `<title>` da planta. Sempre em inglês (P51 resolvida: a fábrica quer a folha
 * e a planta em inglês; o português da S34 saiu).
 *
 * Termos técnicos seguem `docs/02-framing.md` (stud, king, jack, header, sill, cripple, RO, plate…). Puro: nada
 * aqui lê relógio, ambiente ou rede.
 */

import { warningMessage, type Warning } from '../../messages';
import type { SheathingFace } from '../../config';
import type { BlockingKind, FieldCut, MemberRole, Panel, PanelOpening, PanelSheathing, PostMember, SheathingOverhangs, SheathingSheet } from '../../panel';
import { formatFeetInches, formatInches } from '../../units';
import type { CutRole } from '../cutlist';

type FacingInput = { exterior?: boolean; facing?: Panel['facing'] };

/** Todas as frases da folha e da planta. */
export interface SheetStrings {
  /** Nome de cada papel na lista de peças, com a letra da legenda. */
  cutRoleName: Readonly<Record<CutRole, string>>;
  /** Legenda no rodapé. */
  legend: string;
  /** Legenda no rodapé do painel com post (S37): a mesma, com a letra P. */
  legendWithPosts: string;
  /** Dados do painel na segunda linha do cabeçalho. */
  infoLine(panel: Panel, pieces: number, weightLb: number): string;
  /** Data e revisão no canto do cabeçalho; vazio quando não há nenhuma. */
  stampLine(date: string | undefined, revision: string | undefined): string;
  /** Linha da vista no cabeçalho (hipótese P24). */
  viewNote(panel: FacingInput): string;
  /** Nota curta da face no topo do desenho. */
  faceNote(panel: FacingInput): string;
  /** Rótulo da cota do avanço da double top plate. */
  overhangLabel(overhang: number): string;
  /** Rótulo de uma fileira de blocking (S36): letra, uso e centro ao subfloor. */
  blockingRow(row: { kind: BlockingKind; label?: string; center: number }): string;
  /** Id e tipo da abertura, dentro do vão. */
  openingLabel(o: PanelOpening): string;
  /** Textos das cotas de altura da abertura. Porta (base do RO em 0, ou abaixo): uma linha só. */
  openingDim: {
    width(w: number): string;
    sill(base: number): string;
    height(h: number): string;
    header(top: number): string;
    door(h: number, top: number, flush: boolean): string;
  };
  /** Cabeçalhos e rodapé da lista de peças. */
  pieceList: {
    title: string;
    qty: string;
    role: string;
    section: string;
    feet: string;
    inches: string;
    total: string;
    weight(lb: number): string;
    weightNote: string;
    /** Nota do peso no painel com chapa (S38). */
    weightNoteSheathed: string;
    fieldCuts: string;
  };
  /** Rótulo do corte na obra, sobre a peça. */
  fieldCutLabel(cut: FieldCut): string;
  /** `<title>` do trecho hachurado do corte na obra. */
  fieldCutTitle(cut: FieldCut): string;
  /** Linha do corte na obra na lista de peças. */
  fieldCutItem(cut: FieldCut): string;
  /**
   * Posts do painel (S37): título; por post, a linha do rótulo/seção/x e a dos conectores (texto do projeto,
   * "base: … · top: …"; ausente sem conector); a nota da hipótese, em linhas.
   */
  posts: {
    title: string;
    item(post: Pick<PostMember, 'section' | 'x' | 'label'>): string;
    connectors(post: Pick<PostMember, 'base' | 'top'>): string | undefined;
    note: readonly string[];
  };
  /**
   * Sheathing do painel (S38): título, resumo, área e peso, pregação (P48), avanços (canto, linha de piso) e a nota da
   * hipótese; legenda do contorno tracejado e `<title>` de cada chapa. Só no painel com chapa.
   */
  sheathing: {
    title: string;
    summary(s: PanelSheathing): string;
    area(s: PanelSheathing): string;
    nailing(s: PanelSheathing): string;
    corner(face: SheathingFace, o: SheathingOverhangs, both: boolean): string | undefined;
    floor(o: SheathingOverhangs): string | undefined;
    note: readonly string[];
    legend: string;
    sheetTitle(sheet: SheathingSheet): string;
  };
  /** Texto do aviso no rodapé (depois do código). */
  warning(w: Warning): string;
  /** Planta (S16). */
  plan: {
    title: string;
    summary(walls: number, panels: number, width: number, depth: number): string;
    /** Rótulo da parede na planta: o id e, quando a parede tem, o tipo (`W01 · WT-1S`; S35). */
    wallLabel(wallId: string, wallType: string | undefined): string;
    wallTitle(wallId: string, section: string, plateLength: number, panels: number, wallType?: string): string;
    openingTitle(id: string, type: 'window' | 'door', roughWidth: number, wallId: string): string;
    jointTitle(left: string, right: string): string;
    panelTitle(panelId: string, length: number, wallId: string): string;
    northTitle(angle: string): string;
  };
}

/** Nome legível de um papel de peça (cortes na obra): os termos da fábrica. */
export function roleName(role: MemberRole): string {
  switch (role) {
    case 'bottomPlate':
      return 'bottom plate';
    case 'topPlate':
      return 'top plate';
    case 'doubleTopPlate':
      return 'double top plate';
    default:
      return role;
  }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const LEGEND_LETTERS = 'K king · J jack · C cripple · H header · S sill · B block';
const LEGEND_REST = 'red hatch = field cut · bottom: layout marks and center of each vertical piece from x=0';

const SIDE_NAME: Readonly<Record<PanelSheathing['side'], string>> = {
  exterior: 'exterior face',
  interior: 'interior face',
  both: 'both faces',
};

/** "start 5 1/2\"" ou "start held back 5 1/2\"" (S38). */
function cornerPart(end: 'start' | 'end', v: number): string | undefined {
  if (Math.abs(v) < 1e-9) return undefined;
  return v > 0 ? `${end} ${formatInches(v)}` : `${end} held back ${formatInches(-v)}`;
}

/** "P-01 · 4x6 at x=48\"" (S37). */
function postItem(post: Pick<PostMember, 'section' | 'x' | 'label'>): string {
  return [...(post.label === undefined ? [] : [post.label]), `${post.section} at x=${formatInches(post.x)}`].join(' · ');
}

/** "base: HDU2 · top: LUS28" (S37): o que o projeto diz dos conectores, sem inventar nenhum. */
function postConnectors(post: Pick<PostMember, 'base' | 'top'>): string | undefined {
  const parts = [
    ...(post.base === undefined ? [] : [`base: ${post.base}`]),
    ...(post.top === undefined ? [] : [`top: ${post.top}`]),
  ];
  return parts.length === 0 ? undefined : parts.join(' · ');
}

const EN: SheetStrings = {
  cutRoleName: {
    plates: 'plate',
    stud: 'stud',
    kingStud: 'king (K)',
    jackStud: 'jack (J)',
    header: 'header (H)',
    sill: 'sill (S)',
    cripple: 'cripple (C)',
    block: 'block (B)',
    post: 'post (P)',
  },
  legend: `${LEGEND_LETTERS} · ${LEGEND_REST}`,
  legendWithPosts: `${LEGEND_LETTERS} · P post · ${LEGEND_REST}`,
  infoLine(panel, pieces, weightLb) {
    const kind = [panel.exterior ? 'exterior' : 'interior', panel.bearing ? 'bearing' : 'non-bearing'];
    return [
      `wall ${panel.wallId}`,
      ...(panel.wallType === undefined ? [] : [`type ${panel.wallType}`]),
      `level ${panel.level}`,
      [panel.section, ...kind].join(' '),
      `${formatFeetInches(panel.length)} × ${formatFeetInches(panel.height)}`,
      plural(pieces, 'piece', 'pieces'),
      `${weightLb} lb`,
    ].join(' · ');
  },
  stampLine(date, revision) {
    const stamp: string[] = [];
    if (date !== undefined) stamp.push(`date ${date}`);
    if (revision !== undefined) stamp.push(`rev. ${revision}`);
    return stamp.join(' · ');
  },
  viewNote(panel) {
    if (panel.exterior === true) {
      return panel.facing === 'interior'
        ? 'Viewed from inside — exterior face on the back; start of wall (x=0) on the left (hypothesis P24: the ' +
            'elevation follows the plan start→end direction)'
        : 'Viewed from outside — exterior face toward the viewer; start of wall (x=0) on the left (hypothesis P24)';
    }
    if (panel.exterior === false) return 'Interior wall — start of wall (x=0) on the left';
    return 'Start of wall (x=0) on the left';
  },
  faceNote(panel) {
    if (panel.exterior === true) {
      return panel.facing === 'interior'
        ? 'exterior face on the back (viewed from inside)'
        : 'exterior face (viewed from outside)';
    }
    if (panel.exterior === false) return 'interior wall';
    return 'start → end';
  },
  overhangLabel: (overhang) => `overhang ${formatInches(overhang)}`,
  blockingRow: (row) =>
    `B · ${row.kind === 'fire' ? 'Fire blocking' : (row.label ?? 'Blocking')} (center ${formatInches(row.center)})`,
  openingLabel: (o) => `${o.id} · ${o.type === 'door' ? 'door' : 'window'}`,
  openingDim: {
    width: (w) => `RO ${formatInches(w)}`,
    sill: (base) => `sill height ${formatInches(base)}`,
    height: (h) => `RO ${formatInches(h)}`,
    header: (top) => `header ${formatInches(top)}`,
    door: (h, top, flush) =>
      flush
        ? `RO ${formatInches(h)} = header ${formatInches(top)}`
        : `RO ${formatInches(h)} · header ${formatInches(top)}`,
  },
  pieceList: {
    title: 'Pieces',
    qty: 'qty',
    role: 'piece',
    section: 'size',
    feet: 'ft-in',
    inches: 'in',
    total: 'pieces to cut',
    weight: (lb) => `Estimated weight: ${lb} lb`,
    weightNote: 'lumber only, no sheathing (hypothesis P8)',
    weightNoteSheathed: 'lumber and sheathing, no nails (hypothesis P8)',
    fieldCuts: 'Field cuts',
  },
  fieldCutLabel: (cut) => `field cut ${formatInches(cut.length)}`,
  fieldCutTitle: (cut) => `${EN.fieldCutLabel(cut)} — ${cut.role}, opening ${cut.openingId}, x=${formatInches(cut.x)}`,
  fieldCutItem: (cut) =>
    `${roleName(cut.role)} ${formatInches(cut.length)} from x=${formatInches(cut.x)} to ${formatInches(cut.x + cut.length)} (${cut.openingId})`,
  posts: {
    title: 'Posts',
    item: postItem,
    connectors: postConnectors,
    note: ['connectors as the project gives them, not in the piece list —', 'engineer to verify (hypothesis P45)'],
  },
  sheathing: {
    title: 'Sheathing',
    summary: (s) =>
      `${formatInches(s.thickness)} ${SIDE_NAME[s.side]} · ${formatInches(s.sheet.width)} x ${formatInches(s.sheet.height)} sheets`,
    area: (s) => {
      const cut = s.sheets.filter((p) => p.cut === true).length;
      return `${plural(s.sheets.length, 'piece', 'pieces')}${cut > 0 ? ` (${cut} cut)` : ''} · ${s.areaSqFt} sq ft · ${s.weightLb} lb`;
    },
    nailing: (s) =>
      `nailing: ${s.nailing.nail} @ ${formatInches(s.nailing.edge)} edges, ${formatInches(s.nailing.field)} field`,
    corner: (face, o, both) => {
      const parts = [cornerPart('start', o.start), cornerPart('end', o.end)].filter((p) => p !== undefined);
      if (parts.length === 0) return undefined;
      return `corner overhang${both ? ` (${face})` : ''}: ${parts.join(' · ')}`;
    },
    floor: (o) => {
      const parts = [
        ...(o.top > 1e-9 ? [`${formatInches(o.top)} above the double top`] : []),
        ...(o.bottom > 1e-9 ? [`${formatInches(o.bottom)} below the bottom plate`] : []),
      ];
      return parts.length === 0 ? undefined : `floor line: ${parts.join(', ')} — engineer to verify`;
    },
    note: ['sheets from layout mark 0, cut at the panel ends; nailing and', 'overhangs — engineer to verify (hypotheses P47, P48)'],
    legend: 'dashed green = sheathing sheet',
    sheetTitle: (p) =>
      `sheathing ${p.face} ${formatInches(p.w)} x ${formatInches(p.h)} at x=${formatInches(p.x)}, y=${formatInches(p.y)}${p.cut === true ? ' (cut)' : ''}`,
  },
  // Com parâmetros, a frase sai de código + parâmetros (vale também para um `message` guardado antes de P51);
  // sem eles (aviso montado à mão), o `message` como veio.
  warning: (w) =>
    w.params === undefined
      ? w.message
      : warningMessage(w.code, w.params, {
          ...(w.wallId === undefined ? {} : { wallId: w.wallId }),
          ...(w.openingId === undefined ? {} : { openingId: w.openingId }),
        }),
  plan: {
    title: 'Panel plan',
    summary: (walls, panels, width, depth) =>
      `${plural(walls, 'wall', 'walls')} · ${plural(panels, 'panel', 'panels')} · ` +
      `${formatFeetInches(width)} × ${formatFeetInches(depth)} (exterior faces)`,
    wallLabel: (wallId, wallType) => (wallType === undefined ? wallId : `${wallId} · ${wallType}`),
    wallTitle: (wallId, section, plateLength, n, wallType) =>
      `${wallId} ${section}${wallType === undefined ? '' : ` · type ${wallType}`} · plate ${formatFeetInches(plateLength)} · ${plural(n, 'panel', 'panels')}`,
    openingTitle: (id, type, roughWidth, wallId) =>
      `${id} ${type === 'window' ? 'window' : 'door'} · RO ${formatInches(roughWidth)} · wall ${wallId}`,
    jointTitle: (left, right) => `joint ${left} | ${right}`,
    panelTitle: (panelId, length, wallId) => `${panelId} · ${formatFeetInches(length)} · wall ${wallId}`,
    northTitle: (angle) => `north: ${angle}° from plan +y, clockwise`,
  },
};

/** As frases da folha e da planta. */
export function sheetStrings(): SheetStrings {
  return EN;
}

/** Linha da vista no cabeçalho (hipótese P24). */
export function viewNote(panel: FacingInput): string {
  return EN.viewNote(panel);
}
