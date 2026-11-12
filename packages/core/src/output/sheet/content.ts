/**
 * Bloco "Wall content" da folha (S39; pedidos 6, 7 e 8 da prancha da fábrica, `docs/14-prancha-fabrica.md`): sob o
 * cabeçalho, em toda a largura da folha, o que vai nesta parede — parede e tipo, pavimento e dimensões, aberturas,
 * ligações por ponta e T ao longo do painel (quem atravessa, montagem, avanço da chapa), fileiras de blocking, chapas,
 * posts e pregação. As linhas que saem de hipótese terminam com ▲ e o rodapé do bloco diz quais hipóteses
 * ("engineer to verify"). Nada aqui é cálculo: só o que o painel já tem, dito por extenso.
 *
 * Layout: grupos com o rótulo à esquerda e as linhas ao lado, em 1 a 3 colunas conforme a largura da folha (que vem do
 * desenho e da lista de peças, nunca do bloco); a altura do bloco é a da coluna mais alta e empurra o desenho e a lista
 * para baixo — nada se sobrepõe. Linha longa é quebrada nos espaços pela largura estimada do caractere.
 */

import type { JointNailing, SheathingFace } from '../../config';
import type { Panel } from '../../panel';
import { SHEATHING_JOINT_LABEL } from '../../rules/sheathing';
import { blockingRows } from './blocking';
import { wrapText } from './pieceList';
import { MUTED, esc, px } from './primitives';
import type { ContentGroupKey, SheetStrings } from './strings';

/** Uma linha do bloco; `hypothesis` = a P de que ela sai (ganha ▲). */
export interface ContentLine {
  text: string;
  hypothesis?: string;
}

export interface ContentGroup {
  key: ContentGroupKey;
  lines: ContentLine[];
}

/** O que o bloco precisa além do painel: a descrição do tipo de parede e a pregação em vigor (P48). */
export interface WallContentInput {
  description?: string;
  nailing: { wallJoint: JointNailing };
}

/** Altura de uma linha do bloco (px). */
const ROW = 12;
/** Espaço a mais entre dois grupos da mesma coluna (px). */
const GROUP_GAP = 3;
/** Largura da coluna dos rótulos (px). */
const LABEL_WIDTH = 64;
/** Entre colunas (px). */
const COLUMN_GAP = 18;
/** Coluna mais estreita que ainda leva outra ao lado (px). */
const COLUMN_MIN = 400;
const MAX_COLUMNS = 3;
/** Largura estimada de um caractere a 10 px (Helvetica, com folga para maiúsculas e algarismos). */
const CHAR_WIDTH = 5.2;
/** Do topo do bloco à linha de base do título; do título à primeira linha; da última linha ao fim do bloco. */
const TITLE_BASELINE = 12;
const FIRST_ROW = 16;
const BOTTOM_PAD = 18;

