/**
 * `panelizer build`, sem sistema de arquivos: recebe o `Project` e devolve os
 * arquivos de saída como texto em memória. `main.ts` grava no disco.
 *
 * Saídas:
 * - `cutlist.csv` — lista de corte de todos os painéis (uma seção por painel);
 * - `bom.csv` — lista de material consolidada (com as chapas de sheathing no fim, S38);
 * - `cost.csv` — orçamento: BOM × `config.prices` (S31; só quando o projeto tem preços);
 * - `panels.csv` — um painel por linha, com parede, pavimento, posição, dimensões, peças, peso e avisos (S15/S16);
 * - `plan.svg` — planta de painéis (só na casa em planta, S16);
 * - `panels/<id>.svg` — folha de fabricação de cada painel (S17): cabeçalho com `name`, `date` e `revision` do
 *   projeto, elevação cotada, lista de peças, peso, cortes na obra e avisos. Abre e imprime no navegador.
 * - Folhas e planta sempre em inglês (P51 resolvida).
 *
 * Cada parede (solta ou em planta) vira os painéis de `splitWall` (S15), com ids `{level}-{wallId}-P{n}` (S16):
 * `1-W01-P1` quando cabe em `config.panel.maxLength`; `1-W01-P1`, `1-W01-P2`… quando não.
 *
 * Erros do core (header fora da tabela, parede sem como dividir…) são recolhidos por parede e devolvidos
 * juntos; um projeto com erro não gera nenhum arquivo — meia saída na fábrica é pior que nenhuma.
 *
 * S26: cada problema sai com código, parede/abertura e parâmetros (`BuildProblem`); quem mostra em outro idioma
 * não lê o português. `problemText` é a linha do CLI (com o prefixo da etapa, como antes).
 */

import {
  costOf,
  cutList,
  EngineError,
  frameWalls,
  housePlanSvg,
  noticeOf,
  panelizeFrameWithCandidates,
  panelSvg,
  sheathingBom,
  splitWallWithCandidates,
  wallBreakCandidates,
  type BomLine,
  type Cost,
  type CutLine,
  type EngineNotice,
  type HouseWall,
  type SheathingBomLine,
  type Panel,
  type Wall,
  type WallFrame,
  type Warning,
} from 'core';
import { bomCsv, costCsv, cutListCsv, panelsCsv, projectBom } from './csv';
import type { Project } from './project';

export interface OutputFile {
  /** Caminho relativo ao diretório de saída, com `/`. */
  path: string;
  content: string;
}

export interface BuildResult {
  panels: Panel[];
  files: OutputFile[];
  /** Avisos por painel (`panel.warnings`), com o id do painel. */
  warnings: { panelId: string; warning: Warning }[];
  /** Lista de material consolidada (a mesma de `bom.csv`), para quem mostra tabela em vez de CSV (M3). */
  bom: BomLine[];
  /** Chapas de sheathing (S38; as linhas do fim de `bom.csv`); vazia sem chapa. */
  sheathing: SheathingBomLine[];
  /** Lista de corte por painel, na ordem dos painéis (a mesma de `cutlist.csv`). */
  cutLists: { panelId: string; lines: CutLine[] }[];
  /** Orçamento (a mesma conta de `cost.csv`), só quando o projeto tem `config.prices` (S31). */
  cost?: Cost;
}

/**
 * Problema que impede o build. `stage`: onde aconteceu — `plan` (a planta inteira: cantos, T, cruzamentos), `wall`
 * (uma parede virando painéis), `bom` (lista de material) ou `files` (nomes de arquivo). Código `ENGINE_INTERNAL`
 * = erro do motor sem código (guarda interna); a frase original fica em `message`.
 */
export interface BuildProblem extends EngineNotice {
  stage: 'plan' | 'wall' | 'bom' | 'files';
}

const STAGE_PREFIX: Record<BuildProblem['stage'], string> = { plan: 'plan: ', wall: '', bom: 'bill of materials: ', files: '' };

/** A linha do CLI: prefixo da etapa + a frase (em inglês). */
export function problemText(p: BuildProblem): string {
  return `${STAGE_PREFIX[p.stage]}${p.message}`;
}

