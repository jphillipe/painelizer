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
 *   fora (o lado oposto ao centro da planta) e o id da parede, do lado de dentro, no meio da plate.
 * - Cotas externas totais (faces externas) embaixo e à esquerda; seta do norte no canto superior direito quando
 *   `house.northAngle` existe (graus, do +y da planta no sentido horário).
 * - Saída determinística: mesma entrada → mesma string.
 */

import { sectionDepth, type Panel, type Point } from '../types';
import type { House, HouseWall } from '../house/types';
import { formatFeetInches, formatInches } from '../units';
import { DIM, FONT, STROKE, dimensionH, dimensionV, esc, px } from './svg';

export interface PlanSvgOptions {
  /** Pixels por polegada. Padrão 2. */
  scale?: number;
  /** Margem externa em px. Padrão 24. */
  margin?: number;
  /** Título no topo. Padrão "Planta de painéis". */
  title?: string;
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
  const title = opts.title ?? 'Planta de painéis';
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`housePlanSvg: scale inválido (${scale}); esperado número > 0`);
  }
  if (!Number.isFinite(margin) || margin < 0) {
    throw new RangeError(`housePlanSvg: margin inválido (${margin}); esperado número ≥ 0`);
  }
  if (house.northAngle !== undefined && !Number.isFinite(house.northAngle)) {
    throw new RangeError(`housePlanSvg: northAngle inválido (${house.northAngle}); esperado graus finitos`);
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
  const totalH = dimY + 8 + margin;

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
      `${walls.length} paredes · ${panels.length} painéis · ` +
      `${esc(formatFeetInches(maxX - minX))} × ${esc(formatFeetInches(maxY - minY))} (faces externas)</text>`,
  );

  if (house.northAngle !== undefined) {
    out.push(northArrow(house.northAngle, totalW - margin - 22, margin + 22));
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
        `<title>${esc(`${w.wall.id} ${w.wall.section} · plate ${formatFeetInches(length)} · ${n} ${n === 1 ? 'painel' : 'painéis'}`)}</title></rect>`,
    );
  }
  out.push('</g>');

  // Aberturas como vão.
  for (const w of walls) {
    for (const o of w.wall.openings) {
      out.push(openingMark(w, o.id, o.type, o.offset, o.roughWidth, scale, P));
    }
  }

  // Juntas entre painéis e ids.
  for (const w of walls) {
    const outward: 1 | -1 = w.axis >= (w.dir === 'x' ? cy : cx) ? 1 : -1;
    for (let i = 0; i + 1 < w.panels.length; i++) {
      out.push(jointTick(w, w.panels[i]!, w.panels[i + 1]!, scale, P));
    }
    for (const p of w.panels) {
      const plan = p.plan!;
      const mid: Point = { x: (plan.start.x + plan.end.x) / 2, y: (plan.start.y + plan.end.y) / 2 };
      out.push(labelAt(w, mid, outward, p.id, 10, PANEL_ID, 'panel-id', true, scale, P, p.id));
    }
    const mid: Point = { x: (w.from.x + w.to.x) / 2, y: (w.from.y + w.to.y) / 2 };
    out.push(labelAt(w, mid, outward === 1 ? -1 : 1, w.wall.id, 11, WALL_ID, 'wall-id', false, scale, P));
  }

  // Área de clique de cada painel (M3): retângulo transparente sobre o trecho da plate, com `data-panel-id`, por
  // cima de tudo — quem embute a planta numa página pode destacar e abrir a folha do painel. Invisível no papel.
  out.push('<g class="panel-hits" fill="transparent" stroke="none">');
  for (const w of walls) {
    for (const p of w.panels) {
      out.push(panelHit(w, p, scale, P));
    }
  }
  out.push('</g>');

  // Cotas externas totais.
  out.push(dimensionH(toPx(minX), toPx(maxX), dimY, toPy(minY), formatFeetInches(maxX - minX)));
  out.push(dimensionV(margin + 20, toPy(maxY), toPy(minY), toPx(minX), formatFeetInches(maxY - minY)));

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
      throw new RangeError(`housePlanSvg: painel ${p.id} sem plan — use os painéis de panelizeHouse`);
    }
    if (!ids.has(p.wallId)) {
      throw new RangeError(`housePlanSvg: painel ${p.id} é da parede ${p.wallId}, que não está na casa`);
    }
    const list = byWall.get(p.wallId) ?? [];
    list.push(p);
    byWall.set(p.wallId, list);
  }
  return house.walls.map((wall) => {
    const own = [...(byWall.get(wall.id) ?? [])].sort((a, b) => (a.wallOffset ?? 0) - (b.wallOffset ?? 0));
    if (own.length === 0) throw new RangeError(`housePlanSvg: parede ${wall.id} sem painéis`);
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
      `<title>${esc(`${id} ${type === 'window' ? 'janela' : 'porta'} · RO ${formatInches(roughWidth)} · parede ${w.wall.id}`)}</title></rect>`,
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
function jointTick(w: WallGeom, left: Panel, right: Panel, scale: number, P: (p: Point) => [number, number]): string {
  const at = left.plan!.end;
  const ext = w.t / 2 + JOINT_EXT / scale;
  const [x1, y1] = P(across(w, at, ext, -1));
  const [x2, y2] = P(across(w, at, ext, 1));
  return (
    `<line class="joint" x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}" stroke="${DIM}" stroke-width="1.5">` +
    `<title>${esc(`junta ${left.id} | ${right.id}`)}</title></line>`
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
function panelHit(w: WallGeom, p: Panel, scale: number, P: (p: Point) => [number, number]): string {
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
    `<title>${esc(`${p.id} · ${formatFeetInches(p.length)} · parede ${w.wall.id}`)}</title></rect>`
  );
}

/** Seta do norte centrada em (cx, cy), girada `angle` graus no sentido horário a partir de "para cima". */
function northArrow(angle: number, cx: number, cy: number): string {
  return [
    `<g class="north" transform="rotate(${px(angle)} ${px(cx)} ${px(cy)})" stroke="#000" fill="#000">`,
    `<title>${esc(`norte: ${px(angle)}° do +y da planta, sentido horário`)}</title>`,
    `<circle cx="${px(cx)}" cy="${px(cy)}" r="16" fill="none" stroke-width="0.75"/>`,
    `<line x1="${px(cx)}" y1="${px(cy + 12)}" x2="${px(cx)}" y2="${px(cy - 6)}" stroke-width="1.5"/>`,
    `<polygon points="${px(cx)},${px(cy - 14)} ${px(cx - 4)},${px(cy - 5)} ${px(cx + 4)},${px(cy - 5)}" stroke="none"/>`,
    `<text x="${px(cx)}" y="${px(cy - 19)}" font-size="9" font-weight="bold" text-anchor="middle" stroke="none">N</text>`,
    '</g>',
  ].join('\n');
}