/** Os grupos do bloco para o painel, na ordem da folha. Grupo sem nada diz "none"; posts e pregação só quando há. */
export function wallContentGroups(panel: Panel, input: WallContentInput, S: SheetStrings): ContentGroup[] {
  const C = S.content;
  const none: ContentLine[] = [{ text: C.none }];
  const groups: ContentGroup[] = [];

  groups.push({
    key: 'wall',
    lines: [{ text: C.wall(panel, input.description) }, { text: C.kind(panel) }, { text: C.span(panel) }],
  });

  // Abertura montada por hipótese leva ▲: peça deitada a mais de 24" da top plate, com cripples (S44, P55).
  const openingHypothesis = (id: string): string | undefined =>
    panel.warnings.find((w) => w.code === 'FLAT_HEADER_CRIPPLES' && w.openingId === id)?.hypothesis;
  groups.push({
    key: 'openings',
    lines:
      panel.openings.length === 0
        ? none
        : panel.openings.map((o): ContentLine => {
            const hypothesis = openingHypothesis(o.id);
            return { text: C.opening(o), ...(hypothesis === undefined ? {} : { hypothesis }) };
          }),
  });

  // Ligações: pontas e T, de start para end (P46 no +, P47 no avanço da chapa, P49 na junta de painéis).
  const sh = panel.sheathing;
  const overhangAt = (side: 'start' | 'end'): number =>
    Math.max(0, ...(['exterior', 'interior'] as const).map((f) => sh?.overhang[f]?.[side] ?? 0));
  const endLine = (side: 'start' | 'end'): ContentLine => {
    const e = panel.ends?.[side];
    const overhang = overhangAt(side);
    const text = C.end(side, e, overhang);
    const hypothesis =
      e?.kind === 'panel' ? 'P49' : e?.kind === 'tee' && e.cross === true ? 'P46' : overhang > 1e-9 ? 'P47' : undefined;
    return hypothesis === undefined ? { text } : { text, hypothesis };
  };
  groups.push({
    key: 'joints',
    lines: [
      endLine('start'),
      ...(panel.tees ?? []).map((t): ContentLine => (t.sides === 2 ? { text: C.tee(t), hypothesis: 'P46' } : { text: C.tee(t) })),
      endLine('end'),
    ],
  });

  // Fileiras de blocking (S31/S36/S38): fogo P50, emenda da chapa P47, por altura P44.
  const rows = blockingRows(panel);
  groups.push({
    key: 'blocking',
    lines:
      rows.length === 0
        ? none
        : rows.map((r) => ({
            text: S.blockingRow(r),
            hypothesis: r.kind === 'fire' ? 'P50' : r.label === SHEATHING_JOINT_LABEL ? 'P47' : 'P44',
          })),
  });

  // Chapas (S38): resumo, pedaços, avanço de canto e linha de piso (P47).
  if (sh === undefined) {
    groups.push({ key: 'sheathing', lines: none });
  } else {
    const faces = (['exterior', 'interior'] as const).filter((f) => sh.overhang[f] !== undefined);
    const lines: ContentLine[] = [{ text: S.sheathing.summary(sh) }, { text: S.sheathing.area(sh) }];
    for (const face of faces) {
      const corner = C.sheathingCorner(sh.overhang[face]!, sh.side === 'both' ? (face as SheathingFace) : undefined);
      if (corner !== undefined) lines.push({ text: corner, hypothesis: 'P47' });
    }
    const floor = sh.overhang.exterior === undefined ? undefined : C.sheathingFloor(sh.overhang.exterior);
    if (floor !== undefined) lines.push({ text: floor, hypothesis: 'P47' });
    groups.push({ key: 'sheathing', lines });
  }

  // Posts (S37): o que o projeto diz, conectores inclusive (P45).
  const posts = panel.members.filter((m) => m.role === 'post').sort((a, b) => a.x - b.x);
  if (posts.length > 0) groups.push({ key: 'posts', lines: posts.map((p) => ({ text: C.post(p), hypothesis: 'P45' })) });

  // Pregação (P48): a das ligações entre paredes, quando o painel tem canto/T/+; a da chapa, quando tem chapa.
  const tied =
    (panel.tees ?? []).length > 0 ||
    (['start', 'end'] as const).some((s) => panel.ends?.[s] !== undefined && panel.ends[s]!.kind !== 'panel');
  const nailing: ContentLine[] = [
    ...(tied ? [{ text: C.wallJointNailing(input.nailing.wallJoint), hypothesis: 'P48' }] : []),
    ...(sh === undefined ? [] : [{ text: C.sheathingNailing(sh.nailing), hypothesis: 'P48' }]),
  ];
  if (nailing.length > 0) groups.push({ key: 'nailing', lines: nailing });

  return groups;
}

