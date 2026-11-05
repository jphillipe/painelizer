/**
 * Textos da folha do painel e da planta (S28.1 → S34), num lugar só: cabeçalho, vista, cotas, lista de peças,
 * cortes na obra, legenda, avisos e os `<title>` da planta. Dois idiomas: `'pt'` (padrão — a folha de antes da
 * S34, byte a byte) e `'en'`. O idioma padrão é pergunta à fábrica (hipótese P51): se ela escolher inglês, troca-se
 * só `DEFAULT_SHEET_LOCALE`.
 *
 * Termos técnicos em inglês seguem `docs/02-framing.md` (stud, king, jack, header, sill, cripple, RO, plate…) e
 * não mudam de um idioma para o outro; só a frase em volta muda. Puro: nada aqui lê relógio, ambiente ou rede.
 */

import { warningMessageEn, type Warning } from '../../messages';
import type { FieldCut, MemberRole, Panel, PanelOpening } from '../../panel';
import { formatFeetInches, formatInches } from '../../units';
import type { CutRole } from '../cutlist';

/** Idioma da folha e da planta. */
export type SheetLocale = 'pt' | 'en';

export const SHEET_LOCALES: readonly SheetLocale[] = ['pt', 'en'];

/** Idioma quando o projeto não diz (hipótese P51: português até a fábrica responder). */
export const DEFAULT_SHEET_LOCALE: SheetLocale = 'pt';

export function isSheetLocale(v: unknown): v is SheetLocale {
  return v === 'pt' || v === 'en';
}

type FacingInput = { exterior?: boolean; facing?: Panel['facing'] };

/** Todas as frases da folha e da planta num idioma. */
export interface SheetStrings {
  /** Nome de cada papel na lista de peças, com a letra da legenda. */
  cutRoleName: Readonly<Record<CutRole, string>>;
  /** Legenda no rodapé. */
  legend: string;
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
    fieldCuts: string;
  };
  /** Rótulo do corte na obra, sobre a peça. */
  fieldCutLabel(cut: FieldCut): string;
  /** `<title>` do trecho hachurado do corte na obra. */
  fieldCutTitle(cut: FieldCut): string;
  /** Linha do corte na obra na lista de peças. */
  fieldCutItem(cut: FieldCut): string;
  /** Texto do aviso no rodapé (depois do código). */
  warning(w: Warning): string;
  /** Planta (S16). */
  plan: {
    title: string;
    summary(walls: number, panels: number, width: number, depth: number): string;
    wallTitle(wallId: string, section: string, plateLength: number, panels: number): string;
    openingTitle(id: string, type: 'window' | 'door', roughWidth: number, wallId: string): string;
    jointTitle(left: string, right: string): string;
    panelTitle(panelId: string, length: number, wallId: string): string;
    northTitle(angle: string): string;
  };
}

/** Nome legível de um papel de peça (cortes na obra). Igual nos dois idiomas: são os termos da fábrica. */
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

