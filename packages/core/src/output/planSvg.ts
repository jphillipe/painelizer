/**
 * Planta de painéis em SVG (S16), sem dependências: vista de cima da casa com os painéis numerados.
 *
 * Convenções:
 * - Entrada: a `House` (paredes em planta, com aberturas medidas do `start`) e os painéis de `panelizeHouse`,
 *   cada um com `Panel.plan` (pontas da plate em planta). A plate de cada parede vai do `plan.start` do primeiro
 *   painel ao `plan.end` do último — por isso cantos e T saem **como ficam**: quem atravessa vai até a face
 *   externa da outra, quem encosta para na face.
 * - Escala padrão 2 px por polegada (`opts.scale`). O y da planta cresce para cima; o do SVG, para baixo.
 * - Parede = retângulo da plate com a espessura real da seção, centrado no eixo. Externa e interna com
 *   preenchimentos diferentes; `<title>` com id, seção, comprimento da plate e nº de painéis.
 * - Abertura = vão branco na parede, com as ombreiras marcadas; janela leva ainda o traço no eixo. O id da
 *   abertura fica dentro do vão.
 * - Junta entre painéis da mesma parede = tique atravessando a parede; o id de cada painel fica do lado de
 *   fora (o lado oposto ao centro da planta) e o id da parede, do lado de dentro, no meio da plate — seguido do
 *   tipo de parede quando ela tem (`W01 · WT-1S`, S35).
 * - Cotas externas totais (faces externas) embaixo e à esquerda; seta do norte no canto superior direito quando
 *   `house.northAngle` existe (graus, do +y da planta no sentido horário).
 * - Ligações (S39; pedido 6 da prancha): em cada canto, T e + um selo com L, T ou + do lado de dentro do encontro e um
 *   traço laranja no eixo da parede que **atravessa**, cobrindo a espessura das que encostam. Vêm de `Panel.ends`
 *   (primeiro e último painel de cada parede) e `Panel.tees`; a parede que atravessa é a do T e, no canto, a com
 *   `through`.
 * - Legenda (S39) sob as cotas: preenchimentos, junta de painéis, selos e traço; com tipos de parede, a leitura do rótulo
 *   (`W01 · WT-1S`) e uma linha por tipo usado, com a descrição de `opts.wallTypes` e as paredes que o usam.
 * - Textos sempre em inglês (`sheet/strings.ts`; P51 resolvida).
 * - Saída determinística: mesma entrada → mesma string.
 */

import type { Panel } from '../panel';
import { sectionDepth } from '../sections';
import type { Point, WallTypeEntry } from '../wall';
import type { House, HouseWall } from '../house/types';
import { formatFeetInches } from '../units';
import { wrapText } from './sheet/pieceList';
import { DIM, FONT, MUTED, STROKE, dimensionH, dimensionV, esc, px } from './sheet/primitives';
import { sheetStrings, type SheetStrings } from './sheet/strings';

export interface PlanSvgOptions {
  /** Pixels por polegada. Padrão 2. */
  scale?: number;
  /** Margem externa em px. Padrão 24. */
  margin?: number;
  /** Título no topo. Padrão "Panel plan". */
  title?: string;
  /** Catálogo de tipos de parede do projeto (`config.wallTypes`, S39): a descrição de cada tipo vai à legenda. */
  wallTypes?: Readonly<Record<string, WallTypeEntry>>;
}