/** As hipóteses citadas no bloco, sem repetir, em ordem numérica. */
export function contentHypotheses(groups: readonly ContentGroup[]): string[] {
  const set = new Set(groups.flatMap((g) => g.lines.flatMap((l) => (l.hypothesis === undefined ? [] : [l.hypothesis]))));
  return [...set].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** Espaço que não quebra, só durante a quebra de linha. */
const KEEP = '\u0000';

/**
 * Quebra como `wrapText`, mas nunca dentro de uma medida (`82 1/2"`, `12'-2 3/4"`) nem antes da marca ▲ ou de um
 * "×": a cota partida em duas linhas se leria errado.
 */
export function wrapMeasured(text: string, max: number): string[] {
  const glued = text.replace(/(\d) (\d+\/\d+)/g, `$1${KEEP}$2`).replace(/ (▲|×)/g, `${KEEP}$1`);
  return wrapText(glued, max).map((line) => line.split(KEEP).join(' '));
}

/** Uma coluna montada: os grupos com as linhas já quebradas. */
interface PlacedGroup {
  key: ContentGroupKey;
  lines: string[];
}

/**
 * O bloco a partir de (`x`, `top`) com a largura `width`: SVG e altura total (px). Determinístico.
 */
export function contentBlock(
  groups: readonly ContentGroup[],
  x: number,
  top: number,
  width: number,
  S: SheetStrings,
): { svg: string[]; height: number } {
  const C = S.content;
  const columns = Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + COLUMN_GAP) / (COLUMN_MIN + COLUMN_GAP))));
  const columnWidth = (width - (columns - 1) * COLUMN_GAP) / columns;
  const chars = Math.max(20, Math.floor((columnWidth - LABEL_WIDTH) / CHAR_WIDTH));

  const placed: PlacedGroup[] = groups.map((g) => ({
    key: g.key,
    lines: g.lines.flatMap((l) => wrapMeasured(l.hypothesis === undefined ? l.text : `${l.text} ${C.verify}`, chars)),
  }));
  const groupHeight = (g: PlacedGroup): number => g.lines.length * ROW;

  // Colunas por ordem, sem partir grupo: passa para a seguinte quando a atual passaria da média.
  const total = placed.reduce((n, g) => n + groupHeight(g), 0) + GROUP_GAP * Math.max(0, placed.length - columns);
  const target = total / columns;
  const cols: PlacedGroup[][] = [[]];
  let used = 0;
  for (const g of placed) {
    const h = groupHeight(g);
    if (used > 0 && used + GROUP_GAP + h > target + ROW / 2 && cols.length < columns) {
      cols.push([]);
      used = 0;
    }
    cols[cols.length - 1]!.push(g);
    used += (used > 0 ? GROUP_GAP : 0) + h;
  }

  const out: string[] = [];
  const titleY = top + TITLE_BASELINE;
  out.push(`<g class="wall-content" font-size="10" fill="#000">`);
  out.push(`<text class="content-title" x="${px(x)}" y="${px(titleY)}" font-size="11" font-weight="bold">${esc(C.title)}</text>`);
  out.push(
    `<line x1="${px(x)}" y1="${px(titleY + 4)}" x2="${px(x + width)}" y2="${px(titleY + 4)}" stroke="${MUTED}" stroke-width="0.5"/>`,
  );
  let bottom = titleY + 4;
  cols.forEach((col, i) => {
    const cx = x + i * (columnWidth + COLUMN_GAP);
    let y = titleY + FIRST_ROW;
    col.forEach((g, j) => {
      if (j > 0) y += GROUP_GAP;
      out.push(
        `<text class="content-label" x="${px(cx)}" y="${px(y)}" font-size="9" font-weight="bold" fill="${MUTED}">` +
          `${esc(C.labels[g.key])}</text>`,
      );
      g.lines.forEach((line, k) => {
        out.push(`<text class="content-${g.key}" x="${px(cx + LABEL_WIDTH)}" y="${px(y + k * ROW)}">${esc(line)}</text>`);
      });
      y += g.lines.length * ROW;
    });
    bottom = Math.max(bottom, y - ROW);
  });
  const hypotheses = contentHypotheses(groups);
  if (hypotheses.length > 0) {
    bottom += ROW + 2;
    out.push(`<text class="content-verify" x="${px(x)}" y="${px(bottom)}" font-size="9" fill="${MUTED}">${esc(C.footer(hypotheses))}</text>`);
  }
  out.push('</g>');
  return { svg: out, height: bottom + BOTTOM_PAD - top };
}
