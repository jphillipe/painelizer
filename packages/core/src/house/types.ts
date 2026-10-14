/**
 * Tipos da casa em planta (Fase 3, S13).
 *
 * Convenções (docs/02-framing.md, docs/04-decisoes.md 2026-10-13; hipótese P21):
 * - Coordenadas de planta em polegadas decimais, eixos x/y quaisquer (a origem é do arquiteto).
 * - Uma parede é o segmento `start` → `end` no **eixo** da parede (centro da espessura), só paralela a um
 *   dos eixos da planta. A mesma regra vale para parede externa e interna.
 * - `openings[].offset` e `extraStuds[].x` são medidos do ponto `start` ao longo do eixo; o motor converte
 *   para o x do painel (que começa na plate, não no ponto). `layoutOrigin` não entra: a planta o deriva.
 * - No canto, a parede que **atravessa** leva a plate até a face externa da outra; a que **encosta** para na
 *   face interna. Qual atravessa: `ends` declarado > a mais longa > a primeira do arquivo.
 */

import type { Point, Wall } from '../types';

/** `Point` mora em `types.ts` desde a S16 (`Panel.plan`); re-exportado aqui para os módulos da casa. */
export type { Point };

/** Papel de uma ponta num canto: `through` leva a plate até a face externa da outra; `butt` encosta nela. */
export type EndRule = 'through' | 'butt';

/** Uma das duas pontas de uma parede. */
export type WallEnd = 'start' | 'end';

/**
 * Parede como a planta a descreve. `length`, `layoutOrigin` e `joints` são derivados pelo motor da casa
 * (`frameWalls`); os demais campos de `Wall` valem como estão — inclusive `level` (pavimento, default 1),
 * que entra no id dos painéis (S16).
 */
export interface HouseWall extends Omit<Wall, 'length' | 'layoutOrigin' | 'joints'> {
  start: Point;
  end: Point;
  /** Papel declarado de cada ponta num canto. Ausente = regra da mais longa (P21). */
  ends?: { start?: EndRule; end?: EndRule };
}

export interface House {
  walls: HouseWall[];
  /**
   * Direção do norte na planta (S16), em graus, medida do +y da planta no sentido horário (0 = norte para
   * cima, 90 = norte para a direita). Ausente = a planta de painéis sai sem seta do norte.
   */
  northAngle?: number;
}
