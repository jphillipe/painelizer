/**
 * Folha de fabricação de um painel em SVG (S5 elevação → S17 folha), sem dependências.
 *
 * Convenções:
 * - A elevação vai sempre de start para end: x=0 à esquerda, como a planta, a lista de corte e a cadeia de
 *   cotas. A folha diz qual face o leitor vê (hipótese P24): em parede externa em planta, `panel.facing`
 *   (`'exterior'` = vista de fora, `'interior'` = vista de dentro, face externa no verso); parede externa solta
 *   assume vista de fora; parede interna só indica o início. Nunca espelha o desenho.
 * - Escala padrão 4 px por polegada (`opts.scale`). O eixo y do painel cresce para cima (y=0 na base da
 *   bottom plate); o do SVG cresce para baixo. `toPy` converte o topo de cada caixa.
 * - Caixa de cada member na elevação (polegadas):
 *   - vertical (stud, king, jack, cripple): 1.5 de largura × `length` de altura (stud flat: `sectionDepth`);
 *   - horizontal deitado (plates, sill, header flat, bloco): `length` × 1.5;
 *   - header (em pé): `length` × profundidade da seção (`sectionDepth`).
 * - Cabeçalho: id do painel, projeto (`opts.project`), parede, pavimento, seção, externa/interna,
 *   portante, dimensões, nº de peças, peso, data e revisão (`opts.date`, `opts.revision` — a folha não lê o
 *   relógio: mesma entrada, mesma string) e a linha da vista (P24).
 * - Desenho: contorno tracejado, members com cor por papel e `<title>` (papel, seção, comprimento, plies,
 *   origem do header, label do stud extra, posição), rótulo curto por peça (K king, J jack, C cripple,
 *   H header, S sill, B bloco; studs e plates sem letra; stud extra com o `label` do projeto ao longo da peça),
 *   cortes na obra hachurados em vermelho, cotas de RO (largura; peitoril, altura do RO e base do header ao
 *   subfloor, dentro do vão), nota da face no topo, avanço da double top plate cotado (S14).
 * - Rodapé: cota do comprimento, marcas de layout (`layoutOrigin + k·studSpacing`, mais 0 e o fechamento) e
 *   a cadeia acumulada do centro de cada peça vertical a partir de x=0 (rótulos girados; segunda fileira
 *   quando dois centros ficam a menos de 11 px), legenda das letras e avisos.
 * - Margem direita: lista de peças da `cutList` (qtd, papel, seção, pés-pol, polegadas), peso estimado
 *   (`weightLb`, ou `panelWeight` quando ausente; madeira sem sheathing, P8) e cortes na obra.
 * - Saída determinística: mesma entrada → mesma string.
 */

import {
  NOMINAL_2X_THICKNESS,
  sectionDepth,
  verticalWidth,
  type FieldCut,
  type Member,
  type MemberRole,
  type Panel,
  type PanelOpening,
  type Warning,
} from '../types';
import { formatFeetInches, formatInches } from '../units';
import { cutList, type CutRole } from './cutlist';
import { panelWeight } from '../rules/weight';

export interface PanelSvgOptions {
  /** Pixels por polegada. Padrão 4. */
  scale?: number;
  /** Espaçamento OC usado para as marcas de layout no rodapé. Padrão 16. */
  studSpacing?: number;
  /** Margem externa em px. Padrão 24. */
  margin?: number;
  /** Nome do projeto, no cabeçalho (S17). Ausente = sem projeto. */
  project?: string;
  /** Data da folha, como texto (S17). Ausente = sem data. A folha nunca lê o relógio. */
  date?: string;
  /** Revisão da folha, como texto (S17). Ausente = sem revisão. */
  revision?: string;
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

/** Nome de cada papel na lista de peças, com a letra da legenda. */
const CUT_ROLE_NAME: Readonly<Record<CutRole, string>> = {
  plates: 'plate',
  stud: 'stud',
  kingStud: 'king (K)',
  jackStud: 'jack (J)',
  header: 'header (H)',
  sill: 'sill (S)',
  cripple: 'cripple (C)',
  block: 'bloco (B)',
};

export const STROKE = '#5a4632';
export const DIM = '#1f4e79';
const FIELD_CUT = '#c0392b';
const LABEL = '#000';
const MUTED = '#666';
export const FONT = 'Helvetica, Arial, sans-serif';

/** Altura do cabeçalho: três linhas (id/projeto, dados do painel/data, vista). */
const TITLE_HEIGHT = 60;
const DIM_LEFT_WIDTH = 56;
const DIM_GAP = 28;
const LAYOUT_GAP = 34;
/** Da linha das marcas de layout à linha da cadeia de centros. */
const CHAIN_GAP = 24;
/** Altura de uma fileira de rótulos girados da cadeia (até `143 1/4"` em 9 px). */
const CHAIN_ROW = 46;
/** Distância mínima em px entre dois rótulos da mesma fileira. */
const CHAIN_MIN_SPACING = 11;
const LEGEND_GAP = 14;
const WARNING_LINE = 16;
/** Espaço extra acima do painel para a cota do avanço da double top plate (S14). */
const OVERHANG_DIM_GAP = 22;
/** Coluna da lista de peças à direita do desenho. */
const LIST_GAP = 28;
const LIST_WIDTH = 282;
const LIST_ROW = 13;
/** Altura mínima (px) de uma peça vertical para receber a letra dentro. */
const MIN_LABEL_HEIGHT = 12;

const EPS = 1e-9;

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

