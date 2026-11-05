/**
 * Parede reta e suas ligações com as vizinhas. Convenções (docs/02-framing.md): polegadas decimais; x=0 no
 * início da parede (esquerda); y=0 na base da bottom plate.
 */

import type { Opening } from './opening';
import type { WallSection } from './sections';

/** Ponto em planta, polegadas (S13). Eixos x/y quaisquer — a origem é do arquiteto. */
export interface Point {
  x: number;
  y: number;
}

/** Piso suportado pela parede: apoiado no centro (center-bearing) ou vão livre (clear span). */
export type FloorSpan = 'center' | 'clear';

/**
 * Stud de altura inteira adicional pedido pelo projeto (post de hold-down, carga pontual, "studs to match
 * above"): `count` studs colados a partir de `x` para a direita (ausente = 1). Stud de layout que se
 * sobrepõe a um extra sai; extra dentro de uma zona de abertura ou fora da parede é erro.
 */
export interface ExtraStud {
  /** x da borda esquerda do primeiro stud. */
  x: number;
  count?: number;
  /** Texto livre do projeto (ex.: "HDU2 post"); vai para o `<title>` da peça no SVG. */
  label?: string;
}

export interface Wall {
  id: string;
  length: number;
  height: number;
  /** Seção nominal; a espessura real (3.5 / 5.5) vem de `sectionDepth`. */
  section: WallSection;
  exterior: boolean;
  bearing: boolean;
  openings: Opening[];
  /** Largura da edificação para esta parede, em polegadas; sobrescreve `config.building` (casa em L). */
  buildingWidth?: number;
  /** Pavimentos acima da parede que ela suporta (0 = só telhado e forro). Obrigatório para usar a tabela. */
  floorsSupported?: number;
  /** Ausente = pior caso entre center-bearing e clear span. */
  floorSpan?: FloorSpan;
  /**
   * x, nesta parede, da marca 0 do layout do prédio (S11). Ausente = 0 (parede solta). Negativo quando
   * a marca 0 fica antes da plate: `−t` da parede que atravessa, para a parede que encosta num canto;
   * `−x` do início do painel, para um painel no meio da parede. Os studs são centrados nas marcas
   * `layoutOrigin + k·studSpacing`; o primeiro stud fica sempre em 0.
   */
  layoutOrigin?: number;
  /** Studs de altura inteira adicionais pedidos pelo projeto (S12). */
  extraStuds?: ExtraStud[];
  /**
   * Quebras de painel forçadas pelo revisor (S29), em x da parede (na planta, medidas do `start` e
   * convertidas pelo motor). Ausente = escolha automática (P35). Presente = a lista **completa**, em ordem
   * crescente: o motor não acrescenta quebra; `[]` = um painel só. Cada quebra tem de ser um candidato de
   * `breakCandidates` e nenhum trecho pode passar de `config.panel.maxLength` — senão é erro com código.
   */
  panelBreaks?: number[];
  /** Pavimento da parede (1 = térreo). Ausente = 1. Entra no id dos painéis (S16): `{level}-{wallId}-P{n}`. */
  level?: number;
  /**
   * Tag do tipo de parede do projeto (`WT-1S`, `X1`; S35). Com a tag em `config.wallTypes`, o tipo dá o que a parede
   * não disser (`resolveWallType`) e o que ela disser diferente vira aviso `WALL_TYPE_MISMATCH`. Vai para a folha e
   * para a planta. Tag fora do catálogo é só rótulo.
   */
  wallType?: string;
  /**
   * Ligações desta parede com as vizinhas, em x do painel (S14). Derivadas pela planta (`frameWalls`);
   * ausente = parede solta. Definem as peças de canto e T e os laps da double top plate.
   */
  joints?: WallJoints;
}

/** O que um tipo de parede pode dar à parede (S35). */
export type WallTypeField = 'section' | 'exterior' | 'bearing';

/**
 * Linha do catálogo de tipos de parede do projeto (`config.wallTypes`, por tag; S35). Tudo opcional: a folha de
 * partition types do arquiteto dá seção e posição, mas não diz se a parede é portante.
 */
export interface WallTypeEntry {
  section?: WallSection;
  exterior?: boolean;
  bearing?: boolean;
  /** Texto do projeto ("2x6 exterior, 5/8 GWB one side"). */
  description?: string;
}

/**
 * Parede como o projeto a escreve (S35): seção, posição e carga podem faltar quando o tipo (`wallType`) as dá.
 * `resolveWallType` (`rules/wallTypes.ts`) devolve a parede completa.
 */
export type WallSpec<W extends { [K in WallTypeField]: Wall[K] } = Wall> = Omit<W, WallTypeField> &
  Partial<Pick<Wall, WallTypeField>>;

/** Como uma ponta da parede se liga à vizinha (S14). `otherThickness` = espessura real da outra parede. */
export type EndJoint =
  | {
      kind: 'corner';
      /** Esta parede atravessa o canto (plate até a face externa da outra) ou encosta nela. */
      through: boolean;
      otherThickness: number;
      wallId?: string;
    }
  | {
      /** Esta parede encosta em T no interior da outra. */
      kind: 'tee';
      otherThickness: number;
      wallId?: string;
      /**
       * Cruzamento em + (S31, hipótese P46): outra parede encosta no mesmo ponto pelo lado oposto. A double top
       * avança só `otherThickness/2` (as duas se encontram no eixo da atravessada).
       */
      cross?: boolean;
    }
  | {
      /**
       * Junta com o painel vizinho da mesma parede (S15, hipótese P23). No `end` do painel i a double top
       * avança `lap` sobre o seguinte; no `start` do painel i+1 ela recua `lap`. `cuts` são vãos (faixa de um T
       * do painel vizinho) que caem no trecho avançado, em x deste painel.
       */
      kind: 'panel';
      lap: number;
      cuts?: { x: number; width: number }[];
      panelId?: string;
    };

/** Parede que encosta em T no interior desta, em x do painel: ocupa `[x − width/2, x + width/2]`. */
export interface TeeJoint {
  /** x do eixo da parede que encosta. */
  x: number;
  /** Espessura real da parede que encosta (no +, a largura da faixa unida). */
  width: number;
  wallId?: string;
  /**
   * Cruzamento em + (S31, hipótese P46): duas paredes encostam na mesma faixa, uma de cada lado — um corte da double
   * top, um ladder (bloco deitado na espessura inteira, P22) ou um par de backers servindo os dois lados.
   */
  sides?: 2;
  /** No +, a parede do outro lado. */
  otherWallId?: string;
}

export interface WallJoints {
  start?: EndJoint;
  end?: EndJoint;
  tees?: TeeJoint[];
}
