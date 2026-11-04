/**
 * Textos da folha do painel (S28.1), num lugar só: cabeçalho, vista, cotas, lista de peças, cortes na obra e
 * legenda. Hoje em português; o idioma da folha é pergunta à fábrica (S34).
 */

import type { FieldCut, MemberRole, Panel, PanelOpening } from '../../panel';
import { formatFeetInches, formatInches } from '../../units';
import type { CutRole } from '../cutlist';

/** Nome de cada papel na lista de peças, com a letra da legenda. */
export const CUT_ROLE_NAME: Readonly<Record<CutRole, string>> = {
  plates: 'plate',
  stud: 'stud',
  kingStud: 'king (K)',
  jackStud: 'jack (J)',
  header: 'header (H)',
  sill: 'sill (S)',
  cripple: 'cripple (C)',
  block: 'bloco (B)',
};

/** Legenda no rodapé. */
export const LEGEND =
  `K king · J jack · C cripple · H header · S sill · B bloco · hachura vermelha = cortar na obra · ` +
  `rodapé: marcas de layout e centro de cada peça vertical a partir de x=0`;

/** Dados do painel na segunda linha do cabeçalho. */
export function infoLine(panel: Panel, pieces: number, weightLb: number): string {
  const kind = [panel.exterior ? 'externa' : 'interna', panel.bearing ? 'portante' : 'não portante'];
  return [
    `parede ${panel.wallId}`,
    `pavimento ${panel.level}`,
    [panel.section, ...kind].join(' '),
    `${formatFeetInches(panel.length)} × ${formatFeetInches(panel.height)}`,
    `${pieces} peças`,
    `${weightLb} lb`,
  ].join(' · ');
}

/** Data e revisão no canto do cabeçalho; vazio quando não há nenhuma. */
export function stampLine(date: string | undefined, revision: string | undefined): string {
  const stamp: string[] = [];
  if (date !== undefined) stamp.push(`data ${date}`);
  if (revision !== undefined) stamp.push(`rev. ${revision}`);
  return stamp.join(' · ');
}

/** Linha da vista no cabeçalho (hipótese P24). */
export function viewNote(panel: { exterior?: boolean; facing?: Panel['facing'] }): string {
  if (panel.exterior === true) {
    return panel.facing === 'interior'
      ? 'Vista de dentro — face externa no verso; início da parede (x=0) à esquerda (hipótese P24: a elevação ' +
          'segue o sentido start→end da planta)'
      : 'Vista de fora — face externa voltada para o observador; início da parede (x=0) à esquerda (hipótese P24)';
  }
  if (panel.exterior === false) return 'Parede interna — início da parede (x=0) à esquerda';
  return 'Início da parede (x=0) à esquerda';
}

/** Nota curta da face no topo do desenho. */
export function faceNote(panel: { exterior?: boolean; facing?: Panel['facing'] }): string {
  if (panel.exterior === true) {
    return panel.facing === 'interior' ? 'face externa no verso (vista de dentro)' : 'face externa (vista de fora)';
  }
  if (panel.exterior === false) return 'parede interna';
  return 'início → fim';
}

/** Rótulo da cota do avanço da double top plate. */
export function overhangLabel(overhang: number): string {
  return `avanço ${formatInches(overhang)}`;
}

/** Id e tipo da abertura, dentro do vão. */
export function openingLabel(o: PanelOpening): string {
  return `${o.id} · ${o.type === 'door' ? 'porta' : 'janela'}`;
}

/** Textos das cotas de altura da abertura. Porta (base do RO em 0, ou abaixo): uma linha só. */
export const OPENING_DIM = {
  width: (w: number): string => `RO ${formatInches(w)}`,
  sill: (base: number): string => `peitoril ${formatInches(base)}`,
  height: (h: number): string => `RO ${formatInches(h)}`,
  header: (top: number): string => `header ${formatInches(top)}`,
  door: (h: number, top: number, flush: boolean): string =>
    flush ? `RO ${formatInches(h)} = header ${formatInches(top)}` : `RO ${formatInches(h)} · header ${formatInches(top)}`,
};

/** Cabeçalhos e rodapé da lista de peças. */
export const PIECE_LIST = {
  title: 'Peças',
  qty: 'qtd',
  role: 'peça',
  section: 'seção',
  feet: 'pés-pol',
  inches: 'pol',
  total: 'peças a cortar',
  weight: (lb: number): string => `Peso estimado: ${lb} lb`,
  weightNote: 'madeira sem sheathing (hipótese P8)',
  fieldCuts: 'Cortar na obra',
};

/** Nome legível de um papel de peça (cortes na obra). */
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

/** Rótulo do corte na obra, sobre a peça. */
export function fieldCutLabel(cut: FieldCut): string {
  return `cortar na obra ${formatInches(cut.length)}`;
}

/** Linha do corte na obra na lista de peças. */
export function fieldCutItem(cut: FieldCut): string {
  return `${roleName(cut.role)} ${formatInches(cut.length)} de x=${formatInches(cut.x)} a ${formatInches(cut.x + cut.length)} (${cut.openingId})`;
}
