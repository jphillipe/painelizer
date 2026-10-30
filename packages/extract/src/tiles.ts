/**
 * Recortes em alta resolução das folhas de planta (2026-10-30). A API transforma cada página do PDF numa
 * imagem de no máximo 2 576 px no lado maior (tier de alta resolução do Opus 5.5): numa folha de 34×22" isso
 * dá ~72 dpi, e uma porta de 2'6" em 1/4"=1' vira ~45 px — o arco some e a IA não acha as portas internas.
 * Dividindo a folha em poucos recortes, cada um dentro dos limites da API, a mesma porta passa de 100 px.
 *
 * Só geometria pura e determinística aqui: quem renderiza é `pdf.ts` (`renderPageTiles`), quem decide quais
 * páginas recortar é `client.ts`. Coordenadas em pontos PDF, origem no canto superior esquerdo, y para baixo —
 * as mesmas do texto posicionado (`readPageText`), para a legenda de cada recorte amarrar imagem e cotas.
 *
 * Limites da API (docs de 2026-10-30): lado maior ≤ 2 576 px E ≤ 4 784 tokens visuais (⌈w/28⌉·⌈h/28⌉) por
 * imagem; acima disso a API reduz. Acima de 20 blocos `image` por requisição vale um limite mais restrito,
 * então `recortes + imagens do usuário ≤ 20`.
 */

export type TileFormat = 'png' | 'jpeg';

export interface TileOptions {
  /** Resolução alvo (pontos de papel por polegada) para as folhas de planta. */
  dpi: number;
  /** Alvo para plantas ampliadas (já estão em escala maior): recortes a menos. */
  enlargedDpi: number;
  /** Fração da célula compartilhada entre recortes vizinhos (0,08 = 8 %). */
  overlap: number;
  /** Teto de recortes por página. */
  maxPerPage: number;
  /** Teto de recortes por requisição. */
  maxTotal: number;
  format: TileFormat;
}

export const DEFAULT_TILE_OPTIONS: TileOptions = { dpi: 200, enlargedDpi: 130, overlap: 0.08, maxPerPage: 6, maxTotal: 16, format: 'png' };

export const TILE_MAX_EDGE = 2576;
export const TILE_MAX_TOKENS = 4784;
export const TILE_PATCH = 28;
export const MAX_IMAGES_PER_REQUEST = 20;
/** Um recorte só já serve quando chega a esta fração do alvo: poupa recortes (e tokens) por um ganho marginal. */
const TARGET_TOLERANCE = 0.9;

