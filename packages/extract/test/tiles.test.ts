import { describe, expect, it } from 'vitest';
import {
  allocateTiles,
  DEFAULT_TILE_OPTIONS,
  estimateTileBytes,
  MAX_IMAGES_PER_REQUEST,
  planTiles,
  TILE_MAX_EDGE,
  TILE_MAX_TOKENS,
  tileCaption,
  tileTokens,
  type TileGrid,
} from '../src/tiles';

/** Folha do Ringgold (34×22" em pontos) e Letter. */
const RINGGOLD = { width: 2448, height: 1584 };
const LETTER = { width: 612, height: 792 };

function withinApiLimits(grid: TileGrid) {
  for (const t of grid.tiles) {
    expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(TILE_MAX_EDGE);
    expect(tileTokens(t.width, t.height)).toBeLessThanOrEqual(TILE_MAX_TOKENS);
  }
}

describe('tileTokens / estimateTileBytes', () => {
  it('um token por bloco de 28×28, arredondando para cima', () => {
    expect(tileTokens(28, 28)).toBe(1);
    expect(tileTokens(29, 28)).toBe(2);
    expect(tileTokens(1700, 2200)).toBe(61 * 79); // 4819: estoura o teto por um bloco
    expect(tileTokens(2576, 1449)).toBeLessThanOrEqual(TILE_MAX_TOKENS);
  });

  it('estimativa de bytes codificados cresce com a área e é menor em JPEG', () => {
    expect(estimateTileBytes(2000, 1870, 'png')).toBeGreaterThan(estimateTileBytes(2000, 1870, 'jpeg'));
    expect(estimateTileBytes(1000, 1000, 'png')).toBe(Math.ceil((1_000_000 * 0.35 * 4) / 3));
  });
});

describe('planTiles', () => {
  it('Ringgold com teto 6: 2 linhas × 3 colunas a ~164 dpi, todos dentro dos limites da API', () => {
    const grid = planTiles(RINGGOLD, DEFAULT_TILE_OPTIONS.dpi, DEFAULT_TILE_OPTIONS);
    expect([grid.rows, grid.cols]).toEqual([2, 3]);
    expect(grid.tiles).toHaveLength(6);
    expect(grid.dpi).toBeGreaterThanOrEqual(160);
    expect(grid.dpi).toBeLessThanOrEqual(168);
    withinApiLimits(grid);
    // Cada recorte usa quase todo o orçamento de tokens (não desperdiça resolução).
    for (const t of grid.tiles) expect(tileTokens(t.width, t.height)).toBeGreaterThan(4400);
  });

  it('recortes vizinhos se sobrepõem em ~8 % da célula e a união cobre a página', () => {
    const grid = planTiles(RINGGOLD, 200, DEFAULT_TILE_OPTIONS);
    const [a, b, c] = grid.tiles;
    if (!a || !b || !c) throw new Error('esperados 3 recortes na primeira linha');
    expect([a.row, a.col, b.col, c.col]).toEqual([1, 1, 2, 3]);
    const cellW = RINGGOLD.width / 3;
    const shared = a.x1 - b.x0;
    expect(shared).toBeGreaterThanOrEqual(Math.floor(0.08 * cellW) - 1);
    expect(shared).toBeLessThanOrEqual(Math.ceil(0.08 * cellW) + 1);
    expect(a.x0).toBe(0);
    expect(c.x1).toBe(RINGGOLD.width);
    expect(Math.min(...grid.tiles.map((t) => t.y0))).toBe(0);
    expect(Math.max(...grid.tiles.map((t) => t.y1))).toBe(RINGGOLD.height);
    // Linha 2 começa antes de a linha 1 acabar.
    const lower = grid.tiles.find((t) => t.row === 2 && t.col === 1);
    expect(lower && lower.y0 < a.y1).toBe(true);
  });

  it('com teto maior, mais recortes: para em 90 % do alvo (9 recortes a ~188 dpi) em vez de gastar 12', () => {
    const grid = planTiles(RINGGOLD, 200, { ...DEFAULT_TILE_OPTIONS, maxPerPage: 12 });
    expect(grid.dpi).toBeGreaterThanOrEqual(180);
    expect(grid.dpi).toBeLessThanOrEqual(200);
    expect(grid.tiles.length).toBeGreaterThan(6);
    withinApiLimits(grid);
  });

  it('Letter: um recorte só, com a escala refinada para caber no teto de tokens (~197 dpi)', () => {
    const grid = planTiles(LETTER, 200, DEFAULT_TILE_OPTIONS);
    expect(grid.tiles).toHaveLength(1);
    const [t] = grid.tiles;
    expect(t).toMatchObject({ row: 1, col: 1, x0: 0, y0: 0, x1: 612, y1: 792 });
    expect(grid.dpi).toBeGreaterThanOrEqual(190);
    expect(grid.dpi).toBeLessThan(200);
    withinApiLimits(grid);
  });

  it('alvo baixo (planta ampliada) usa menos recortes', () => {
    const grid = planTiles(RINGGOLD, DEFAULT_TILE_OPTIONS.enlargedDpi, DEFAULT_TILE_OPTIONS);
    expect(grid.tiles.length).toBeLessThan(6);
    expect(grid.dpi).toBeGreaterThanOrEqual(117); // 90 % de 130
    withinApiLimits(grid);
  });

  it('valida a entrada e é determinístico', () => {
    expect(() => planTiles({ width: 0, height: 10 }, 200, DEFAULT_TILE_OPTIONS)).toThrow(RangeError);
    expect(() => planTiles(LETTER, 0, DEFAULT_TILE_OPTIONS)).toThrow(RangeError);
    expect(JSON.stringify(planTiles(RINGGOLD, 200, DEFAULT_TILE_OPTIONS))).toBe(JSON.stringify(planTiles(RINGGOLD, 200, DEFAULT_TILE_OPTIONS)));
  });
});

