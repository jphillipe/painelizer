/**
 * Parede reta e suas ligações com as vizinhas. Convenções (docs/02-framing.md): polegadas decimais; x=0 no
 * início da parede (esquerda); y=0 na base da bottom plate.
 */

import type { SheathingSpec } from './config';
import type { Opening } from './opening';
import type { PostSection, WallSection } from './sections';

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

/**
 * Post pedido pelo projeto (S37, hipótese P45): peça maciça 4x4/4x6/6x6 de altura inteira (da bottom à top plate) no
 * lugar dos studs de layout que ela sobrepõe — canto de escada, apoio de viga LVL. A face do post que fica na
 * espessura da parede tem de ser a profundidade da parede (2x4 → 3.5", 2x6 → 5.5"); a outra fica em x. Post fora da
 * parede, em zona de abertura, sobre outra peça de altura inteira ou numa quebra de painel é erro.
 */
export interface Post {
  /** x da borda esquerda do post (na planta, medido do `start`). */
  x: number;
  section: PostSection;
  /** Rótulo do projeto ("P-01"); vai para a folha. */
  label?: string;
  /** Conector da base, texto do projeto ("HDU2 hold-down"); só nota na folha, não é peça (P45). */
  base?: string;
  /** Conector do topo / o que apoia, texto do projeto ("LUS28 — LVL 1 3/4 x 11 7/8 above"); só nota na folha. */
  top?: string;
}

/**
 * Fileira de blocking por altura pedida pelo projeto (S36, hipótese P44): blocos deitados da seção da parede entre os
 * studs, com o **centro** em `y` (medido do subfloor = base da bottom plate). `from`/`to` limitam o trecho em x da
 * parede (na planta, medidos do `start`): levam bloco todos os vãos entre peças que tocam `(from, to)`. Ausentes =
 * a parede inteira.
 */
export interface BlockingRow {
  y: number;
  from?: number;
  to?: number;
  /** Uso da fileira ("Countertop", "Grab bar"); vai para a folha. Ausente = "Blocking". */
  label?: string;
}

/** Uma fileira (`BlockingRow`) ou o id de um preset (`config.blockingPresets` ou embutido: `kitchen-base`…). */
export type BlockingEntry = BlockingRow | string;

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
  /** Posts 4x4/4x6/6x6 pedidos pelo projeto (S37, P45). */
  posts?: Post[];
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
   * Fileiras de blocking por altura (S36, P44): fileiras ou ids de preset. Ausente = as do tipo de parede
   * (`config.wallTypes[tag].blocking`), se houver; `[]` = nenhuma (a parede manda, como na S35).
   */
  blocking?: BlockingEntry[];
  /**
   * Sheathing da parede (S38, P47): `true` liga com a chapa do projeto, `false` desliga, objeto liga e ajusta (por cima
   * de `config.sheathing`). Ausente = o do tipo de parede, senão a regra de `config.sheathing.walls`.
   */
  sheathing?: boolean | SheathingSpec;
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
  /** Fileiras de blocking do tipo (S36): valem na parede que não traz `blocking`. */
  blocking?: BlockingEntry[];
  /** Sheathing do tipo (S38): vale na parede que não traz `sheathing`. */
  sheathing?: boolean | SheathingSpec;
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
      /**
       * Canto de dentro (S38): a outra parede sai para o lado de fora desta (o L se abre para fora do prédio). Só na
       * parede externa com lado de fora conhecido (`WallFrame.outside`, hipótese P24); ausente = canto de fora.
       * Decide em que face a chapa avança (`rules/sheathing.ts`).
       */
      concave?: true;
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