const FILL_EXTERIOR = '#d9c9a8';
const FILL_INTERIOR = '#ece3d1';
const PANEL_ID = '#000';
const WALL_ID = '#666';
const TITLE_HEIGHT = 44;
/** Espaço à esquerda para a cota da altura total. */
const DIM_LEFT_WIDTH = 52;
/** Folga ao redor das faces externas para rótulos e tiques. */
const PAD = 30;
const DIM_GAP = 24;
/** Quanto o tique da junta passa de cada face da parede, em px. */
const JOINT_EXT = 6;
/** Distância da face da parede ao centro do rótulo (id de painel / de parede), em px. */
const LABEL_GAP = 9;
/** Cor do traço da parede que atravessa (S39). */
const THROUGH = '#d35400';
/** Raio do selo L/T/+ e quanto o traço passa da espessura das que encostam, em px. */
const BADGE_R = 6.5;
const THROUGH_EXT = 5;
/** Do selo à quina das faces, em px (o selo fica fora das paredes). */
const BADGE_GAP = 11;
/** Largura estimada de um caractere do rótulo da parede (11 px), para desviar dos selos (S40). */
const WALL_LABEL_CHAR = 6.2;
/** Folga entre o rótulo da parede e o selo de um encontro, em px (S40). */
const WALL_LABEL_PAD = 4;
/** Legenda: da linha da cota à primeira linha, altura da linha, largura estimada do caractere a 9 px. */
const LEGEND_GAP = 26;
const LEGEND_ROW = 16;
const LEGEND_CHAR = 4.8;

/** Uma parede com a geometria que o desenho precisa. */
interface WallGeom {
  wall: HouseWall;
  /** Espessura real. */
  t: number;
  dir: 'x' | 'y';
  /** +1 quando `end` tem coordenada maior que `start`. */
  sign: 1 | -1;
  /** Coordenada do eixo no outro sentido (y para parede em x, x para parede em y). */
  axis: number;
  /** Pontas da plate em planta (do primeiro ao último painel). */
  from: Point;
  to: Point;
  panels: Panel[];
}

/**
 * @throws RangeError opções inválidas; painel sem `plan` ou de parede desconhecida; parede sem painéis;
 *                    `northAngle` não finito
 */