  // Avanço da double top plate além do contorno (laps de canto e T, S14): o desenho abre espaço dos dois
  // lados e cota o avanço. Sem avanço, nada muda.
  const { left: overLeft, right: overRight } = overhang(panel);
  const drawX0 = margin + DIM_LEFT_WIDTH + overLeft * scale;
  // Com avanço, a cota fica entre o cabeçalho e o topo do painel: o desenho desce `OVERHANG_DIM_GAP`.
  const drawY0 = margin + TITLE_HEIGHT + (overLeft > 0 || overRight > 0 ? OVERHANG_DIM_GAP : 0);
  const drawW = panel.length * scale;
  const drawH = panel.height * scale;
  const dimY = drawY0 + drawH + DIM_GAP;
  const layoutY = dimY + LAYOUT_GAP;
  const chainY = layoutY + CHAIN_GAP;

  const toPx = (x: number): number => drawX0 + x * scale;
  /** y em px do topo de uma caixa cujo topo está em `yTop` polegadas. */
  const toPy = (yTop: number): number => drawY0 + (panel.height - yTop) * scale;

  const chain = studChain(panel, chainY, toPx);
  const legendY = chainY + 6 + CHAIN_ROW * chain.rows + LEGEND_GAP;
  const warningsY = legendY + 6;

  const listX = drawX0 + drawW + overRight * scale + LIST_GAP;
  const list = pieceList(panel, listX, drawY0);
  const totalW = listX + LIST_WIDTH + margin;
  const totalH = Math.max(warningsY + panel.warnings.length * WARNING_LINE, list.bottom) + margin;

  const pieces = panel.members.length;
  const weightLb = panel.weightLb ?? panelWeight(panel);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px(totalW)}" height="${px(totalH)}" ` +
      `viewBox="0 0 ${px(totalW)} ${px(totalH)}" font-family="${FONT}">`,
  );
  out.push(`<rect width="${px(totalW)}" height="${px(totalH)}" fill="#ffffff"/>`);

  // Cabeçalho.
  out.push(...header(panel, opts, margin, totalW, pieces, weightLb));

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

  // Rótulos curtos por peça (S17).
  out.push(`<g class="labels" font-size="8" font-weight="bold" fill="${LABEL}" text-anchor="middle">`);
  out.push(...memberLabels(panel, scale, toPx, toPy));
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

  // Cotas de cada abertura, dentro do vão (S17).
  for (const o of panel.openings ?? []) {
    out.push(...openingDims(o, panel, toPx, toPy));
  }

  // Nota da face no topo do desenho (P24).
  out.push(
    `<text class="face" x="${px(toPx(panel.length / 2))}" y="${px(toPy(panel.height) - 3)}" font-size="10" ` +
      `fill="${MUTED}" text-anchor="middle">${esc(faceNote(panel))}</text>`,
  );

  // Cota do comprimento (embaixo).
  out.push(dimensionH(toPx(0), toPx(panel.length), dimY, toPy(0), formatFeetInches(panel.length)));
  // Cotas do avanço da double top plate (acima do topo do painel).
  const overY = toPy(panel.height) - 10;
  if (overLeft > 0) {
    out.push(dimensionH(toPx(-overLeft), toPx(0), overY, toPy(panel.height), `avanço ${formatInches(overLeft)}`));
  }
  if (overRight > 0) {
    out.push(
      dimensionH(toPx(panel.length), toPx(panel.length + overRight), overY, toPy(panel.height), `avanço ${formatInches(overRight)}`),
    );
  }
  // Cota da altura (à esquerda).
  out.push(dimensionV(margin + 20, toPy(panel.height), toPy(0), toPx(0), formatFeetInches(panel.height)));

  // Marcas de layout no rodapé.
  out.push(layoutMarks(panel.length, studSpacing, panel.layoutOrigin ?? 0, layoutY, toPx));

  // Cadeia acumulada dos centros dos studs (S17).
  out.push(chain.svg);

  // Lista de peças, peso e cortes na obra (margem direita).
  out.push(list.svg);

  // Legenda e avisos.
  out.push(
    `<text class="legend" x="${px(margin)}" y="${px(legendY)}" font-size="9" fill="${MUTED}">` +
      `K king · J jack · C cripple · H header · S sill · B bloco · hachura vermelha = cortar na obra · ` +
      `rodapé: marcas de layout e centro de cada peça vertical a partir de x=0</text>`,
  );
  panel.warnings.forEach((w, i) => {
    out.push(warningLine(w, margin, warningsY + (i + 1) * WARNING_LINE));
  });

  out.push('</svg>');
  return out.join('\n');
}