const PT: SheetStrings = {
  cutRoleName: {
    plates: 'plate',
    stud: 'stud',
    kingStud: 'king (K)',
    jackStud: 'jack (J)',
    header: 'header (H)',
    sill: 'sill (S)',
    cripple: 'cripple (C)',
    block: 'bloco (B)',
  },
  legend:
    `K king · J jack · C cripple · H header · S sill · B bloco · hachura vermelha = cortar na obra · ` +
    `rodapé: marcas de layout e centro de cada peça vertical a partir de x=0`,
  infoLine(panel, pieces, weightLb) {
    const kind = [panel.exterior ? 'externa' : 'interna', panel.bearing ? 'portante' : 'não portante'];
    return [
      `parede ${panel.wallId}`,
      `pavimento ${panel.level}`,
      [panel.section, ...kind].join(' '),
      `${formatFeetInches(panel.length)} × ${formatFeetInches(panel.height)}`,
      `${pieces} peças`,
      `${weightLb} lb`,
    ].join(' · ');
  },
  stampLine(date, revision) {
    const stamp: string[] = [];
    if (date !== undefined) stamp.push(`data ${date}`);
    if (revision !== undefined) stamp.push(`rev. ${revision}`);
    return stamp.join(' · ');
  },
  viewNote(panel) {
    if (panel.exterior === true) {
      return panel.facing === 'interior'
        ? 'Vista de dentro — face externa no verso; início da parede (x=0) à esquerda (hipótese P24: a elevação ' +
            'segue o sentido start→end da planta)'
        : 'Vista de fora — face externa voltada para o observador; início da parede (x=0) à esquerda (hipótese P24)';
    }
    if (panel.exterior === false) return 'Parede interna — início da parede (x=0) à esquerda';
    return 'Início da parede (x=0) à esquerda';
  },
  faceNote(panel) {
    if (panel.exterior === true) {
      return panel.facing === 'interior' ? 'face externa no verso (vista de dentro)' : 'face externa (vista de fora)';
    }
    if (panel.exterior === false) return 'parede interna';
    return 'início → fim';
  },
  overhangLabel: (overhang) => `avanço ${formatInches(overhang)}`,
  openingLabel: (o) => `${o.id} · ${o.type === 'door' ? 'porta' : 'janela'}`,
  openingDim: {
    width: (w) => `RO ${formatInches(w)}`,
    sill: (base) => `peitoril ${formatInches(base)}`,
    height: (h) => `RO ${formatInches(h)}`,
    header: (top) => `header ${formatInches(top)}`,
    door: (h, top, flush) =>
      flush
        ? `RO ${formatInches(h)} = header ${formatInches(top)}`
        : `RO ${formatInches(h)} · header ${formatInches(top)}`,
  },
  pieceList: {
    title: 'Peças',
    qty: 'qtd',
    role: 'peça',
    section: 'seção',
    feet: 'pés-pol',
    inches: 'pol',
    total: 'peças a cortar',
    weight: (lb) => `Peso estimado: ${lb} lb`,
    weightNote: 'madeira sem sheathing (hipótese P8)',
    fieldCuts: 'Cortar na obra',
  },
  fieldCutLabel: (cut) => `cortar na obra ${formatInches(cut.length)}`,
  fieldCutTitle: (cut) => `${PT.fieldCutLabel(cut)} — ${cut.role}, abertura ${cut.openingId}, x=${formatInches(cut.x)}`,
  fieldCutItem: (cut) =>
    `${roleName(cut.role)} ${formatInches(cut.length)} de x=${formatInches(cut.x)} a ${formatInches(cut.x + cut.length)} (${cut.openingId})`,
  warning: (w) => w.message,
  plan: {
    title: 'Planta de painéis',
    summary: (walls, panels, width, depth) =>
      `${walls} paredes · ${panels} painéis · ${formatFeetInches(width)} × ${formatFeetInches(depth)} (faces externas)`,
    wallTitle: (wallId, section, plateLength, n) =>
      `${wallId} ${section} · plate ${formatFeetInches(plateLength)} · ${n} ${n === 1 ? 'painel' : 'painéis'}`,
    openingTitle: (id, type, roughWidth, wallId) =>
      `${id} ${type === 'window' ? 'janela' : 'porta'} · RO ${formatInches(roughWidth)} · parede ${wallId}`,
    jointTitle: (left, right) => `junta ${left} | ${right}`,
    panelTitle: (panelId, length, wallId) => `${panelId} · ${formatFeetInches(length)} · parede ${wallId}`,
    northTitle: (angle) => `norte: ${angle}° do +y da planta, sentido horário`,
  },
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

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
  },
  legend:
    `K king · J jack · C cripple · H header · S sill · B block · red hatch = field cut · ` +
    `bottom: layout marks and center of each vertical piece from x=0`,
  infoLine(panel, pieces, weightLb) {
    const kind = [panel.exterior ? 'exterior' : 'interior', panel.bearing ? 'bearing' : 'non-bearing'];
    return [
      `wall ${panel.wallId}`,
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
    fieldCuts: 'Field cuts',
  },
  fieldCutLabel: (cut) => `field cut ${formatInches(cut.length)}`,
  fieldCutTitle: (cut) => `${EN.fieldCutLabel(cut)} — ${cut.role}, opening ${cut.openingId}, x=${formatInches(cut.x)}`,
  fieldCutItem: (cut) =>
    `${roleName(cut.role)} ${formatInches(cut.length)} from x=${formatInches(cut.x)} to ${formatInches(cut.x + cut.length)} (${cut.openingId})`,
  warning: (w) =>
    warningMessageEn(w.code, w.params ?? {}, {
      ...(w.wallId === undefined ? {} : { wallId: w.wallId }),
      ...(w.openingId === undefined ? {} : { openingId: w.openingId }),
    }),
  plan: {
    title: 'Panel plan',
    summary: (walls, panels, width, depth) =>
      `${plural(walls, 'wall', 'walls')} · ${plural(panels, 'panel', 'panels')} · ` +
      `${formatFeetInches(width)} × ${formatFeetInches(depth)} (exterior faces)`,
    wallTitle: (wallId, section, plateLength, n) =>
      `${wallId} ${section} · plate ${formatFeetInches(plateLength)} · ${plural(n, 'panel', 'panels')}`,
    openingTitle: (id, type, roughWidth, wallId) =>
      `${id} ${type === 'window' ? 'window' : 'door'} · RO ${formatInches(roughWidth)} · wall ${wallId}`,
    jointTitle: (left, right) => `joint ${left} | ${right}`,
    panelTitle: (panelId, length, wallId) => `${panelId} · ${formatFeetInches(length)} · wall ${wallId}`,
    northTitle: (angle) => `north: ${angle}° from plan +y, clockwise`,
  },
};

const STRINGS: Readonly<Record<SheetLocale, SheetStrings>> = { pt: PT, en: EN };

/**
 * As frases de um idioma. Ausente = `DEFAULT_SHEET_LOCALE`.
 *
 * @throws RangeError idioma fora de `SHEET_LOCALES` (quem chama de JavaScript sem tipos)
 */
export function sheetStrings(locale: SheetLocale = DEFAULT_SHEET_LOCALE): SheetStrings {
  if (!isSheetLocale(locale)) {
    throw new RangeError(`locale inválido (${String(locale)}); esperado ${SHEET_LOCALES.join(' ou ')}`);
  }
  return STRINGS[locale];
}

/** Linha da vista no cabeçalho (hipótese P24), no idioma pedido. */
export function viewNote(panel: FacingInput, locale: SheetLocale = DEFAULT_SHEET_LOCALE): string {
  return sheetStrings(locale).viewNote(panel);
}