export function housePlanSvg(house: House, panels: readonly Panel[], opts: PlanSvgOptions = {}): string {
  const scale = opts.scale ?? 2;
  const margin = opts.margin ?? 24;
  const S = sheetStrings();
  const title = opts.title ?? S.plan.title;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`housePlanSvg: invalid scale (${scale}); expected a number > 0`);
  }
  if (!Number.isFinite(margin) || margin < 0) {
    throw new RangeError(`housePlanSvg: invalid margin (${margin}); expected a number ≥ 0`);
  }
  if (house.northAngle !== undefined && !Number.isFinite(house.northAngle)) {
    throw new RangeError(`housePlanSvg: invalid northAngle (${house.northAngle}); expected finite degrees`);
  }

  const walls = wallGeoms(house, panels);

  // Caixa das faces externas.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    const r = plateRect(w);
    minX = Math.min(minX, r.x0);
    maxX = Math.max(maxX, r.x1);
    minY = Math.min(minY, r.y0);
    maxY = Math.max(maxY, r.y1);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const drawX0 = margin + DIM_LEFT_WIDTH + PAD;
  const drawY0 = margin + TITLE_HEIGHT + PAD;
  const drawW = (maxX - minX) * scale;
  const drawH = (maxY - minY) * scale;
  const dimY = drawY0 + drawH + PAD + DIM_GAP;
  const totalW = drawX0 + drawW + PAD + margin;
  const junctions = wallJunctions(walls);
  const legend = planLegend(walls, opts.wallTypes, margin, dimY + LEGEND_GAP, totalW - 2 * margin, S);
  const totalH = legend.bottom + margin;

  const toPx = (x: number): number => drawX0 + (x - minX) * scale;
  const toPy = (y: number): number => drawY0 + (maxY - y) * scale;
  /** Ponto da planta em px. */
  const P = (p: Point): [number, number] => [toPx(p.x), toPy(p.y)];

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px(totalW)}" height="${px(totalH)}" ` +
      `viewBox="0 0 ${px(totalW)} ${px(totalH)}" font-family="${FONT}">`,
  );
  out.push(`<rect width="${px(totalW)}" height="${px(totalH)}" fill="#ffffff"/>`);

  // Título e resumo.
  out.push(
    `<text x="${px(margin)}" y="${px(margin + 18)}" font-size="18" font-weight="bold" fill="#000">${esc(title)}</text>`,
  );
  out.push(
    `<text x="${px(margin)}" y="${px(margin + 34)}" font-size="12" fill="#333">` +
      `${esc(S.plan.summary(walls.length, panels.length, maxX - minX, maxY - minY))}</text>`,
  );

  if (house.northAngle !== undefined) {
    out.push(northArrow(house.northAngle, totalW - margin - 22, margin + 22, S));
  }

  // Paredes (plates com a espessura real).
  out.push(`<g class="walls" stroke="${STROKE}" stroke-width="1">`);
  for (const w of walls) {
    const r = plateRect(w);
    const kind = w.wall.exterior ? 'exterior' : 'interior';
    const length = Math.abs(w.dir === 'x' ? w.to.x - w.from.x : w.to.y - w.from.y);
    const n = w.panels.length;
    out.push(
      `<rect class="wall ${kind}" x="${px(toPx(r.x0))}" y="${px(toPy(r.y1))}" width="${px((r.x1 - r.x0) * scale)}" ` +
        `height="${px((r.y1 - r.y0) * scale)}" fill="${w.wall.exterior ? FILL_EXTERIOR : FILL_INTERIOR}">` +
        `<title>${esc(S.plan.wallTitle(w.wall.id, w.wall.section, length, n, w.wall.wallType))}</title></rect>`,
    );
  }
  out.push('</g>');

  // Aberturas como vão.
  for (const w of walls) {
    for (const o of w.wall.openings) {
      out.push(openingMark(w, o.id, o.type, o.offset, o.roughWidth, scale, P, S));
    }
  }

  // Juntas entre painéis e ids.
  for (const w of walls) {
    const outward: 1 | -1 = w.axis >= (w.dir === 'x' ? cy : cx) ? 1 : -1;
    for (let i = 0; i + 1 < w.panels.length; i++) {
      out.push(jointTick(w, w.panels[i]!, w.panels[i + 1]!, scale, P, S));
    }
    for (const p of w.panels) {
      const plan = p.plan!;
      const mid: Point = { x: (plan.start.x + plan.end.x) / 2, y: (plan.start.y + plan.end.y) / 2 };
      out.push(labelAt(w, mid, outward, p.id, 10, PANEL_ID, 'panel-id', true, scale, P, p.id));
    }
    // Rótulo da parede no meio, do lado de dentro; se cair sobre o selo/encontro de um T ou + (S40), anda ao longo da
    // parede até o ponto livre mais perto do meio. Sem colisão, fica no meio (como antes).
    const label = S.plan.wallLabel(w.wall.id, w.wall.wallType);
    const spot = wallLabelSpot(w, junctions, label.length * WALL_LABEL_CHAR, scale);
    out.push(labelAt(w, spot, outward === 1 ? -1 : 1, label, 11, WALL_ID, 'wall-id', false, scale, P));
  }

  // Ligações (S39): traço na parede que atravessa e selo L/T/+.
  const byId = new Map(walls.map((w) => [w.wall.id, w]));
  out.push('<g class="junctions">');
  for (const j of junctions) {
    out.push(junctionMark(j, byId, { x: cx, y: cy }, scale, P, S));
  }
  out.push('</g>');

  // Área de clique de cada painel (M3): retângulo transparente sobre o trecho da plate, com `data-panel-id`, por
  // cima de tudo — quem embute a planta numa página pode destacar e abrir a folha do painel. Invisível no papel.
  out.push('<g class="panel-hits" fill="transparent" stroke="none">');
  for (const w of walls) {
    for (const p of w.panels) {
      out.push(panelHit(w, p, scale, P, S));
    }
  }
  out.push('</g>');

  // Cotas externas totais.
  out.push(dimensionH(toPx(minX), toPx(maxX), dimY, toPy(minY), formatFeetInches(maxX - minX)));
  out.push(dimensionV(margin + 20, toPy(maxY), toPy(minY), toPx(minX), formatFeetInches(maxY - minY)));

  // Legenda (S39).
  out.push(...legend.svg);

  out.push('</svg>');
  return out.join('\n');
}