/** Erro do core → problema; o que não é `RangeError` (bug) sobe. */
export function problemOf(e: unknown, stage: BuildProblem['stage'], wallId?: string): BuildProblem {
  if (e instanceof EngineError) return { ...noticeOf(wallId === undefined ? e : e.at({ wallId })), stage };
  if (e instanceof RangeError) {
    const prefix = wallId === undefined ? '' : `Wall ${wallId}`;
    const message = prefix === '' || e.message.toLowerCase().startsWith(prefix.toLowerCase()) ? e.message : `${prefix}: ${e.message}`;
    return { code: 'ENGINE_INTERNAL', message, ...(wallId === undefined ? {} : { wallId }), stage };
  }
  throw e;
}

export class BuildError extends Error {
  readonly problems: BuildProblem[];
  constructor(problems: BuildProblem[]) {
    super(problems.map(problemText).join('\n'));
    this.name = 'BuildError';
    this.problems = problems;
  }
}

/**
 * Só a painelização (M8): os painéis do projeto e os problemas do motor, sem folhas SVG nem CSV. É o que a
 * checagem com debounce do editor paga a cada pausa; `buildProject` continua daqui para gerar os arquivos.
 * Inclui o que pode derrubar o `build` sem desenhar nada: nome de arquivo repetido e lista de material inválida.
 */
export function panelizeProject(project: Project): {
  panels: Panel[];
  problems: BuildProblem[];
  bom: BomLine[];
  sheathing: SheathingBomLine[];
  cost?: Cost;
  walls: WallBreaks[];
} {
  const { panels, problems, walls } = panelize(project);
  const usedNames = new Map<string, string>();
  for (const panel of panels) {
    const name = svgFileName(panel.id);
    const clash = usedNames.get(name);
    if (clash !== undefined) {
      problems.push({
        code: 'PANEL_FILE_CLASH',
        message: `panels "${clash}" and "${panel.id}" would produce the same file panels/${name}`,
        wallId: panel.wallId,
        params: { first: clash, second: panel.id, file: `panels/${name}` },
        stage: 'files',
      });
    }
    usedNames.set(name, panel.id);
  }
  let bom: BomLine[] = [];
  let sheathing: SheathingBomLine[] = [];
  let cost: Cost | undefined;
  if (problems.length === 0) {
    try {
      bom = projectBom(panels, project.config.studLength, project.config.stockLengths);
      sheathing = sheathingBom(panels);
      if (project.config.prices !== undefined) cost = costOf(bom, project.config.prices);
    } catch (e) {
      problems.push(problemOf(e, 'bom'));
    }
  }
  return { panels, problems, bom, sheathing, ...(cost === undefined ? {} : { cost }), walls };
}

function panelize(project: Project): { panels: Panel[]; problems: BuildProblem[]; walls: WallBreaks[] } {
  const panels: Panel[] = [];
  const problems: BuildProblem[] = [];
  const walls: WallBreaks[] = [];

  /** Erro de uma parede: ganha a parede como contexto (`parede W01, abertura J1: …`). */
  const problem = (wallId: string, e: unknown): void => {
    problems.push(problemOf(e, 'wall', wallId));
  };
  /**
   * Quebras e candidatos da parede (S29), em x do arquivo (`s0` = início da plate a partir do `start`). Os
   * candidatos vêm da própria divisão; só a parede que não dividiu (erro) monta a parede inteira de novo.
   */
  const record = (wallId: string, manual: boolean, s0: number, own: readonly Panel[] | undefined, candidates: readonly number[]): void => {
    const breaks = own?.slice(1).map((p) => tidy(p.wallOffset + s0));
    walls.push({ wallId, ...(breaks === undefined ? {} : { breaks }), candidates: candidates.map((x) => tidy(x + s0)), manual });
  };
  const candidatesAfterError = (wall: Wall): number[] => {
    try {
      return wallBreakCandidates(wall, project.config);
    } catch (e) {
      if (e instanceof RangeError) return [];
      throw e;
    }
  };

  const house = project.house;
  if (house !== undefined) {
    // Casa em planta (S13): a planta inteira é enquadrada de uma vez (cantos e T dependem de todas as
    // paredes; um erro aí é um problema só), depois cada parede vira painel separadamente.
    let frames: WallFrame[] = [];
    try {
      frames = frameWalls(house);
    } catch (e) {
      problems.push(problemOf(e, 'plan'));
    }
    for (const w of house.walls) {
      const manual = w.panelBreaks !== undefined;
      const frame = frames.find((x) => x.wallId === w.id);
      if (frame === undefined) {
        record(w.id, manual, 0, undefined, []);
        continue;
      }
      const s0 = plateOffset(w, frame);
      try {
        const r = panelizeFrameWithCandidates(frame, project.config);
        panels.push(...r.panels);
        record(w.id, manual, s0, r.panels, r.candidates);
      } catch (e) {
        problem(frame.wallId, e);
        record(w.id, manual, s0, undefined, candidatesAfterError(frame.wall));
      }
    }
  } else {
    for (const wall of project.walls) {
      const manual = wall.panelBreaks !== undefined;
      try {
        const r = splitWallWithCandidates(wall, project.config);
        panels.push(...r.panels);
        record(wall.id, manual, 0, r.panels, r.candidates);
      } catch (e) {
        problem(wall.id, e);
        record(wall.id, manual, 0, undefined, candidatesAfterError(wall));
      }
    }
  }
  return { panels, problems, walls };
}

