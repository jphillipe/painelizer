/**
 * Aberturas (janela e porta): como o projeto as descreve (`OpeningSpec`, catálogo) e como o motor as consome
 * (`Opening`). Todas as medidas em polegadas decimais; `offset` medido de x=0 da parede.
 */

import type { Section } from './sections';

export type OpeningType = 'window' | 'door';

/**
 * Id de uma tabela de header carregada (`'R602.7(1)'`, `'R602.7(2)'`; as tabelas injetadas nos testes têm
 * outros). Só `loadHeaderTables` cria um, depois de validar o JSON.
 */
export type HeaderTableId = string & { readonly __headerTable: unique symbol };

/** Header do projeto (structural drawings, `Opening.header`). */
export const PROJECT_HEADER_SOURCE = 'project';

/** Peça deitada da parede não portante (R602.7.4 do IRC). */
export const FLAT_HEADER_SOURCE = 'R602.7.4';

/**
 * De onde veio o header de uma abertura: `'project'` (structural drawings, `Opening.header`),
 * o id da tabela (`'R602.7(1)'`, `'R602.7(2)'`) ou `'R602.7.4'` (peça deitada em parede não portante).
 */
export type HeaderSource = typeof PROJECT_HEADER_SOURCE | typeof FLAT_HEADER_SOURCE | HeaderTableId;

/**
 * Header especificado no projeto (structural drawings / header schedule). Manda sobre a tabela (P10).
 * `section` pode ser engenheirada (`"LVL 1.75x9.25"`, S12.5); a espessura total `plies × espessura`
 * precisa caber na parede.
 */
export interface OpeningHeader {
  section: Section;
  plies: number;
  /** Jacks de cada lado pedidos pelo projeto. `Opening.jackStuds`, se presente, prevalece. */
  jackStuds?: number;
}

/** Tipo de batente de porta; define a folga do RO quando o projeto não a dá (S12.5). */
export type DoorFrame = 'wood' | 'hm' | 'al';

/**
 * Uma linha do window/door schedule do projeto (S12.5): o que a tag (W41, porta 114) significa.
 * `width`/`height` são o tamanho nominal do caixilho ou da folha, como na tabela do arquiteto.
 * O RO sai de `roughWidth`/`roughHeight` quando dados; senão de `width + folga` (ver `rules/catalog.ts`).
 */
export interface OpeningCatalogEntry {
  kind: OpeningType;
  width: number;
  height: number;
  /** Só porta. Ausente = `wood`. */
  frame?: DoorFrame;
  /** Só janela: altura do peitoril (base do RO) acima do subfloor, como no schedule. */
  sillHeight?: number;
  /** RO explícito do fabricante; manda sobre a folga default. */
  roughWidth?: number;
  roughHeight?: number;
  /** Texto livre do schedule (ex.: "vinyl double-hung"); vai para a UI. */
  description?: string;
}

/** Uma linha do wood header schedule do estrutural (S12.5): marca → header, jacks e kings. */
export interface HeaderScheduleEntry {
  section: Section;
  plies: number;
  jackStuds: number;
  kingStuds: number;
  description?: string;
}

/**
 * Abertura como o projeto a descreve (S12.5), antes de `resolveOpening` virar `Opening`:
 * tag do schedule, eixo do RO e marca de header, com os campos diretos de `Opening` como sobrescrita.
 */
export interface OpeningSpec {
  id: string;
  /** Tag do `Config.openingTypes` (W41, "114"). Ausente = `type`, `roughWidth` e `roughHeight` obrigatórios. */
  tag?: string;
  type?: OpeningType;
  /** x do eixo do RO (como a planta cota). Alternativa a `offset`. */
  center?: number;
  offset?: number;
  roughWidth?: number;
  roughHeight?: number;
  /** Marca do `Config.headerSchedule` (HDR2). Alternativa a `header`. */
  headerMark?: string;
  header?: OpeningHeader;
  /** Base do RO acima do subfloor (janela); deriva `headerHeight = sillHeight + roughHeight`. */
  sillHeight?: number;
  headerHeight?: number;
  kingStuds?: number;
  jackStuds?: number;
}

/**
 * Abertura bruta (rough opening) na parede.
 * `offset` é a distância do início da parede (x=0) até a borda esquerda do RO.
 * Topo do RO = base do header; base do RO = topo − `roughHeight`.
 */
export interface Opening {
  id: string;
  type: OpeningType;
  offset: number;
  roughWidth: number;
  roughHeight: number;
  /**
   * King studs de cada lado (inteiro ≥ 1). Ausente = Tabela R602.7.5 em parede externa (vento de
   * `config.building.windSpeed`; sem ele, 1 e aviso `WIND_SPEED_MISSING`), 1 em parede interna.
   * Menor que a tabela gera aviso `HEADER_KINGS_BELOW_TABLE`.
   */
  kingStuds?: number;
  /**
   * Jack studs de cada lado (inteiro ≥ 1). O header apoia em todos. Ausente = os do header
   * (`header.jackStuds` do projeto ou NJ da tabela) ou 1. Menor que o NJ da tabela gera aviso
   * `HEADER_JACKS_BELOW_TABLE`.
   */
  jackStuds?: number;
  /**
   * y da base do header desta abertura, medido da base da bottom plate (= subfloor).
   * Sobrescreve `config.headerHeight` — o projeto manda (P2).
   */
  headerHeight?: number;
  /** Header do projeto. Ausente = tabela IRC (parede portante) ou peça deitada R602.7.4 (não portante). */
  header?: OpeningHeader;
}

/** A abertura com os jacks e kings de cada lado já resolvidos (header, tabela R602.7.5, vizinhança). */
export function withStudCounts(o: Opening, counts: { jackStuds: number; kingStuds: number }): Opening {
  return { ...o, jackStuds: counts.jackStuds, kingStuds: counts.kingStuds };
}