/**
 * Geometria de cada parede da casa, na ordem do arquivo, com seus painéis (de start para end).
 *
 * @throws RangeError painel sem `plan` ou de parede que não está na casa; parede sem painéis
 */
function wallGeoms(house: House, panels: readonly Panel[]): WallGeom[] {
  const ids = new Set(house.walls.map((w) => w.id));
  const byWall = new Map<string, Panel[]>();
  for (const p of panels) {
    if (p.plan === undefined) {
      throw new RangeError(`housePlanSvg: panel ${p.id} has no plan — use the panels from panelizeHouse`);
    }
    if (!ids.has(p.wallId)) {
      throw new RangeError(`housePlanSvg: panel ${p.id} belongs to wall ${p.wallId}, which is not in the house`);
    }
    const list = byWall.get(p.wallId) ?? [];
    list.push(p);
    byWall.set(p.wallId, list);
  }
  return house.walls.map((wall) => {
    const own = [...(byWall.get(wall.id) ?? [])].sort((a, b) => a.wallOffset - b.wallOffset);
    if (own.length === 0) throw new RangeError(`housePlanSvg: wall ${wall.id} has no panels`);
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const dir = dx !== 0 ? 'x' : 'y';
    const sign: 1 | -1 = (dir === 'x' ? dx : dy) > 0 ? 1 : -1;
    return {
      wall,
      t: sectionDepth(wall.section),
      dir,
      sign,
      axis: dir === 'x' ? wall.start.y : wall.start.x,
      from: own[0]!.plan!.start,
      to: own[own.length - 1]!.plan!.end,
      panels: own,
    };
  });
}

/** Retângulo da plate em planta (faces externas), polegadas. */
function plateRect(w: WallGeom): { x0: number; x1: number; y0: number; y1: number } {
  if (w.dir === 'x') {
    return { x0: Math.min(w.from.x, w.to.x), x1: Math.max(w.from.x, w.to.x), y0: w.axis - w.t / 2, y1: w.axis + w.t / 2 };
  }
  return { x0: w.axis - w.t / 2, x1: w.axis + w.t / 2, y0: Math.min(w.from.y, w.to.y), y1: Math.max(w.from.y, w.to.y) };
}

/** Ponto do eixo à distância `s` do `start` da parede, no sentido de `end`. */
function alongAxis(w: WallGeom, s: number): Point {
  return w.dir === 'x' ? { x: w.wall.start.x + w.sign * s, y: w.axis } : { x: w.axis, y: w.wall.start.y + w.sign * s };
}

/** Deslocamento perpendicular ao eixo: `side` +1 no sentido +y (parede em x) ou +x (parede em y). */
function across(w: WallGeom, p: Point, d: number, side: 1 | -1): Point {
  return w.dir === 'x' ? { x: p.x, y: p.y + side * d } : { x: p.x + side * d, y: p.y };
}

/** Vão da abertura na parede: branco sobre a plate, ombreiras, traço no eixo para janela e o id dentro. */
function openingMark(
  w: WallGeom,
  id: string,
  type: 'window' | 'door',
  offset: number,
  roughWidth: number,
  scale: number,
  P: (p: Point) => [number, number],
  S: SheetStrings,
): string {
  const a = alongAxis(w, offset);
  const b = alongAxis(w, offset + roughWidth);
  // Canto superior esquerdo do vão no SVG: menor x e maior y da planta.
  const corner0: Point =
    w.dir === 'x' ? { x: Math.min(a.x, b.x), y: w.axis + w.t / 2 } : { x: w.axis - w.t / 2, y: Math.max(a.y, b.y) };
  const [x, y] = P(corner0);
  const width = (w.dir === 'x' ? roughWidth : w.t) * scale;
  const height = (w.dir === 'x' ? w.t : roughWidth) * scale;
  const parts: string[] = [`<g class="opening ${type}" stroke="${STROKE}" stroke-width="1">`];
  parts.push(
    `<rect x="${px(x)}" y="${px(y)}" width="${px(width)}" height="${px(height)}" fill="#ffffff" stroke="none">` +
      `<title>${esc(S.plan.openingTitle(id, type, roughWidth, w.wall.id))}</title></rect>`,
  );
  for (const p of [a, b]) {
    const [x1, y1] = P(across(w, p, w.t / 2, -1));
    const [x2, y2] = P(across(w, p, w.t / 2, 1));
    parts.push(`<line x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}"/>`);
  }
  if (type === 'window') {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    parts.push(`<line x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}" stroke-width="0.75"/>`);
  }
  parts.push('</g>');
  const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const [mx, my] = P(mid);
  const rotate = w.dir === 'y' ? ` transform="rotate(-90 ${px(mx)} ${px(my)})"` : '';
  parts.push(
    `<text class="opening-id" x="${px(mx)}" y="${px(my)}" font-size="7" fill="#333" text-anchor="middle" ` +
      `dominant-baseline="middle"${rotate}>${esc(id)}</text>`,
  );
  return parts.join('\n');
}

