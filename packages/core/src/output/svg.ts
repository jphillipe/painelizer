/**
 * Elevação de um painel em SVG, sem dependências.
 *
 * Convenções:
 * - Escala padrão 4 px por polegada (`opts.scale`).
 * - O eixo y do painel cresce para cima (y=0 na base da bottom plate); o do SVG
 *   cresce para baixo. `toPy` converte o topo de cada caixa.
 * - Caixa de cada member na elevação (polegadas):
 *   - vertical (stud, king, jack, cripple): 1.5 de largura × `length` de altura;
 *   - horizontal deitado (plates, sill): `length` × 1.5;
 *   - header (em pé): `length` × profundidade da seção (`sectionDepth`).
 * - Conteúdo: ID do painel no topo, cota do comprimento total (embaixo) e da
 *   altura (à esquerda), marcas de layout no rodapé (múltiplos de `studSpacing`
 *   mais o fechamento em `length − 1.5`), rótulo "(N plies)" no header e um
 *   `<title>` por peça para o navegador mostrar papel/seção/comprimento/posição.
 * - Cortes na obra (`panel.fieldCuts`, ex.: bottom plate no vão da porta) hachurados em vermelho
 *   sobre a peça, com o rótulo "cortar na obra" e o comprimento logo acima.
 * - Saída determinística: mesma entrada → mesma string.
 */

import {
  NOMINAL_2X_THICKNESS,
  sectionDepth,
  type FieldCut,
  type Member,
  type MemberRole,
  type Panel,
  type Warning,
} from '../types';
import { formatFeetInches, formatInches } from '../units';

export interface PanelSvgOptions {
  /** Pixels por polegada. Padrão 4. */
  scale?: number;
  /** Espaçamento OC usado para as marcas de layout no rodapé. Padrão 16. */
  studSpacing?: number;
  /** Margem externa em px. Padrão 24. */
  margin?: number;
}

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
    return { x: m.x, y: m.y, width: NOMINAL_2X_THICKNESS, height: m.length };
  }
  const height = m.role === 'header' ? sectionDepth(m.section) : NOMINAL_2X_THICKNESS;
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
};

const STROKE = '#5a4632';
const DIM = '#1f4e79';
const FIELD_CUT = '#c0392b';
const FONT = 'Helvetica, Arial, sans-serif';

const TITLE_HEIGHT = 44;
const DIM_LEFT_WIDTH = 56;
const DIM_GAP = 28;
const LAYOUT_GAP = 34;
const WARNING_LINE = 16;

