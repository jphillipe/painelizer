/**
 * `panelizer build`, sem sistema de arquivos: recebe o `Project` e devolve os
 * arquivos de saída como texto em memória. `main.ts` grava no disco.
 *
 * Saídas:
 * - `cutlist.csv` — lista de corte de todos os painéis (uma seção por painel);
 * - `bom.csv` — lista de material consolidada;
 * - `panels.csv` — um painel por linha, com parede, pavimento, posição, dimensões, peças, peso e avisos (S15/S16);
 * - `plan.svg` — planta de painéis (só na casa em planta, S16);
 * - `panels/<id>.svg` — folha de fabricação de cada painel (S17): cabeçalho com `name`, `date` e `revision` do
 *   projeto, elevação cotada, lista de peças, peso, cortes na obra e avisos. Abre e imprime no navegador.
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
  cutList,
  EngineError,
  frameWalls,
  housePlanSvg,
  noticeOf,
  panelizeFrame,
  panelSvg,
  splitWall,
  type BomLine,
  type CutLine,
  type EngineNotice,
  type Panel,
  type WallFrame,
  type Warning,
} from 'core';
import { bomCsv, cutListCsv, panelsCsv, projectBom } from './csv';
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
  /** Lista de corte por painel, na ordem dos painéis (a mesma de `cutlist.csv`). */
  cutLists: { panelId: string; lines: CutLine[] }[];
}

/**
 * Problema que impede o build. `stage`: onde aconteceu — `plan` (a planta inteira: cantos, T, cruzamentos), `wall`
 * (uma parede virando painéis), `bom` (lista de material) ou `files` (nomes de arquivo). Código `ENGINE_INTERNAL`
 * = erro do motor sem código (guarda interna); a frase original fica em `message`.
 */
export interface BuildProblem extends EngineNotice {
  stage: 'plan' | 'wall' | 'bom' | 'files';
}

const STAGE_PREFIX: Record<BuildProblem['stage'], string> = { plan: 'planta: ', wall: '', bom: 'lista de material: ', files: '' };

/** A linha do CLI: prefixo da etapa + a frase em português. */
export function problemText(p: BuildProblem): string {
  return `${STAGE_PREFIX[p.stage]}${p.message}`;
}

/** Erro do core → problema; o que não é `RangeError` (bug) sobe. */
export function problemOf(e: unknown, stage: BuildProblem['stage'], wallId?: string): BuildProblem {
  if (e instanceof EngineError) return { ...noticeOf(wallId === undefined ? e : e.at({ wallId })), stage };
  if (e instanceof RangeError) {
    const prefix = wallId === undefined ? '' : `parede ${wallId}`;
    const message = prefix === '' || e.message.startsWith(prefix) ? e.message : `${prefix}: ${e.message}`;
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
export function panelizeProject(project: Project): { panels: Panel[]; problems: BuildProblem[]; bom: BomLine[] } {
  const { panels, problems } = panelize(project);
  const usedNames = new Map<string, string>();
  for (const panel of panels) {
    const name = svgFileName(panel.id);
    const clash = usedNames.get(name);
    if (clash !== undefined) {
      problems.push({
        code: 'PANEL_FILE_CLASH',
        message: `painéis "${clash}" e "${panel.id}" gerariam o mesmo arquivo panels/${name}`,
        wallId: panel.wallId,
        params: { first: clash, second: panel.id, file: `panels/${name}` },
        stage: 'files',
      });
    }
    usedNames.set(name, panel.id);
  }
  let bom: BomLine[] = [];
  if (problems.length === 0) {
    try {
      bom = projectBom(panels, project.config.studLength, project.config.stockLengths);
    } catch (e) {
      problems.push(problemOf(e, 'bom'));
    }
  }
  return { panels, problems, bom };
}

function panelize(project: Project): { panels: Panel[]; problems: BuildProblem[] } {
  const panels: Panel[] = [];
  const problems: BuildProblem[] = [];

  /** Erro de uma parede: ganha a parede como contexto (`parede W01, abertura J1: …`). */
  const problem = (wallId: string, e: unknown): void => {
    problems.push(problemOf(e, 'wall', wallId));
  };

  if (project.house !== undefined) {
    // Casa em planta (S13): a planta inteira é enquadrada de uma vez (cantos e T dependem de todas as
    // paredes; um erro aí é um problema só), depois cada parede vira painel separadamente.
    let frames: WallFrame[] = [];
    try {
      frames = frameWalls(project.house);
    } catch (e) {
      problems.push(problemOf(e, 'plan'));
    }
    for (const frame of frames) {
      try {
        panels.push(...panelizeFrame(frame, project.config));
      } catch (e) {
        problem(frame.wallId, e);
      }
    }
  } else {
    for (const wall of project.walls) {
      try {
        panels.push(...splitWall(wall, project.config));
      } catch (e) {
        problem(wall.id, e);
      }
    }
  }
  return { panels, problems };
}

export function buildProject(project: Project): BuildResult {
  const { panels, problems, bom } = panelizeProject(project);
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
      }),
    });
  }

  files.unshift(
    { path: 'cutlist.csv', content: cutListCsv(panels) },
    { path: 'bom.csv', content: bomCsv(bom) },
    { path: 'panels.csv', content: panelsCsv(panels) },
    ...(project.house === undefined ? [] : [{ path: 'plan.svg', content: housePlanSvg(project.house, panels, { title: project.name }) }]),
  );

  const warnings = panels.flatMap((p) => p.warnings.map((warning) => ({ panelId: p.id, warning })));
  const cutLists = panels.map((p) => ({ panelId: p.id, lines: cutList(p) }));
  return { panels, files, warnings, bom, cutLists };
}

/** `W01-P1` → `W01-P1.svg`; qualquer caractere fora de [A-Za-z0-9._-] vira `_`. */
export function svgFileName(panelId: string): string {
  const safe = panelId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return `${safe || 'panel'}.svg`;
}
