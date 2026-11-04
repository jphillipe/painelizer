/**
 * Peças na elevação (S5 → S17): caixa de cada member, retângulo com cor por papel e `<title>`, letra de cada
 * peça, corte na obra hachurado e avanço da double top além do contorno.
 *
 * Caixa de cada member na elevação (polegadas):
 * - vertical (stud, king, jack, cripple): 1.5 de largura × `length` de altura (stud flat: `sectionDepth`);
 * - horizontal deitado (plates, sill, header flat, bloco): `length` × 1.5;
 * - header (em pé): `length` × profundidade da seção (`sectionDepth`).
 */

import { EPS } from '../../eps';
import { labelOf, pieceCount, type FieldCut, type Member, type MemberRole, type Panel } from '../../panel';
import { NOMINAL_2X_THICKNESS, sectionDepth, verticalWidth } from '../../sections';
import { formatInches } from '../../units';
import { FIELD_CUT, esc, px } from './primitives';
import { fieldCutLabel } from './strings';

/** x em polegadas → px. */
export type ToPx = (x: number) => number;
/** y em px do topo de uma caixa cujo topo está em `yTop` polegadas. */
export type ToPy = (yTop: number) => number;

/** Caixa de um member na elevação, em polegadas (canto inferior esquerdo + dimensões). */
export interface MemberBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Caixa que o member ocupa na elevação, em polegadas. */
export function memberBox(m: Member): MemberBox {
  if (m.orientation === 'vertical') {
    // Stud flat do canto California (S14) ocupa a profundidade da seção em x.
    return { x: m.x, y: m.y, width: verticalWidth(m), height: m.length };
  }
  const height = m.role === 'header' && !m.flat ? sectionDepth(m.section) : NOMINAL_2X_THICKNESS;
  return { x: m.x, y: m.y, width: m.length, height };
}

/** Cor de preenchimento por papel. Peças especiais da abertura em tons mais escuros. */
const FILL: Readonly<Record<MemberRole, string>> = {
  bottomPlate: '#d9c9a8',
  topPlate: '#d9c9a8',
  doubleTopPlate: '#d9c9a8',
  stud: '#f2e6cc',
  kingStud: '#e3c690',
  jackStud: '#d2b072',
  header: '#c49a5c',
  sill: '#d9c9a8',
  cripple: '#f2e6cc',
  block: '#cdb98f',
};

/** Rótulo curto de cada papel na folha (S17). Studs e plates não levam letra. */
export const SHORT_LABEL: Readonly<Partial<Record<MemberRole, string>>> = {
  kingStud: 'K',
  jackStud: 'J',
  cripple: 'C',
  header: 'H',
  sill: 'S',
  block: 'B',
};

/** Altura mínima (px) de uma peça vertical para receber a letra dentro. */
const MIN_LABEL_HEIGHT = 12;

/** Quanto alguma peça (double top plate com lap) passa do contorno à esquerda (x < 0) e à direita. */
export function overhang(panel: Panel): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const m of panel.members) {
    const box = memberBox(m);
    left = Math.max(left, -box.x);
    right = Math.max(right, box.x + box.width - panel.length);
  }
  return { left, right };
}

/**
 * Retângulo do member com `<title>` (papel, seção, comprimento, plies, origem do header, label do stud extra,
 * posição); peça horizontal alta o bastante (header em pé) leva o rótulo dentro.
 */
export function memberRect(m: Member, scale: number, toPx: ToPx, toPy: ToPy): string {
  const box = memberBox(m);
  const x = toPx(box.x);
  const y = toPy(box.y + box.height);
  const w = box.width * scale;
  const h = box.height * scale;
  const plies = pieceCount(m);
  const pliesNote = plies > 1 ? ` (${plies} plies)` : '';
  const sourceNote = m.role === 'header' ? ` [${m.headerSource}]` : '';
  const label = labelOf(m);
  const labelNote = label === undefined ? '' : ` "${label}"`;
  const flatNote = m.role === 'stud' && m.flat === true ? ' (flat)' : '';
  const title =
    `${m.role}${flatNote} ${m.section} × ${formatInches(m.length)}${pliesNote}${sourceNote}${labelNote} — ` +
    `x=${formatInches(m.x)} y=${formatInches(m.y)}`;

  const parts: string[] = [];
  parts.push(
    `<rect class="member ${m.role}" x="${px(x)}" y="${px(y)}" width="${px(w)}" height="${px(h)}" ` +
      `fill="${FILL[m.role]}"><title>${esc(title)}</title></rect>`,
  );
  // Rótulo dentro de peças horizontais altas o bastante (header em pé).
  if (m.orientation === 'horizontal' && h >= 14 && w >= 60) {
    const letter = SHORT_LABEL[m.role];
    parts.push(
      `<text x="${px(x + w / 2)}" y="${px(y + h / 2)}" font-size="10" fill="#000" ` +
        `text-anchor="middle" dominant-baseline="middle">` +
        `${esc(`${letter === undefined ? '' : `${letter} · `}${m.section} × ${formatInches(m.length)}${pliesNote}`)}</text>`,
    );
  }
  return parts.join('\n');
}

