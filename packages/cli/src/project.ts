/**
 * Leitura e validação do JSON de projeto que o CLI recebe.
 *
 * Formato:
 * ```json
 * { "name": "Casa X", "config": { ...Config }, "walls": [ ...Wall ], "stockLengths": [96, 120, ...] }
 * ```
 * Medidas (`length`, `height`, `offset`, `roughWidth`, `roughHeight`, `studLength`, `headerHeight`)
 * aceitam número em polegadas decimais ou string em pés-pol-fração (`12'-0"`, `92 5/8"`), convertida
 * por `parseFeetInches` do core — o JSON pode vir de humano ou de IA, e a fábrica pensa em pés-pol.
 * `config.studLength` é a lista de pré-cortes (`[92.625, 104.625]`); uma medida só vira lista de um.
 * `headerHeight` vale no `config` e em cada abertura; a da abertura sobrescreve (P2).
 *
 * Header de abertura (S9.2): `config.building = { groundSnowLoad (psf), buildingWidth (medida) }` são os
 * dados da casa para a tabela IRC; cada parede portante declara `floorsSupported` (pavimentos acima) e,
 * se quiser, `floorSpan` ('center' | 'clear') e `buildingWidth` próprio (casa em L). O header do
 * structural drawings entra na abertura: `header: { section, plies, jackStuds? }`, e manda sobre a tabela.
 * Parede não portante sem `header` leva a peça deitada da R602.7.4 (S9.3); `defaultHeader*` não existe mais.
 *
 * Dados do estrutural (S12): `config.building.windSpeed` (mph, Vult) e `exposure` ('B' | 'C' | 'D') para os
 * kings pela Tabela R602.7.5; `config.doubleSillOver` (medida) para a sill dupla; na parede,
 * `extraStuds: [{ x (medida), count?, label? }]` para studs de altura inteira pedidos pelo projeto.
 *
 * Catálogo do projeto (S12.5): `config.openingTypes = { W41: { kind, width, height, frame?, sillHeight?,
 * roughWidth?, roughHeight?, description? } }` (window/door schedule) e `config.headerSchedule = { HDR2:
 * { section, plies, jackStuds, kingStuds, description? } }` (wood header schedule). A abertura pode então
 * vir como `{ id, tag, center, headerMark }`; os campos diretos continuam valendo e sobrescrevem o
 * catálogo. `header.section` aceita `"LVL 1.75x9.25"` ou `{ material, width, depth }`;
 * `config.building.species` ('SPF' | 'Hem-Fir' | 'DF' | 'SP') guarda a espécie das notas estruturais.
 *
 * Casa em planta (S13): cada parede vem com `start: { x, y }` e `end: { x, y }` (eixo da parede; cada
 * coordenada é medida com sinal, número ou pés-pol) em vez de `length`, mais `ends?: { start?, end? }`
 * ('through' | 'butt') e `level?`. `offset`, `center` e `extraStuds[].x` são medidos do `start`; comprimento
 * de plate, cantos, T e origem de layout saem do core (`panelizeHouse`). `length` ou `layoutOrigin` numa
 * parede em planta é erro, e misturar paredes em planta com paredes soltas no mesmo arquivo também.
 *
 * Montagem de canto e T (S14): `config.corner` ('california' | 'three-stud', default california) e
 * `config.tee` ('ladder' | 'backer', default ladder) — P5.
 *
 * Numeração e planta (S16): `level` (pavimento, inteiro ≥ 1, default 1) vale em qualquer parede e entra no id
 * dos painéis (`{level}-{wallId}-P{n}`); `northAngle` na raiz (graus, do +y da planta no sentido horário) põe a
 * seta do norte na planta de painéis e só vale em projeto em planta.
 *
 * Folha de fabricação (S17): `date` e `revision` na raiz (texto livre) vão para o cabeçalho de cada folha, junto
 * com `name`. A folha nunca lê o relógio — sem `date` sai sem data.
 *
 * Idioma: folhas e planta sempre em inglês (P51 resolvida). O `locale` na raiz que a S34 gravava ainda é aceito
 * pelo schema e ignorado.
 *
 * Tipos de parede (S35): `config.wallTypes = { "WT-1S": { section?, exterior?, bearing?, description? } }` e
 * `wallType` na parede. A parede com tipo pode omitir `section`, `exterior` e `bearing` — o tipo os dá; o que a
 * parede disser vale sobre o tipo (com aviso `WALL_TYPE_MISMATCH` se for diferente). Tag fora do catálogo é só
 * rótulo quando a parede traz os três campos, e erro quando falta algum. A tag sai na folha, na planta e no
 * `panels.csv`.
 *
 * Divisão em painéis (S15): `config.panel = { maxLength?, maxWeight?, module?, lap?, minLap? }` (medidas; peso
 * em lb; cada campo ausente vale o default do core: 240, sem limite, 48, 48, 24) e `config.stockLengths`
 * (medidas; o `stockLengths` na raiz do arquivo continua aceito e entra em `config.stockLengths` — os dois juntos é erro). Plate
 * mais longa que o maior estoque é emendada sobre stud pelo core; a BOM usa a mesma lista.
 *
 * A validação é estrutural (tipos, campos obrigatórios, chave desconhecida), com mensagem apontando o caminho do
 * campo, e mora no schema zod de `schema.ts` (S28.2) — o mesmo que o editor do web usa em modo tolerante. Chaves
 * com `$` (`$comment`) passam sem ser lidas. Regras de framing não são validadas aqui: isso é papel do core (S10);
 * daqui só se chamam `resolveOpenings`, que transforma a forma de catálogo das aberturas em `Opening`, e
 * `resolveWallType`, que completa a parede pelo tipo dela.
 */