/** Um recorte: região na página (pt, inteiros) e tamanho da imagem (px). `row`/`col` são 1-based. */
export interface TileRect {
  row: number;
  col: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

export interface TileGrid {
  rows: number;
  cols: number;
  /** px por pt. */
  scale: number;
  /** Resolução efetiva (px por polegada de papel), arredondada. */
  dpi: number;
  tiles: TileRect[];
}

/** Tokens visuais de uma imagem: um por bloco de 28×28 px. */
export function tileTokens(width: number, height: number): number {
  return Math.ceil(width / TILE_PATCH) * Math.ceil(height / TILE_PATCH);
}

/** Estimativa do tamanho codificado em base64 (para a prévia, sem renderizar): line art em PNG ≈ 0,35 B/px, JPEG ≈ 0,15. */
export function estimateTileBytes(width: number, height: number, format: TileFormat): number {
  const perPixel = format === 'png' ? 0.35 : 0.15;
  return Math.ceil((width * height * perPixel * 4) / 3);
}

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Regiões de uma grade R×C com `overlap` da célula compartilhado entre vizinhos (nas bordas, só para dentro). */
function regions(width: number, height: number, rows: number, cols: number, overlap: number): Region[][] {
  const cellW = width / cols;
  const cellH = height / rows;
  const padX = (overlap / 2) * cellW;
  const padY = (overlap / 2) * cellH;
  const out: Region[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: Region[] = [];
    for (let c = 0; c < cols; c++) {
      line.push({
        x0: Math.floor(Math.max(0, c * cellW - padX)),
        y0: Math.floor(Math.max(0, r * cellH - padY)),
        x1: Math.ceil(Math.min(width, (c + 1) * cellW + padX)),
        y1: Math.ceil(Math.min(height, (r + 1) * cellH + padY)),
      });
    }
    out.push(line);
  }
  return out;
}

/** Maior escala (px/pt) em que todos os recortes da grade cabem nos limites da API. */
function maxScale(grid: Region[][]): number {
  let s = Infinity;
  for (const line of grid) {
    for (const t of line) {
      const w = t.x1 - t.x0;
      const h = t.y1 - t.y0;
      s = Math.min(s, TILE_MAX_EDGE / Math.max(w, h), Math.sqrt((TILE_MAX_TOKENS * TILE_PATCH * TILE_PATCH) / (w * h)));
    }
  }
  // O arredondamento de ⌈·/28⌉ pode estourar o teto por um bloco: refina para baixo até caber.
  while (!fits(grid, s)) s *= 0.995;
  return s;
}

function fits(grid: Region[][], scale: number): boolean {
  for (const line of grid) {
    for (const t of line) {
      const w = Math.round(scale * (t.x1 - t.x0));
      const h = Math.round(scale * (t.y1 - t.y0));
      if (Math.max(w, h) > TILE_MAX_EDGE || tileTokens(w, h) > TILE_MAX_TOKENS) return false;
    }
  }
  return true;
}

/**
 * Grade de recortes de uma página. Entre as grades com até `maxTiles` recortes, a de menos recortes que chega
 * a 90 % da resolução alvo; se nenhuma chega, a de maior resolução (empate: menos recortes). Ringgold
 * (2448×1584 pt, teto 6) → 2×3 a ~164 dpi; Letter → 1 recorte a ~197 dpi.
 */
export function planTiles(
  page: { width: number; height: number },
  targetDpi: number,
  opts: Pick<TileOptions, 'overlap' | 'maxPerPage'>,
  maxTiles: number = opts.maxPerPage,
): TileGrid {
  if (!(page.width > 0 && page.height > 0)) throw new RangeError(`planTiles: página ${page.width}×${page.height} pt`);
  if (!(targetDpi > 0)) throw new RangeError(`planTiles: dpi ${targetDpi}`);
  const limit = Math.max(1, Math.floor(maxTiles));
  const sTarget = targetDpi / 72;

  let best: { rows: number; cols: number; grid: Region[][]; sMax: number } | undefined;
  let reached: typeof best;
  for (let n = 1; n <= limit && reached === undefined; n++) {
    let bestForN: typeof best;
    for (let rows = 1; rows <= n; rows++) {
      if (n % rows !== 0) continue;
      const cols = n / rows;
      const grid = regions(page.width, page.height, rows, cols, opts.overlap);
      const sMax = maxScale(grid);
      if (bestForN === undefined || sMax > bestForN.sMax) bestForN = { rows, cols, grid, sMax };
    }
    if (bestForN === undefined) continue;
    if (best === undefined || bestForN.sMax > best.sMax) best = bestForN;
    if (bestForN.sMax >= TARGET_TOLERANCE * sTarget) reached = bestForN;
  }
  const chosen = reached ?? best;
  if (chosen === undefined) throw new RangeError('planTiles: nenhuma grade');
  const scale = Math.min(sTarget, chosen.sMax);
  const tiles: TileRect[] = [];
  chosen.grid.forEach((line, r) =>
    line.forEach((t, c) =>
      tiles.push({
        row: r + 1,
        col: c + 1,
        ...t,
        width: Math.round(scale * (t.x1 - t.x0)),
        height: Math.round(scale * (t.y1 - t.y0)),
      }),
    ),
  );
  return { rows: chosen.rows, cols: chosen.cols, scale, dpi: Math.round(scale * 72), tiles };
}

export interface TilePage {
  /** Chave do chamador (`<fonte>:<página>`). */
  key: string;
  category: 'plan' | 'enlarged';
  width: number;
  height: number;
}

/** Recortes reservados para cada planta ampliada antes de as plantas gerais gastarem o orçamento. */
const ENLARGED_RESERVE = 2;

/**
 * Distribui o orçamento de recortes da requisição: `min(maxTotal, 20 − imagens do usuário)`. As plantas gerais
 * repartem por igual o que sobra depois de reservar `ENLARGED_RESERVE` por ampliada (no Horace são 3 plantas
 * e 4 ampliadas: sem a reserva, as plantas gastavam tudo e as ampliadas — onde estão as portas das unidades —
 * ficavam sem recorte); cada planta leva no máximo `maxPerPage`. Depois as ampliadas repartem por igual o
 * restante (pelo menos 1 cada, enquanto houver). Páginas sem orçamento vão em `skipped`.
 */
export function allocateTiles(
  pages: readonly TilePage[],
  opts: TileOptions,
  imagesInRequest = 0,
): { grids: Map<string, TileGrid>; skipped: string[] } {
  const grids = new Map<string, TileGrid>();
  const skipped: string[] = [];
  let remaining = Math.max(0, Math.min(opts.maxTotal, MAX_IMAGES_PER_REQUEST - imagesInRequest));
  const plans = pages.filter((p) => p.category === 'plan');
  const enlarged = pages.filter((p) => p.category === 'enlarged');
  const reserve = Math.min(remaining, enlarged.length * ENLARGED_RESERVE);
  let planBudget = remaining - reserve;
  // Em ordem (a primeira planta listada costuma ser a principal): cada uma leva o que precisa até o teto por
  // página; repartir por igual entre várias plantas deixava todas a ~75 dpi, que não enxerga porta nenhuma.
  for (const p of plans) {
    if (planBudget <= 0) {
      skipped.push(p.key);
      continue;
    }
    const grid = planTiles(p, opts.dpi, opts, Math.min(opts.maxPerPage, planBudget));
    grids.set(p.key, grid);
    planBudget -= grid.tiles.length;
    remaining -= grid.tiles.length;
  }
  const share = enlarged.length === 0 ? 0 : Math.max(1, Math.floor(remaining / enlarged.length));
  for (const p of enlarged) {
    if (remaining <= 0) {
      skipped.push(p.key);
      continue;
    }
    const grid = planTiles(p, opts.enlargedDpi, opts, Math.min(opts.maxPerPage, share, remaining));
    grids.set(p.key, grid);
    remaining -= grid.tiles.length;
  }
  return { grids, skipped };
}

/**
 * Rótulo de texto que antecede cada recorte na mensagem: amarra a imagem à página e à região em pontos, no
 * mesmo sistema do texto posicionado, para o modelo cruzar o que vê com as cotas que lê.
 */
export function tileCaption(args: { name: string; page: number; sheet?: string; title?: string; grid: TileGrid; tile: TileRect }): string {
  const { name, page, sheet, title, grid, tile } = args;
  const label = sheet === undefined ? `p.${page}` : title === undefined ? sheet : `${sheet} ${title}`;
  return (
    `## recorte ${name} · ${label} · linha ${tile.row}/${grid.rows}, coluna ${tile.col}/${grid.cols} · ` +
    `região x ${tile.x0}–${tile.x1} pt, y ${tile.y0}–${tile.y1} pt da página ${page} ` +
    `(mesmas coordenadas do texto posicionado; y cresce para baixo) · ${tile.width}×${tile.height} px, ${grid.dpi} dpi`
  );
}