describe('allocateTiles', () => {
  const plan = (key: string) => ({ key, category: 'plan' as const, ...RINGGOLD });
  const enlarged = (key: string) => ({ key, category: 'enlarged' as const, ...RINGGOLD });

  it('plantas primeiro com o teto por página; ampliadas dividem o resto', () => {
    const { grids, skipped } = allocateTiles([plan('0:3'), enlarged('1:1'), enlarged('1:2'), enlarged('1:3'), enlarged('1:4')], DEFAULT_TILE_OPTIONS);
    expect(grids.get('0:3')?.tiles).toHaveLength(6);
    for (const k of ['1:1', '1:2', '1:3', '1:4']) expect(grids.get(k)?.tiles.length).toBe(2);
    expect(skipped).toEqual([]);
    const total = [...grids.values()].reduce((n, g) => n + g.tiles.length, 0);
    expect(total).toBeLessThanOrEqual(DEFAULT_TILE_OPTIONS.maxTotal);
  });

  it('imagens do usuário comem o orçamento: com 18 sobram 2; com 20 não há recorte', () => {
    const two = allocateTiles([plan('0:3')], DEFAULT_TILE_OPTIONS, 18);
    expect(two.grids.get('0:3')?.tiles).toHaveLength(2);
    const none = allocateTiles([plan('0:3'), enlarged('0:4')], DEFAULT_TILE_OPTIONS, MAX_IMAGES_PER_REQUEST);
    expect(none.grids.size).toBe(0);
    expect(none.skipped).toEqual(['0:3', '0:4']);
  });

  it('páginas que não cabem no orçamento vão em skipped, sem exceder 20 imagens', () => {
    const many = [plan('a'), plan('b'), plan('c'), enlarged('d'), enlarged('e')];
    const { grids, skipped } = allocateTiles(many, DEFAULT_TILE_OPTIONS, 5);
    const total = [...grids.values()].reduce((n, g) => n + g.tiles.length, 0);
    expect(total + 5).toBeLessThanOrEqual(MAX_IMAGES_PER_REQUEST);
    expect(grids.size + skipped.length).toBe(many.length);
  });
});

describe('tileCaption', () => {
  it('formato exato: folha, posição na grade, região em pt e tamanho em px', () => {
    const grid = planTiles(RINGGOLD, 200, DEFAULT_TILE_OPTIONS);
    const tile = grid.tiles[1];
    if (!tile) throw new Error('esperado recorte');
    const caption = tileCaption({ name: 'planta.pdf', page: 3, sheet: 'A-100', title: 'Basement and 1st Floor Plans', grid, tile });
    expect(caption).toBe(
      `## recorte planta.pdf · A-100 Basement and 1st Floor Plans · linha 1/2, coluna 2/3 · ` +
        `região x ${tile.x0}–${tile.x1} pt, y ${tile.y0}–${tile.y1} pt da página 3 ` +
        `(mesmas coordenadas do texto posicionado; y cresce para baixo) · ${tile.width}×${tile.height} px, ${grid.dpi} dpi`,
    );
    expect(caption).not.toContain('\n');
  });

  it('sem folha reconhecida usa o número da página', () => {
    const grid = planTiles(LETTER, 200, DEFAULT_TILE_OPTIONS);
    const caption = tileCaption({ name: 'x.pdf', page: 1, grid, tile: grid.tiles[0]! });
    expect(caption.startsWith('## recorte x.pdf · p.1 · linha 1/1, coluna 1/1 ·')).toBe(true);
  });
});

describe('allocateTiles — reserva para as plantas ampliadas (Horace)', () => {
  const page = (key: string, category: 'plan' | 'enlarged') => ({ key, category, width: 2448, height: 1584 });

  it('3 plantas + 4 ampliadas em 16: ampliadas com 2 cada; a 1ª planta leva 6, a 2ª o resto, a 3ª fica sem', () => {
    const { grids, skipped } = allocateTiles(
      [page('A-101', 'plan'), page('A-106', 'plan'), page('A-107', 'plan'), page('A-401', 'enlarged'), page('A-402', 'enlarged'), page('A-403', 'enlarged'), page('A-404', 'enlarged')],
      DEFAULT_TILE_OPTIONS,
    );
    expect(skipped).toEqual(['A-107']);
    for (const k of ['A-401', 'A-402', 'A-403', 'A-404']) expect(grids.get(k)?.tiles.length).toBe(2);
    expect(grids.get('A-101')?.tiles).toHaveLength(6);
    expect(grids.get('A-106')?.tiles).toHaveLength(2);
    const total = [...grids.values()].reduce((n, g) => n + g.tiles.length, 0);
    expect(total).toBeLessThanOrEqual(DEFAULT_TILE_OPTIONS.maxTotal);
  });

  it('sem ampliadas, uma planta continua com os 6 recortes', () => {
    const { grids } = allocateTiles([page('A-100', 'plan')], DEFAULT_TILE_OPTIONS);
    expect(grids.get('A-100')?.tiles).toHaveLength(6);
  });
});