/**
 * Letra de cada peça (K, J, C, H, S, B) e o `label` do stud extra (S17).
 * - Vertical: letra dentro da peça, logo abaixo do topo; peça mais baixa que `MIN_LABEL_HEIGHT` px fica sem
 *   letra (cripple curto sobre o header). Letras de peças vizinhas (< 7 px) descem 11 px para não se cobrir.
 * - Stud extra: o `label` girado ao longo da peça, no meio da altura.
 * - Header em pé já leva a letra no rótulo interno (`memberRect`); header flat ganha o "H" logo abaixo
 *   (dentro do RO). Sill e bloco: letra logo acima (RO e cavidade estão vazios aí); sill de baixo da sill
 *   dupla fica sem letra.
 */
export function memberLabels(panel: Panel, scale: number, toPx: ToPx, toPy: ToPy): string[] {
  const out: string[] = [];
  const placed: { x: number; y: number }[] = [];
  const verticals = panel.members
    .filter((m) => m.orientation === 'vertical')
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y);
  for (const [i, m] of verticals.entries()) {
    const box = memberBox(m);
    const cx = toPx(box.x + box.width / 2);
    const top = toPy(box.y + box.height);
    const h = box.height * scale;
    const label = labelOf(m);
    if (label !== undefined) {
      // Studs colados com o mesmo label (`count` > 1) levam um rótulo só, centrado no conjunto.
      const prev = verticals[i - 1];
      if (prev !== undefined && labelOf(prev) === label && Math.abs(prev.x + verticalWidth(prev) - m.x) < EPS) continue;
      let end = box.x + box.width;
      for (let j = i + 1; j < verticals.length; j++) {
        const n = verticals[j]!;
        if (labelOf(n) !== label || Math.abs(n.x - end) > EPS) break;
        end = n.x + verticalWidth(n);
      }
      const lx = toPx((box.x + end) / 2) + 3;
      const my = top + h / 2;
      out.push(
        `<text class="label extra" x="${px(lx)}" y="${px(my)}" font-weight="normal" ` +
          `transform="rotate(-90 ${px(lx)} ${px(my)})">${esc(label)}</text>`,
      );
      continue;
    }
    const letter = SHORT_LABEL[m.role];
    if (letter === undefined || h < MIN_LABEL_HEIGHT) continue;
    let y = top + 10;
    if (placed.some((p) => Math.abs(p.x - cx) < 7 && Math.abs(p.y - y) < 10)) y += 11;
    placed.push({ x: cx, y });
    out.push(`<text class="label ${m.role}" x="${px(cx)}" y="${px(y)}">${letter}</text>`);
  }
  for (const m of panel.members) {
    if (m.orientation !== 'horizontal') continue;
    const letter = SHORT_LABEL[m.role];
    if (letter === undefined) continue;
    const box = memberBox(m);
    const cx = toPx(box.x + box.width / 2);
    const top = toPy(box.y + box.height);
    const h = box.height * scale;
    const w = box.width * scale;
    if (m.role === 'header') {
      if (h >= 14 && w >= 60) continue; // letra já está no rótulo interno
      out.push(`<text class="label header" x="${px(cx)}" y="${px(top + h + 9)}">${letter}</text>`);
      continue;
    }
    if (m.role === 'sill') {
      const stacked = panel.members.some(
        (o) => o !== m && o.role === 'sill' && Math.abs(o.y - (m.y + NOMINAL_2X_THICKNESS)) < EPS && Math.abs(o.x - m.x) < EPS,
      );
      if (stacked) continue;
    }
    out.push(`<text class="label ${m.role}" x="${px(cx)}" y="${px(top - 3)}">${letter}</text>`);
  }
  return out;
}

/** Padrão da hachura dos cortes na obra (`fill="url(#field-cut-hatch)"`). */
export const FIELD_CUT_HATCH =
  `<defs><pattern id="field-cut-hatch" width="6" height="6" patternUnits="userSpaceOnUse" ` +
  `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${FIELD_CUT}" ` +
  `stroke-width="2"/></pattern></defs>`;

/**
 * Trecho hachurado sobre a peça a cortar na obra, com rótulo logo acima.
 *
 * @throws RangeError se nenhuma peça do papel indicado contém o trecho (painel inconsistente)
 */
export function fieldCutMark(cut: FieldCut, panel: Panel, scale: number, toPx: ToPx, toPy: ToPy): string {
  const host = panel.members.find(
    (m) => m.role === cut.role && m.x <= cut.x + EPS && cut.x + cut.length <= m.x + m.length + EPS,
  );
  if (host === undefined) {
    throw new RangeError(
      `panelSvg: painel ${panel.id}: corte na obra da abertura ${cut.openingId} ` +
        `(x=${cut.x}, ${cut.length}") não cai em nenhuma peça ${cut.role}`,
    );
  }
  const box = memberBox(host);
  const x = toPx(cut.x);
  const yTop = toPy(box.y + box.height);
  const w = cut.length * scale;
  const h = box.height * scale;
  const label = fieldCutLabel(cut);
  return [
    `<rect class="field-cut" x="${px(x)}" y="${px(yTop)}" width="${px(w)}" height="${px(h)}" ` +
      `fill="url(#field-cut-hatch)" stroke="${FIELD_CUT}" stroke-width="1" stroke-dasharray="3 2">` +
      `<title>${esc(`${label} — ${cut.role}, abertura ${cut.openingId}, x=${formatInches(cut.x)}`)}</title></rect>`,
    `<text x="${px(x + w / 2)}" y="${px(yTop - 4)}" font-size="10" fill="${FIELD_CUT}" ` +
      `text-anchor="middle">${esc(label)}</text>`,
  ].join('\n');
}