/** Tique da junta entre dois painéis vizinhos, atravessando a parede e passando `JOINT_EXT` px de cada face. */
function jointTick(
  w: WallGeom,
  left: Panel,
  right: Panel,
  scale: number,
  P: (p: Point) => [number, number],
  S: SheetStrings,
): string {
  const at = left.plan!.end;
  const ext = w.t / 2 + JOINT_EXT / scale;
  const [x1, y1] = P(across(w, at, ext, -1));
  const [x2, y2] = P(across(w, at, ext, 1));
  return (
    `<line class="joint" x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}" stroke="${DIM}" stroke-width="1.5">` +
    `<title>${esc(S.plan.jointTitle(left.id, right.id))}</title></line>`
  );
}

/** Rótulo paralelo à parede, do lado `side`, a `LABEL_GAP` px da face. Parede em y: texto de baixo para cima. */
function labelAt(
  w: WallGeom,
  at: Point,
  side: 1 | -1,
  text: string,
  fontSize: number,
  fill: string,
  cls: string,
  bold: boolean,
  scale: number,
  P: (p: Point) => [number, number],
  panelId?: string,
): string {
  const [x, y] = P(across(w, at, w.t / 2 + LABEL_GAP / scale, side));
  const rotate = w.dir === 'y' ? ` transform="rotate(-90 ${px(x)} ${px(y)})"` : '';
  const weight = bold ? ' font-weight="bold"' : '';
  const data = panelId === undefined ? '' : ` data-panel-id="${esc(panelId)}"`;
  return (
    `<text class="${cls}"${data} x="${px(x)}" y="${px(y)}" font-size="${fontSize}"${weight} fill="${fill}" ` +
    `text-anchor="middle" dominant-baseline="middle"${rotate}>${esc(text)}</text>`
  );
}

/** Retângulo transparente do trecho de plate de um painel (faces externas), com `data-panel-id` e `<title>`. */
function panelHit(w: WallGeom, p: Panel, scale: number, P: (p: Point) => [number, number], S: SheetStrings): string {
  const plan = p.plan!;
  const corner: Point =
    w.dir === 'x'
      ? { x: Math.min(plan.start.x, plan.end.x), y: w.axis + w.t / 2 }
      : { x: w.axis - w.t / 2, y: Math.max(plan.start.y, plan.end.y) };
  const [x, y] = P(corner);
  const along = Math.abs(w.dir === 'x' ? plan.end.x - plan.start.x : plan.end.y - plan.start.y);
  const width = (w.dir === 'x' ? along : w.t) * scale;
  const height = (w.dir === 'x' ? w.t : along) * scale;
  return (
    `<rect class="panel-hit" data-panel-id="${esc(p.id)}" x="${px(x)}" y="${px(y)}" width="${px(width)}" height="${px(height)}">` +
    `<title>${esc(S.plan.panelTitle(p.id, p.length, w.wall.id))}</title></rect>`
  );
}