/** Linhas do cabeçalho: id e projeto; dados do painel, data e revisão; vista (P24). */
function header(
  panel: Panel,
  opts: PanelSvgOptions,
  margin: number,
  totalW: number,
  pieces: number,
  weightLb: number,
): string[] {
  const out: string[] = [];
  const right = totalW - margin;
  out.push(
    `<text x="${px(margin)}" y="${px(margin + 18)}" font-size="18" font-weight="bold" fill="#000">` +
      `${esc(panel.id)}</text>`,
  );
  if (opts.project !== undefined) {
    out.push(
      `<text class="project" x="${px(right)}" y="${px(margin + 18)}" font-size="14" font-weight="bold" ` +
        `fill="#000" text-anchor="end">${esc(opts.project)}</text>`,
    );
  }

  const kind: string[] = [];
  if (panel.exterior !== undefined) kind.push(panel.exterior ? 'externa' : 'interna');
  if (panel.bearing !== undefined) kind.push(panel.bearing ? 'portante' : 'não portante');
  const info = [
    `parede ${panel.wallId}`,
    `pavimento ${panel.level ?? 1}`,
    [panel.section, ...kind].join(' '),
    `${formatFeetInches(panel.length)} × ${formatFeetInches(panel.height)}`,
    `${pieces} peças`,
    `${weightLb} lb`,
  ];
  out.push(
    `<text class="info" x="${px(margin)}" y="${px(margin + 34)}" font-size="12" fill="#333">` +
      `${esc(info.join(' · '))}</text>`,
  );
  const stamp: string[] = [];
  if (opts.date !== undefined) stamp.push(`data ${opts.date}`);
  if (opts.revision !== undefined) stamp.push(`rev. ${opts.revision}`);
  if (stamp.length > 0) {
    out.push(
      `<text class="stamp" x="${px(right)}" y="${px(margin + 34)}" font-size="11" fill="#333" ` +
        `text-anchor="end">${esc(stamp.join(' · '))}</text>`,
    );
  }
  out.push(
    `<text class="view" x="${px(margin)}" y="${px(margin + 48)}" font-size="11" fill="#333">` +
      `${esc(viewNote(panel))}</text>`,
  );
  return out;
}