import {
  EngineError,
  resolveOpenings,
  resolveWallType,
  type Config,
  type House,
  type OpeningSpec,
  type Wall,
  type WallTypeField,
  type WallTypeInput,
} from 'core';
import { projectFileSchema, readMeasure, type FieldIssueParams } from './schema';

export interface Project {
  name: string;
  /** Data e revisão das folhas de fabricação (S17), como texto livre na raiz do arquivo. Ausentes = sem carimbo. */
  date?: string;
  revision?: string;
  /** Inclui o estoque (`config.stockLengths`), venha ele de `config` ou da raiz do arquivo. */
  config: Config;
  /** Paredes soltas (formato por comprimento). Vazio quando o projeto vem em planta (`house`). */
  walls: Wall[];
  /** Casa em planta (S13): paredes com `start`/`end`. Presente ⇔ `walls` vazio. */
  house?: House;
}

/**
 * Arquivo de projeto inválido. `path`: o campo (`project.walls[2].openings[0].center`); `detail`: o que está errado,
 * em inglês. Quando o motivo vem do core (catálogo de aberturas), `engine` é o erro com código (S26); quando vem
 * do schema, `field` traz a regra quebrada e o valor recebido (S28.2).
 */
export class ProjectError extends Error {
  readonly path: string;
  readonly detail: string;
  readonly engine: EngineError | undefined;
  readonly field: FieldIssueParams | undefined;
  /** `json`: o texto não é JSON; `value`: um campo inválido (o resto). */
  readonly kind: 'json' | 'value';
  constructor(
    path: string,
    detail: string,
    engine?: EngineError,
    kind: 'json' | 'value' = 'value',
    field?: FieldIssueParams,
  ) {
    super(`${path}: ${detail}`);
    this.name = 'ProjectError';
    this.path = path;
    this.detail = detail;
    this.engine = engine;
    this.kind = kind;
    this.field = field;
  }
}

/** Converte o texto do arquivo em `Project` validado. */
export function parseProject(text: string, source = 'project'): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ProjectError(source, `invalid JSON — ${(e as Error).message}`, undefined, 'json');
  }
  return projectFrom(raw, source);
}

/**
 * Valida pelo schema (a primeira issue vira `ProjectError`) e resolve, pelo catálogo, o tipo e as aberturas de cada
 * parede.
 */
export function projectFrom(raw: unknown, source = 'project'): Project {
  const parsed = projectFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new ProjectError(pathText(source, issue.path), issue.message, undefined, 'value', (issue as { params?: FieldIssueParams }).params);
  }
  const file = parsed.data;
  const { config } = file;
  const project: Project = { name: file.name ?? source, config, walls: [] };
  if (file.date !== undefined) project.date = file.date;
  if (file.revision !== undefined) project.revision = file.revision;
  const resolve = (openings: OpeningSpec[], wallId: string, i: number) => {
    try {
      return resolveOpenings(openings, config, wallId);
    } catch (e) {
      // Erros do catálogo (tag ou marca inexistente, RO ou posição sem como resolver) viram erro de projeto.
      throw new ProjectError(`${source}.walls[${i}].openings`, (e as Error).message, e instanceof EngineError ? e : undefined);
    }
  };
  /** Seção, posição e carga da parede: as dela, senão as do tipo (S35). O que faltar é erro de projeto, com código. */
  const typed = <W extends WallTypeInput>(w: W, i: number): W & Pick<Wall, WallTypeField> => {
    try {
      return resolveWallType(w, config);
    } catch (e) {
      throw new ProjectError(`${source}.walls[${i}]`, (e as Error).message, e instanceof EngineError ? e : undefined);
    }
  };
  if (file.format === 'loose') {
    project.walls = file.walls.map((w, i) => ({ ...typed(w, i), openings: resolve(w.openings, w.id, i) }));
  } else {
    const house: House = {
      walls: file.walls.map((w, i) => ({ ...typed(w, i), openings: resolve(w.openings, w.id, i) })),
    };
    if (file.northAngle !== undefined) house.northAngle = file.northAngle;
    project.house = house;
  }
  return project;
}

/** Medida ≥ 0 em polegadas (número decimal ou texto pés-pol-fração); `ProjectError` em `path` se não for. */
export function measure(v: unknown, path: string): number {
  const n = readMeasure(v);
  if (typeof n !== 'number') throw new ProjectError(path, n.message, undefined, 'value', n.params);
  return n;
}

/** `project` + `['walls', 2, 'openings', 0, 'center']` → `project.walls[2].openings[0].center`. */
function pathText(source: string, path: readonly PropertyKey[]): string {
  return path.reduce<string>((p, k) => (typeof k === 'number' ? `${p}[${k}]` : `${p}.${String(k)}`), source);
}