/** Encontro de paredes na planta (S39): ponto dos eixos, tipo, quem atravessa e quem está nele. */
interface Junction {
  at: Point;
  kind: 'corner' | 'tee' | 'cross';
  /** Parede que atravessa. */
  through?: string;
  /** Todas as paredes do encontro, a que atravessa primeiro. */
  walls: string[];
}

const KIND_RANK = { corner: 0, tee: 1, cross: 2 } as const;

/** Os encontros da casa, a partir das pontas e dos T dos painéis; cada um uma vez, na ordem em que aparece. */
function wallJunctions(walls: readonly WallGeom[]): Junction[] {
  const found = new Map<string, Junction>();
  const add = (at: Point, kind: Junction['kind'], through: string | undefined, ids: readonly (string | undefined)[]): void => {
    const key = `${Math.round(at.x * 100)},${Math.round(at.y * 100)}`;
    const j = found.get(key) ?? { at, kind, walls: [] };
    if (KIND_RANK[kind] > KIND_RANK[j.kind]) j.kind = kind;
    if (j.through === undefined && through !== undefined) j.through = through;
    for (const id of ids) if (id !== undefined && !j.walls.includes(id)) j.walls.push(id);
    found.set(key, j);
  };
  for (const w of walls) {
    const first = w.panels[0]!;
    const last = w.panels[w.panels.length - 1]!;
    for (const [e, at] of [
      [first.ends?.start, w.wall.start],
      [last.ends?.end, w.wall.end],
    ] as const) {
      if (e === undefined || e.kind === 'panel') continue;
      if (e.kind === 'corner') add(at, 'corner', e.through ? w.wall.id : e.wallId, [w.wall.id, e.wallId]);
      else add(at, e.cross === true ? 'cross' : 'tee', e.wallId, [e.wallId, w.wall.id]);
    }
    for (const p of w.panels) {
      for (const t of p.tees ?? []) {
        const at = w.dir === 'x' ? { x: p.plan!.start.x + w.sign * t.x, y: w.axis } : { x: w.axis, y: p.plan!.start.y + w.sign * t.x };
        add(at, t.sides === 2 ? 'cross' : 'tee', w.wall.id, [w.wall.id, t.wallId, t.otherWallId]);
      }
    }
  }
  for (const j of found.values()) {
    if (j.through !== undefined) j.walls = [j.through, ...j.walls.filter((id) => id !== j.through)];
  }
  return [...found.values()];
}

/** Letra do selo. */
/**
 * Onde vai o rótulo da parede (S40): o meio da parede, salvo quando a faixa do rótulo ao longo dela cobre um encontro
 * desta parede (a outra parede que chega e o selo L/T/+ ficam do lado de dentro, onde o rótulo também fica). Aí, o
 * ponto mais perto do meio em que o rótulo inteiro fica entre as pontas e fora de todo encontro; sem nenhum, o meio.
 *
 * @param widthPx largura estimada do texto, px
 */
function wallLabelSpot(w: WallGeom, junctions: readonly Junction[], widthPx: number, scale: number): Point {
  const lo = Math.min(w.dir === 'x' ? w.from.x : w.from.y, w.dir === 'x' ? w.to.x : w.to.y);
  const hi = Math.max(w.dir === 'x' ? w.from.x : w.from.y, w.dir === 'x' ? w.to.x : w.to.y);
  const mid = (lo + hi) / 2;
  const half = (widthPx / 2 + WALL_LABEL_PAD) / scale;
  // Cada encontro desta parede ocupa, ao longo dela, a espessura das outras e o selo (de lado e de diâmetro).
  const blocked = junctions
    .filter((j) => j.walls.includes(w.wall.id))
    .map((j) => {
      const c = w.dir === 'x' ? j.at.x : j.at.y;
      const r = (BADGE_GAP + 2 * BADGE_R) / scale + w.t / 2;
      return { lo: c - r, hi: c + r };
    });
  const free = (c: number): boolean => c - half >= lo - 1e-9 && c + half <= hi + 1e-9 && !blocked.some((b) => c + half > b.lo && c - half < b.hi);
  const at = (c: number): Point => (w.dir === 'x' ? { x: c, y: w.axis } : { x: w.axis, y: c });
  if (free(mid)) return at(mid);
  // Candidatos: encostado de um lado ou do outro de cada encontro; o mais perto do meio.
  const options = blocked.flatMap((b) => [b.lo - half, b.hi + half]).filter(free);
  if (options.length === 0) return at(mid);
  options.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  return at(options[0]!);
}