/** Linha da vista no cabeçalho (hipótese P24). */
export function viewNote(panel: Pick<Panel, 'exterior' | 'facing'>): string {
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
function faceNote(panel: Pick<Panel, 'exterior' | 'facing'>): string {
  if (panel.exterior === true) {
    return panel.facing === 'interior' ? 'face externa no verso (vista de dentro)' : 'face externa (vista de fora)';
  }
  if (panel.exterior === false) return 'parede interna';
  return 'início → fim';
}

/** Quanto alguma peça (double top plate com lap) passa do contorno à esquerda (x < 0) e à direita. */
function overhang(panel: Panel): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const m of panel.members) {
    const box = memberBox(m);
    left = Math.max(left, -box.x);
    right = Math.max(right, box.x + box.width - panel.length);
  }
  return { left, right };
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
  const sourceNote = m.headerSource === undefined ? '' : ` [${m.headerSource}]`;
  const labelNote = m.label === undefined ? '' : ` "${m.label}"`;
  const flatNote = m.flat === true && m.orientation === 'vertical' ? ' (flat)' : '';
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
function memberLabels(
  panel: Panel,
  scale: number,
  toPx: (x: number) => number,
  toPy: (yTop: number) => number,
): string[] {
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
    if (m.label !== undefined) {
      // Studs colados com o mesmo label (`count` > 1) levam um rótulo só, centrado no conjunto.
      const prev = verticals[i - 1];
      if (prev !== undefined && prev.label === m.label && Math.abs(prev.x + verticalWidth(prev) - m.x) < EPS) continue;
      let end = box.x + box.width;
      for (let j = i + 1; j < verticals.length; j++) {
        const n = verticals[j]!;
        if (n.label !== m.label || Math.abs(n.x - end) > EPS) break;
        end = n.x + verticalWidth(n);
      }
      const lx = toPx((box.x + end) / 2) + 3;
      const my = top + h / 2;
      out.push(
        `<text class="label extra" x="${px(lx)}" y="${px(my)}" font-weight="normal" ` +
          `transform="rotate(-90 ${px(lx)} ${px(my)})">${esc(m.label)}</text>`,
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

/**
 * Cotas de uma abertura, dentro do vão (S17): id e tipo no topo; largura do RO logo abaixo do header;
 * na vertical, junto ao jack direito, peitoril (base do RO) e altura do RO em cadeia e a base do header
 * (= topo do RO) ao subfloor em linha própria. Porta (base do RO em 0): uma linha só.
 */
function openingDims(
  o: PanelOpening,
  panel: Panel,
  toPx: (x: number) => number,
  toPy: (yTop: number) => number,
): string[] {
  if (!(o.width > 0) || !(o.height > 0) || !Number.isFinite(o.top)) {
    throw new RangeError(`panelSvg: painel ${panel.id}: abertura ${o.id} com RO inválido (${o.width} × ${o.height}, topo ${o.top})`);
  }
  const out: string[] = [];
  const base = o.top - o.height;
  const kind = o.type === 'door' ? 'porta' : 'janela';
  // Largura: linha a 9" abaixo do topo do RO (ou no meio, em RO baixo); id e tipo logo abaixo da linha
  // (acima dela fica o valor; o "H" do header deitado fica colado ao header).
  const widthY = toPy(o.top - Math.min(9, o.height / 2));
  out.push(dimensionH(toPx(o.x), toPx(o.x + o.width), widthY, toPy(o.top), `RO ${formatInches(o.width)}`));
  out.push(
    `<text class="opening-id" x="${px(toPx(o.x + o.width / 2))}" y="${px(widthY + 12)}" font-size="10" ` +
      `fill="${MUTED}" text-anchor="middle">${esc(`${o.id} · ${kind}`)}</text>`,
  );
  // Alturas: linhas verticais recuadas do jack direito.
  const inset = Math.min(5, o.width / 4);
  const xA = toPx(o.x + o.width - inset);
  const xB = toPx(o.x + o.width - 2 * inset);
  const fromX = toPx(o.x + o.width);
  if (base > EPS) {
    out.push(dimensionV(xA, toPy(base), toPy(0), fromX, `peitoril ${formatInches(base)}`));
    out.push(dimensionV(xA, toPy(o.top), toPy(base), fromX, `RO ${formatInches(o.height)}`));
    out.push(dimensionV(xB, toPy(o.top), toPy(0), fromX, `header ${formatInches(o.top)}`));
  } else {
    const label =
      Math.abs(base) < EPS
        ? `RO ${formatInches(o.height)} = header ${formatInches(o.top)}`
        : `RO ${formatInches(o.height)} · header ${formatInches(o.top)}`;
    out.push(dimensionV(xA, toPy(o.top), toPy(0), fromX, label));
  }
  return out;
}

/**
 * Lista de peças na margem direita (S17): da `cutList`, com comprimento em pés-pol e em polegadas; depois
 * o peso estimado e os cortes na obra. Devolve o SVG e o y onde termina.
 */
function pieceList(panel: Panel, x: number, y0: number): { svg: string; bottom: number } {
  const lines = cutList(panel);
  const out: string[] = [];
  const col = { qty: x + 18, role: x + 26, section: x + 96, feet: x + 230, inches: x + LIST_WIDTH };
  let y = y0 + 12;
  out.push(`<g class="pieces" font-size="11" fill="#000">`);
  out.push(`<text x="${px(x)}" y="${px(y)}" font-size="12" font-weight="bold">Peças</text>`);
  y += LIST_ROW + 2;
  out.push(
    `<g font-size="9" fill="${MUTED}">` +
      `<text x="${px(col.qty)}" y="${px(y)}" text-anchor="end">qtd</text>` +
      `<text x="${px(col.role)}" y="${px(y)}">peça</text>` +
      `<text x="${px(col.section)}" y="${px(y)}">seção</text>` +
      `<text x="${px(col.feet)}" y="${px(y)}" text-anchor="end">pés-pol</text>` +
      `<text x="${px(col.inches)}" y="${px(y)}" text-anchor="end">pol</text></g>`,
  );
  out.push(
    `<line x1="${px(x)}" y1="${px(y + 3)}" x2="${px(x + LIST_WIDTH)}" y2="${px(y + 3)}" stroke="${MUTED}" stroke-width="0.5"/>`,
  );
  for (const l of lines) {
    y += LIST_ROW;
    out.push(
      `<g class="piece ${l.role}">` +
        `<text x="${px(col.qty)}" y="${px(y)}" text-anchor="end">${l.qty}</text>` +
        `<text x="${px(col.role)}" y="${px(y)}">${esc(CUT_ROLE_NAME[l.role])}</text>` +
        `<text x="${px(col.section)}" y="${px(y)}">${esc(l.section)}</text>` +
        `<text x="${px(col.feet)}" y="${px(y)}" text-anchor="end">${esc(formatFeetInches(l.length))}</text>` +
        `<text x="${px(col.inches)}" y="${px(y)}" text-anchor="end">${esc(formatInches(l.length))}</text></g>`,
    );
  }
  const total = lines.reduce((n, l) => n + l.qty, 0);
  y += LIST_ROW;
  out.push(
    `<line x1="${px(x)}" y1="${px(y - 9)}" x2="${px(x + LIST_WIDTH)}" y2="${px(y - 9)}" stroke="${MUTED}" stroke-width="0.5"/>`,
  );
  out.push(`<text x="${px(col.qty)}" y="${px(y)}" text-anchor="end" font-weight="bold">${total}</text>`);
  out.push(`<text x="${px(col.role)}" y="${px(y)}" font-weight="bold">peças a cortar</text>`);

  y += LIST_ROW + 6;
  const weightLb = panel.weightLb ?? panelWeight(panel);
  out.push(`<text class="weight" x="${px(x)}" y="${px(y)}">Peso estimado: ${weightLb} lb</text>`);
  y += LIST_ROW - 2;
  out.push(`<text x="${px(x)}" y="${px(y)}" font-size="9" fill="${MUTED}">madeira sem sheathing (hipótese P8)</text>`);

  if (panel.fieldCuts.length > 0) {
    y += LIST_ROW + 6;
    out.push(`<text x="${px(x)}" y="${px(y)}" font-weight="bold" fill="${FIELD_CUT}">Cortar na obra</text>`);
    for (const cut of panel.fieldCuts) {
      y += LIST_ROW;
      out.push(
        `<text class="field-cut-item" x="${px(x)}" y="${px(y)}" fill="${FIELD_CUT}">` +
          `${esc(`${roleName(cut.role)} ${formatInches(cut.length)} de x=${formatInches(cut.x)} a ${formatInches(cut.x + cut.length)} (${cut.openingId})`)}</text>`,
      );
    }
  }
  out.push('</g>');
  return { svg: out.join('\n'), bottom: y };
}

/** Nome legível de um papel de peça (cortes na obra). */
function roleName(role: MemberRole): string {
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

/** Cota horizontal em `y`, com linhas de chamada subindo até `fromY`. Usada também pela planta (S16). */
export function dimensionH(x1: number, x2: number, y: number, fromY: number, label: string): string {
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

/** Cota vertical em `x`, com linhas de chamada indo até `fromX`. Usada também pela planta (S16). */
export function dimensionV(x: number, y1: number, y2: number, fromX: number, label: string): string {
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
 * Marcas de layout: o início (0), as marcas `origin + k·spacing` estritamente entre 0 e o
 * fechamento (`length − 1.5`) — centro de cada stud de layout (S11) — e o próprio fechamento,
 * com o valor em polegadas medido da ponta do painel.
 */
function layoutMarks(
  length: number,
  spacing: number,
  origin: number,
  y: number,
  toPx: (x: number) => number,
): string {
  const closing = length - NOMINAL_2X_THICKNESS;
  const marks: number[] = [0];
  const first = Math.ceil(-origin / spacing);
  for (let k = first; ; k++) {
    const x = origin + k * spacing;
    if (x >= closing) break;
    if (x > 0) marks.push(x);
  }
  if (closing > 0) marks.push(closing);

  const parts: string[] = [`<g class="layout" stroke="#666" stroke-width="0.75">`];
  parts.push(`<line x1="${px(toPx(0))}" y1="${px(y)}" x2="${px(toPx(length))}" y2="${px(y)}"/>`);
  for (const x of marks) {
    parts.push(`<line x1="${px(toPx(x))}" y1="${px(y - 8)}" x2="${px(toPx(x))}" y2="${px(y)}"/>`);
  }
  parts.push('</g>');
  for (const [i, x] of marks.entries()) {
    // Fechamento colado à última marca (menos de 32 px): o rótulo desce uma linha para não a cobrir.
    const crowded = i === marks.length - 1 && i > 0 && (x - marks[i - 1]!) * (toPx(1) - toPx(0)) < 32;
    parts.push(
      `<text x="${px(toPx(x))}" y="${px(y + 11 + (crowded ? 11 : 0))}" font-size="9" fill="#666" text-anchor="middle">` +
        `${esc(formatInches(x))}</text>`,
    );
  }
  return parts.join('\n');
}

/** Centros (x, polegadas) de cada peça vertical do painel, sem repetição (1/64"), em ordem. */
export function verticalCenters(panel: Pick<Panel, 'members'>): number[] {
  const centers: number[] = [];
  for (const m of panel.members) {
    if (m.orientation !== 'vertical') continue;
    const box = memberBox(m);
    const c = Math.round((box.x + box.width / 2) * 64) / 64;
    if (!centers.includes(c)) centers.push(c);
  }
  return centers.sort((a, b) => a - b);
}

/**
 * Cadeia acumulada de cotas no rodapé (S17): tique em x=0 e em cada centro de peça vertical, com a
 * distância a x=0 em polegadas, girada −90°. Rótulos a menos de `CHAIN_MIN_SPACING` px do anterior na
 * mesma fileira descem para a segunda fileira. Devolve o SVG e o número de fileiras usadas (1 ou 2).
 */
function studChain(panel: Panel, y: number, toPx: (x: number) => number): { svg: string; rows: number } {
  const centers = verticalCenters(panel);
  const parts: string[] = [`<g class="chain" stroke="${DIM}" stroke-width="0.75">`];
  parts.push(`<line x1="${px(toPx(0))}" y1="${px(y)}" x2="${px(toPx(panel.length))}" y2="${px(y)}"/>`);
  parts.push(`<line x1="${px(toPx(0))}" y1="${px(y - 8)}" x2="${px(toPx(0))}" y2="${px(y + 4)}"/>`);
  for (const c of centers) {
    parts.push(`<line x1="${px(toPx(c))}" y1="${px(y - 6)}" x2="${px(toPx(c))}" y2="${px(y + 4)}"/>`);
  }
  parts.push('</g>');
  parts.push(`<g class="chain-labels" font-size="9" fill="${DIM}" text-anchor="end">`);
  const lastX = [-Infinity, -Infinity];
  let rows = 1;
  for (const c of centers) {
    const cx = toPx(c);
    // Fileira de cima se couber; senão a de baixo; se nem lá couber (escala muito pequena), a de cima mesmo.
    let row = 0;
    if (cx - lastX[0]! < CHAIN_MIN_SPACING) {
      rows = 2;
      if (cx - lastX[1]! >= CHAIN_MIN_SPACING) row = 1;
    }
    lastX[row] = cx;
    // Texto girado −90° com âncora no fim: lê de baixo para cima e termina em `ty`; o corpo das letras fica à
    // esquerda da âncora, então a âncora vai 3 px à direita do tique para centrar o texto nele.
    const tx = cx + 3;
    const ty = y + 6 + row * CHAIN_ROW;
    parts.push(
      `<text class="chain-label row-${row}" x="${px(tx)}" y="${px(ty)}" transform="rotate(-90 ${px(tx)} ${px(ty)})">` +
        `${esc(formatInches(c))}</text>`,
    );
  }
  parts.push('</g>');
  return { svg: parts.join('\n'), rows };
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