export function panelSvg(panel: Panel, opts: PanelSvgOptions = {}): string {
  const scale = opts.scale ?? 4;
  const studSpacing = opts.studSpacing ?? 16;
  const margin = opts.margin ?? 24;

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`panelSvg: scale inválido (${scale}); esperado número > 0`);
  }
  if (!Number.isFinite(studSpacing) || studSpacing <= 0) {
    throw new RangeError(`panelSvg: studSpacing inválido (${studSpacing}); esperado número > 0`);
  }
  if (!Number.isFinite(margin) || margin < 0) {
    throw new RangeError(`panelSvg: margin inválido (${margin}); esperado número ≥ 0`);
  }
  if (
    !Number.isFinite(panel.length) ||
    panel.length <= 0 ||
    !Number.isFinite(panel.height) ||
    panel.height <= 0
  ) {
    throw new RangeError(
      `panelSvg: painel ${panel.id} com dimensões inválidas (${panel.length} × ${panel.height})`,
    );
  }

  const drawX0 = margin + DIM_LEFT_WIDTH;
  const drawY0 = margin + TITLE_HEIGHT;
  const drawW = panel.length * scale;
  const drawH = panel.height * scale;
  const dimY = drawY0 + drawH + DIM_GAP;
  const layoutY = dimY + LAYOUT_GAP;
  const warningsY = layoutY + 24;
  const totalW = drawX0 + drawW + margin;
  const totalH = warningsY + panel.warnings.length * WARNING_LINE + margin;

  const toPx = (x: number): number => drawX0 + x * scale;
  /** y em px do topo de uma caixa cujo topo está em `yTop` polegadas. */
  const toPy = (yTop: number): number => drawY0 + (panel.height - yTop) * scale;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px(totalW)}" height="${px(totalH)}" ` +
      `viewBox="0 0 ${px(totalW)} ${px(totalH)}" font-family="${FONT}">`,
  );
  out.push(`<rect width="${px(totalW)}" height="${px(totalH)}" fill="#ffffff"/>`);

  // Título: ID do painel + resumo.
  out.push(
    `<text x="${px(margin)}" y="${px(margin + 18)}" font-size="18" font-weight="bold" fill="#000">` +
      `${esc(panel.id)}</text>`,
  );
  out.push(
    `<text x="${px(margin)}" y="${px(margin + 34)}" font-size="12" fill="#333">` +
      `${esc(formatFeetInches(panel.length))} × ${esc(formatFeetInches(panel.height))} · ` +
      `${esc(panel.section)} · ${panel.members.length} peças</text>`,
  );

  // Contorno do painel.
  out.push(
    `<rect x="${px(toPx(0))}" y="${px(toPy(panel.height))}" width="${px(drawW)}" height="${px(drawH)}" ` +
      `fill="none" stroke="#999" stroke-width="0.5" stroke-dasharray="4 3"/>`,
  );

  // Members.
  out.push(`<g class="members" stroke="${STROKE}" stroke-width="1">`);
  for (const m of panel.members) {
    out.push(memberRect(m, scale, toPx, toPy));
  }
  out.push('</g>');

  // Cortes na obra, por cima das peças.
  if (panel.fieldCuts.length > 0) {
    out.push(
      `<defs><pattern id="field-cut-hatch" width="6" height="6" patternUnits="userSpaceOnUse" ` +
        `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${FIELD_CUT}" ` +
        `stroke-width="2"/></pattern></defs>`,
    );
    for (const cut of panel.fieldCuts) {
      out.push(fieldCutMark(cut, panel, scale, toPx, toPy));
    }
  }

  // Cota do comprimento (embaixo).
  out.push(dimensionH(toPx(0), toPx(panel.length), dimY, toPy(0), formatFeetInches(panel.length)));
  // Cota da altura (à esquerda).
  out.push(dimensionV(margin + 20, toPy(panel.height), toPy(0), toPx(0), formatFeetInches(panel.height)));

  // Marcas de layout no rodapé.
  out.push(layoutMarks(panel.length, studSpacing, layoutY, toPx));

  // Avisos.
  panel.warnings.forEach((w, i) => {
    out.push(warningLine(w, margin, warningsY + (i + 1) * WARNING_LINE));
  });

  out.push('</svg>');
  return out.join('\n');
}

function memberRect(
  m: Member,
  scale: number,
  toPx: (x: number) => number,
  toPy: (yTop: number) => number,
): string {
  const box = memberBox(m);
  const x = toPx(box.x);
  const y = toPy(box.y + box.height);
  const w = box.width * scale;
  const h = box.height * scale;
  const plies = m.plies ?? 1;
  const pliesNote = plies > 1 ? ` (${plies} plies)` : '';
  const title =
    `${m.role} ${m.section} × ${formatInches(m.length)}${pliesNote} — ` +
    `x=${formatInches(m.x)} y=${formatInches(m.y)}`;

  const parts: string[] = [];
  parts.push(
    `<rect class="member ${m.role}" x="${px(x)}" y="${px(y)}" width="${px(w)}" height="${px(h)}" ` +
      `fill="${FILL[m.role]}"><title>${esc(title)}</title></rect>`,
  );
  // Rótulo dentro de peças horizontais altas o bastante (header).
  if (m.orientation === 'horizontal' && h >= 14 && w >= 60) {
    parts.push(
      `<text x="${px(x + w / 2)}" y="${px(y + h / 2)}" font-size="10" fill="#000" ` +
        `text-anchor="middle" dominant-baseline="middle">` +
        `${esc(`${m.section} × ${formatInches(m.length)}${pliesNote}`)}</text>`,
    );
  }
  return parts.join('\n');
}

/**
 * Trecho hachurado sobre a peça a cortar na obra, com rótulo logo acima.
 *
 * @throws RangeError se nenhuma peça do papel indicado contém o trecho (painel inconsistente)
 */