const BADGE: Readonly<Record<Junction['kind'], string>> = { corner: 'L', tee: 'T', cross: '+' };

/** Traço no eixo da parede que atravessa e selo do lado de dentro do encontro (voltado ao centro da planta). */
function junctionMark(
  j: Junction,
  byId: ReadonlyMap<string, WallGeom>,
  center: Point,
  scale: number,
  P: (p: Point) => [number, number],
  S: SheetStrings,
): string {
  const parts: string[] = [`<g class="junction ${j.kind}">`, `<title>${esc(S.plan.junctionTitle(j.kind, j.through, j.walls))}</title>`];
  const others = j.walls.filter((id) => id !== j.through).map((id) => byId.get(id)?.t ?? 0);
  const half = Math.max(0, ...others) / 2;
  const tw = j.through === undefined ? undefined : byId.get(j.through);
  if (tw !== undefined) {
    // Do encontro, meia espessura das outras e mais um pouco para cada lado, sem passar da ponta da plate.
    const ext = half + THROUGH_EXT / scale;
    const lo = Math.min(...(tw.dir === 'x' ? [tw.from.x, tw.to.x] : [tw.from.y, tw.to.y]));
    const hi = Math.max(...(tw.dir === 'x' ? [tw.from.x, tw.to.x] : [tw.from.y, tw.to.y]));
    const c = tw.dir === 'x' ? j.at.x : j.at.y;
    const a = Math.max(lo, c - ext);
    const b = Math.min(hi, c + ext);
    const [x1, y1] = P(tw.dir === 'x' ? { x: a, y: tw.axis } : { x: tw.axis, y: a });
    const [x2, y2] = P(tw.dir === 'x' ? { x: b, y: tw.axis } : { x: tw.axis, y: b });
    parts.push(
      `<line class="through" x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}" stroke="${THROUGH}" stroke-width="2.5"/>`,
    );
  }
  const tMax = Math.max(tw?.t ?? 0, ...others);
  const d = tMax / 2 + BADGE_GAP / scale;
  const sx = center.x < j.at.x ? -1 : 1;
  const sy = center.y < j.at.y ? -1 : 1;
  const [bx, by] = P({ x: j.at.x + sx * d, y: j.at.y + sy * d });
  parts.push(badge(bx, by, BADGE[j.kind]));
  parts.push('</g>');
  return parts.join('\n');
}

/** Selo redondo com a letra, centrado em (x, y). O + é desenhado (o caractere a 8 px some). */
function badge(x: number, y: number, letter: string): string {
  const circle = `<circle cx="${px(x)}" cy="${px(y)}" r="${BADGE_R}" fill="#ffffff" stroke="#333" stroke-width="0.75"/>`;
  if (letter === '+') {
    return (
      circle +
      `<path d="M${px(x - 3.5)} ${px(y)}H${px(x + 3.5)}M${px(x)} ${px(y - 3.5)}V${px(y + 3.5)}" stroke="#000" stroke-width="1.5"/>`
    );
  }
  return (
    circle +
    `<text x="${px(x)}" y="${px(y)}" font-size="8" font-weight="bold" fill="#000" text-anchor="middle" ` +
    `dominant-baseline="central">${esc(letter)}</text>`
  );
}

/**
 * Legenda sob as cotas (S39): símbolos em fluxo (quebram na largura) e, com tipos de parede, a leitura do rótulo e uma
 * linha por tipo usado. Devolve o SVG e o y onde termina.
 */