/**
 * Quebras de painel de uma parede para o editor (S29), em x do **arquivo**: parede solta = x da parede; planta =
 * medido do `start` ao longo do eixo (o mesmo de `panelBreaks`, `openings[].offset`).
 */
export interface WallBreaks {
  wallId: string;
  /** Quebras em uso (forçadas ou automáticas). Ausente quando a parede não virou painéis (erro). */
  breaks?: number[];
  /** Onde a parede pode ser quebrada (`breakCandidates`); vazio quando a parede nem enquadra. */
  candidates: number[];
  /** A parede tem `panelBreaks` (quebras do revisor). */
  manual: boolean;
}

/** Distância do `start` à ponta da plate, ao longo do eixo (negativa quando a plate começa antes do ponto). */
function plateOffset(w: HouseWall, frame: WallFrame): number {
  const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
  return len === 0 ? 0 : ((frame.plateStart.x - w.start.x) * (w.end.x - w.start.x) + (frame.plateStart.y - w.start.y) * (w.end.y - w.start.y)) / len;
}

/** Sem resto de ponto flutuante da conversão (1e-6"). */
function tidy(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export function buildProject(project: Project): BuildResult {
  const { panels, problems, bom, sheathing, cost } = panelizeProject(project);
  if (problems.length > 0) throw new BuildError(problems);

  const files: OutputFile[] = [];
  for (const panel of panels) {
    const name = svgFileName(panel.id);
    files.push({
      path: `panels/${name}`,
      content: panelSvg(panel, {
        studSpacing: project.config.studSpacing,
        project: project.name,
        ...(project.date === undefined ? {} : { date: project.date }),
        ...(project.revision === undefined ? {} : { revision: project.revision }),
        // Bloco "Wall content" (S39): descrição do tipo de parede e pregação das ligações (P48).
        ...(project.config.wallTypes === undefined ? {} : { wallTypes: project.config.wallTypes }),
        ...(project.config.nailing === undefined ? {} : { nailing: project.config.nailing }),
      }),
    });
  }

  files.unshift(
    { path: 'cutlist.csv', content: cutListCsv(panels) },
    { path: 'bom.csv', content: bomCsv(bom, sheathing) },
    ...(cost === undefined ? [] : [{ path: 'cost.csv', content: costCsv(cost) }]),
    { path: 'panels.csv', content: panelsCsv(panels) },
    ...(project.house === undefined ? [] : [{ path: 'plan.svg', content: planSvg(project.house, project, panels) }]),
  );

  const warnings = panels.flatMap((p) => p.warnings.map((warning) => ({ panelId: p.id, warning })));
  const cutLists = panels.map((p) => ({ panelId: p.id, lines: cutList(p) }));
  return { panels, files, warnings, bom, sheathing, cutLists, ...(cost === undefined ? {} : { cost }) };
}

/** Planta de painéis do projeto em planta (S16), com a legenda dos tipos de parede (S39). */
function planSvg(house: NonNullable<Project['house']>, project: Project, panels: readonly Panel[]): string {
  return housePlanSvg(house, panels, {
    title: project.name,
    ...(project.config.wallTypes === undefined ? {} : { wallTypes: project.config.wallTypes }),
  });
}

/** `W01-P1` → `W01-P1.svg`; qualquer caractere fora de [A-Za-z0-9._-] vira `_`. */
export function svgFileName(panelId: string): string {
  const safe = panelId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return `${safe || 'panel'}.svg`;
}