function fieldCutMark(
  cut: FieldCut,
  panel: Panel,
  scale: number,
  toPx: (x: number) => number,
  toPy: (yTop: number) => number,
): string {
  const eps = 1e-9;
  const host = panel.members.find(
    (m) => m.role === cut.role && m.x <= cut.x + eps && cut.x + cut.length <= m.x + m.length + eps,
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
  const label = `cortar na obra ${formatInches(cut.length)}`;
  return [
    `<rect class="field-cut" x="${px(x)}" y="${px(yTop)}" width="${px(w)}" height="${px(h)}" ` +
      `fill="url(#field-cut-hatch)" stroke="${FIELD_CUT}" stroke-width="1" stroke-dasharray="3 2">` +
      `<title>${esc(`${label} — ${cut.role}, abertura ${cut.openingId}, x=${formatInches(cut.x)}`)}</title></rect>`,
    `<text x="${px(x + w / 2)}" y="${px(yTop - 4)}" font-size="10" fill="${FIELD_CUT}" ` +
      `text-anchor="middle">${esc(label)}</text>`,
  ].join('\n');
}

/** Cota horizontal em `y`, com linhas de chamada subindo até `fromY`. */
function dimensionH(x1: number, x2: number, y: number, fromY: number, label: string): string {
  const mid = (x1 + x2) / 2;
  return [
    `<g class="dim dim-length" stroke="${DIM}" stroke-width="0.75" fill="none">`,
    `<line x1="${px(x1)}" y1="${px(fromY)}" x2="${px(x1)}" y2="${px(y + 4)}"/>`,
    `<line x1="${px(x2)}" y1="${px(fromY)}" x2="${px(x2)}" y2="${px(y + 4)}"/>`,
    `<line x1="${px(x1)}" y1="${px(y)}" x2="${px(x2)}" y2="${px(y)}"/>`,
    tickSlash(x1, y),
    tickSlash(x2, y),
    '</g>',
    `<text x="${px(mid)}" y="${px(y - 4)}" font-size="12" fill="${DIM}" text-anchor="middle">${esc(label)}</text>`,
  ].join('\n');
}

/** Cota vertical em `x`, com linhas de chamada indo até `fromX`. */
function dimensionV(x: number, y1: number, y2: number, fromX: number, label: string): string {
  const mid = (y1 + y2) / 2;
  return [
    `<g class="dim dim-height" stroke="${DIM}" stroke-width="0.75" fill="none">`,
    `<line x1="${px(fromX)}" y1="${px(y1)}" x2="${px(x - 4)}" y2="${px(y1)}"/>`,
    `<line x1="${px(fromX)}" y1="${px(y2)}" x2="${px(x - 4)}" y2="${px(y2)}"/>`,
    `<line x1="${px(x)}" y1="${px(y1)}" x2="${px(x)}" y2="${px(y2)}"/>`,
    tickSlash(x, y1),
    tickSlash(x, y2),
    '</g>',
    `<text x="${px(x - 4)}" y="${px(mid)}" font-size="12" fill="${DIM}" text-anchor="middle" ` +
      `transform="rotate(-90 ${px(x - 4)} ${px(mid)})">${esc(label)}</text>`,
  ].join('\n');
}

/** Traço oblíquo de extremidade de cota (estilo arquitetônico). */
function tickSlash(x: number, y: number): string {
  return `<line x1="${px(x - 3)}" y1="${px(y + 3)}" x2="${px(x + 3)}" y2="${px(y - 3)}"/>`;
}

/**
 * Marcas de layout: múltiplos de `spacing` estritamente menores que o fechamento
 * (`length − 1.5`) mais o próprio fechamento, com o valor em polegadas.
 */
function layoutMarks(length: number, spacing: number, y: number, toPx: (x: number) => number): string {
  const closing = length - NOMINAL_2X_THICKNESS;
  const marks: number[] = [];
  for (let x = 0; x < closing; x += spacing) marks.push(x);
  if (closing >= 0) marks.push(closing);

  const parts: string[] = [`<g class="layout" stroke="#666" stroke-width="0.75">`];
  parts.push(`<line x1="${px(toPx(0))}" y1="${px(y)}" x2="${px(toPx(length))}" y2="${px(y)}"/>`);
  for (const x of marks) {
    parts.push(`<line x1="${px(toPx(x))}" y1="${px(y - 8)}" x2="${px(toPx(x))}" y2="${px(y)}"/>`);
  }
  parts.push('</g>');
  for (const x of marks) {
    parts.push(
      `<text x="${px(toPx(x))}" y="${px(y + 11)}" font-size="9" fill="#666" text-anchor="middle">` +
        `${esc(formatInches(x))}</text>`,
    );
  }
  return parts.join('\n');
}

function warningLine(w: Warning, x: number, y: number): string {
  return (
    `<text x="${px(x)}" y="${px(y)}" font-size="11" fill="#a33">` +
    `! ${esc(w.code)}: ${esc(w.message)}</text>`
  );
}

/** Número em px com até 3 decimais, sem ruído de ponto flutuante nem "-0". */
export function px(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
}

/** Escapa texto para conteúdo/atributo XML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