function planLegend(
  walls: readonly WallGeom[],
  wallTypes: Readonly<Record<string, WallTypeEntry>> | undefined,
  x0: number,
  top: number,
  width: number,
  S: SheetStrings,
): { svg: string[]; bottom: number } {
  const L = S.plan.legend;
  const out: string[] = ['<g class="legend" font-size="9" fill="#333">'];
  type Item = { glyph: (x: number, y: number) => string; text: string };
  const swatch = (fill: string) => (x: number, y: number) =>
    `<rect x="${px(x)}" y="${px(y - 5)}" width="14" height="8" fill="${fill}" stroke="${STROKE}" stroke-width="0.75"/>`;
  const items: Item[] = [
    { glyph: swatch(FILL_EXTERIOR), text: L.exterior },
    { glyph: swatch(FILL_INTERIOR), text: L.interior },
    { glyph: (x, y) => `<line x1="${px(x + 7)}" y1="${px(y - 7)}" x2="${px(x + 7)}" y2="${px(y + 5)}" stroke="${DIM}" stroke-width="1.5"/>`, text: L.joint },
    { glyph: (x, y) => badge(x + 7, y - 1, BADGE.corner), text: L.corner },
    { glyph: (x, y) => badge(x + 7, y - 1, BADGE.tee), text: L.tee },
    { glyph: (x, y) => badge(x + 7, y - 1, BADGE.cross), text: L.cross },
    { glyph: (x, y) => `<line x1="${px(x)}" y1="${px(y - 1)}" x2="${px(x + 14)}" y2="${px(y - 1)}" stroke="${THROUGH}" stroke-width="2.5"/>`, text: L.through },
  ];
  let x = x0;
  let y = top;
  for (const item of items) {
    const w = 18 + item.text.length * LEGEND_CHAR + 14;
    if (x > x0 && x + w > x0 + width) {
      x = x0;
      y += LEGEND_ROW;
    }
    out.push(item.glyph(x, y));
    out.push(`<text x="${px(x + 18)}" y="${px(y)}">${esc(item.text)}</text>`);
    x += w;
  }
  // Tipos de parede (S35/S39): só quando alguma parede tem.
  const used = new Map<string, string[]>();
  for (const w of walls) {
    if (w.wall.wallType === undefined) continue;
    used.set(w.wall.wallType, [...(used.get(w.wall.wallType) ?? []), w.wall.id]);
  }
  if (used.size > 0) {
    y += 4;
    const chars = Math.max(30, Math.floor(width / (LEGEND_CHAR + 0.4)));
    const lines = [
      L.wallLabel,
      ...[...used.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, ids]) => L.wallType(tag, wallTypes?.[tag]?.description, ids)),
    ];
    for (const text of lines) {
      for (const line of wrapText(text, chars)) {
        y += LEGEND_ROW - 3;
        out.push(`<text class="legend-type" x="${px(x0)}" y="${px(y)}" fill="${MUTED}">${esc(line)}</text>`);
      }
    }
  }
  out.push('</g>');
  return { svg: out, bottom: y + 6 };
}

/** Seta do norte centrada em (cx, cy), girada `angle` graus no sentido horário a partir de "para cima". */
function northArrow(angle: number, cx: number, cy: number, S: SheetStrings): string {
  return [
    `<g class="north" transform="rotate(${px(angle)} ${px(cx)} ${px(cy)})" stroke="#000" fill="#000">`,
    `<title>${esc(S.plan.northTitle(px(angle)))}</title>`,
    `<circle cx="${px(cx)}" cy="${px(cy)}" r="16" fill="none" stroke-width="0.75"/>`,
    `<line x1="${px(cx)}" y1="${px(cy + 12)}" x2="${px(cx)}" y2="${px(cy - 6)}" stroke-width="1.5"/>`,
    `<polygon points="${px(cx)},${px(cy - 14)} ${px(cx - 4)},${px(cy - 5)} ${px(cx + 4)},${px(cy - 5)}" stroke="none"/>`,
    `<text x="${px(cx)}" y="${px(cy - 19)}" font-size="9" font-weight="bold" text-anchor="middle" stroke="none">N</text>`,
    '</g>',
  ].join('\n');
}
