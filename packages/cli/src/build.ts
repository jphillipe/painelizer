/**
 * `panelizer build`, sem sistema de arquivos: recebe o `Project` e devolve os
 * arquivos de saída como texto em memória. `main.ts` grava no disco.
 *
 * Saídas:
 * - `cutlist.csv` — lista de corte de todos os painéis (uma seção por painel);
 * - `bom.csv` — lista de material consolidada;
 * - `panels.csv` — um painel por linha, com parede, pavimento, posição, dimensões, peças, peso e avisos (S15/S16);
 * - `plan.svg` — planta de painéis (só na casa em planta, S16);
 * - `panels/<id>.svg` — elevação de cada painel.
 *
 * Cada parede (solta ou em planta) vira os painéis de `splitWall` (S15), com ids `{level}-{wallId}-P{n}` (S16):
 * `1-W01-P1` quando cabe em `config.panel.maxLength`; `1-W01-P1`, `1-W01-P2`… quando não.
 *
 * Erros do core (header fora da tabela, parede sem como dividir…) são recolhidos por parede e devolvidos
 * juntos; um projeto com erro não gera nenhum arquivo — meia saída na fábrica é pior que nenhuma.
 */

import { frameWalls, housePlanSvg, panelizeFrame, panelSvg, splitWall, type Panel, type WallFrame, type Warning } from 'core';
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
}

export class BuildError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'BuildError';
    this.problems = problems;
  }
}

export function buildProject(project: Project): BuildResult {
  const panels: Panel[] = [];
  const problems: string[] = [];

  /** Erros de header já vêm com "parede <id>, abertura <id>: …"; os demais ganham o prefixo. */
  const problem = (wallId: string, e: unknown): void => {
    const message = (e as Error).message;
    const prefix = `parede ${wallId}`;
    problems.push(message.startsWith(prefix) ? message : `${prefix}: ${message}`);
  };

  if (project.house !== undefined) {
    // Casa em planta (S13): a planta inteira é enquadrada de uma vez (cantos e T dependem de todas as
    // paredes; um erro aí é um problema só), depois cada parede vira painel separadamente.
    let frames: WallFrame[] = [];
    try {
      frames = frameWalls(project.house);
    } catch (e) {
      problems.push(`planta: ${(e as Error).message}`);
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

  const files: OutputFile[] = [];
  const usedNames = new Map<string, string>();
  for (const panel of panels) {
    const name = svgFileName(panel.id);
    const clash = usedNames.get(name);
    if (clash !== undefined) {
      problems.push(`painéis "${clash}" e "${panel.id}" gerariam o mesmo arquivo panels/${name}`);
      continue;
    }
    usedNames.set(name, panel.id);
    files.push({
      path: `panels/${name}`,
      content: panelSvg(panel, { studSpacing: project.config.studSpacing }),
    });
  }

  if (problems.length === 0) {
    try {
      files.unshift(
        { path: 'cutlist.csv', content: cutListCsv(panels) },
        {
          path: 'bom.csv',
          content: bomCsv(projectBom(panels, project.config.studLength, project.config.stockLengths ?? project.stockLengths)),
        },
        { path: 'panels.csv', content: panelsCsv(panels) },
        ...(project.house === undefined
          ? []
          : [{ path: 'plan.svg', content: housePlanSvg(project.house, panels, { title: project.name }) }]),
      );
    } catch (e) {
      problems.push(`lista de material: ${(e as Error).message}`);
    }
  }

  if (problems.length > 0) throw new BuildError(problems);

  const warnings = panels.flatMap((p) => p.warnings.map((warning) => ({ panelId: p.id, warning })));
  return { panels, files, warnings };
}

/** `W01-P1` → `W01-P1.svg`; qualquer caractere fora de [A-Za-z0-9._-] vira `_`. */
export function svgFileName(panelId: string): string {
  const safe = panelId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return `${safe || 'panel'}.svg`;
}
