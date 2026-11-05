/** Tipos do resultado do motor como o app os vê (sem dependência de core/cli: trafegam entre servidor e cliente). */

/**
 * Aviso ou problema do motor, do parser ou da leitura (S26): código, ids e parâmetros. A tela monta a frase em
 * inglês (`lib/messages.en.ts`); `message` é a frase original em português, que só aparece em "Details".
 */
export interface Notice {
  code: string;
  message: string;
  /** De onde veio: `engine` (motor), `parser` (arquivo de projeto), `extraction` (leitura da IA), `project` (dado do projeto inteiro). */
  source?: 'engine' | 'parser' | 'extraction' | 'project';
  wallId?: string;
  openingId?: string;
  /** Outras paredes citadas (cruzamento, sobreposição, T). */
  alsoWalls?: string[];
  panelId?: string;
  /** Campo do arquivo (`walls[2].openings[0].center`), nos erros do parser. */
  path?: string;
  /** Etapa do build em que o motor parou. */
  stage?: 'plan' | 'wall' | 'bom' | 'files';
  params?: Readonly<Record<string, unknown>>;
  /** Hipótese de `docs/05-pendencias.md` em que o aviso se apoia (`P30`). */
  hypothesis?: string;
}

export interface PanelSummary {
  id: string;
  wallId: string;
  /** Polegadas. */
  length: number;
  /** Peças a cortar (plies contam). */
  pieces: number;
  weightLb: number | undefined;
}

export interface GeneratedFile {
  /** Caminho relativo com `/`: `cutlist.csv`, `plan.svg`, `panels/1-W01-P1.svg`. */
  path: string;
  content: string;
}

/** Linha da lista de material (M3): o mesmo que `bom.csv`, tipado para a tabela da tela. */
export interface BomRow {
  section: string;
  /** Polegadas: comercial, pré-corte, ou o próprio corte (engenheirado / oversize). */
  stockLength: number;
  kind: 'commercial' | 'precut' | 'engineered' | 'oversize';
  /** Peças a comprar. */
  qty: number;
  /** Soma dos cortes atendidos (polegadas). */
  cutTotal: number;
  waste: number;
  wastePercent: number;
  /** Orçamento (S31, `config.prices`): preço por peça e custo da linha; ausentes = sem preço na tabela. */
  unitPrice?: number;
  cost?: number;
}

/** Linha de chapas de sheathing (S38): as linhas do fim de `bom.csv`, uma chapa inteira por pedaço (sem aproveitamento). */
export interface SheathingRow {
  /** Polegadas. */
  thickness: number;
  width: number;
  height: number;
  /** Chapas inteiras a comprar. */
  qty: number;
  /** Quantas são cortadas. */
  cut: number;
  /** Área instalada, pés². */
  areaSqFt: number;
  wastePercent: number;
}

/** Linha da lista de corte de um painel (`cutlist.csv`). */
export interface CutRow {
  role: string;
  section: string;
  length: number;
  qty: number;
}

export type GenerateResult =
  | {
      ok: true;
      projectName: string;
      panels: PanelSummary[];
      files: GeneratedFile[];
      warnings: Notice[];
      bom: BomRow[];
      /** Chapas de sheathing (S38): só quando algum painel leva chapa. */
      sheathing?: SheathingRow[];
      /** Orçamento (S31): só quando o projeto tem `config.prices`; o preço de cada linha vai no `bom`. */
      cost?: { total: number; unpriced: number };
      /** Por painel, na ordem dos painéis. */
      cutLists: { panelId: string; lines: CutRow[] }[];
    }
  | { ok: false; problems: Notice[] };

/**
 * Quebras de painel de uma parede (S29), em x do arquivo (parede solta: x da parede; planta: do `start`). A planta
 * do editor desenha `breaks` e oferece `candidates` para arrastar/adicionar.
 */
export interface WallBreaks {
  wallId: string;
  /** Quebras em uso; ausente quando a parede não virou painéis (erro). */
  breaks?: number[];
  candidates: number[];
  /** A parede tem `panelBreaks` (quebras do revisor). */
  manual: boolean;
}

/** Checagem do editor (S21): o que o motor diria, sem os arquivos. `walls`: quebras por parede (S29), quando o arquivo abriu. */
export type CheckResult =
  | { ok: true; projectName: string; panels: PanelSummary[]; warnings: Notice[]; walls?: WallBreaks[] }
  | { ok: false; problems: Notice[]; walls?: WallBreaks[] };

export interface Example {
  id: string;
  label: string;
  /** `project`: JSON do CLI, abre direto no editor. `reading`: resposta gravada da IA, passa pela mesma conversão da extração (com proveniência). */
  kind: 'project' | 'reading';
  /** Uma linha de fatos tirados do próprio arquivo ("27 walls · level 1"). */
  facts: string;
  text: string;
}
