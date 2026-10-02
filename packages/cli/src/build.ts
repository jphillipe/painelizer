/**
 * `panelizer build`, sem sistema de arquivos: recebe o `Project` e devolve os
 * arquivos de saída como texto em memória. `main.ts` grava no disco.
 *
 * Saídas:
 * - `cutlist.csv` — lista de corte de todos os painéis (uma seção por painel);
 * - `bom.csv` — lista de material consolidada;
 * - `panels/<id>.svg` — elevação de cada painel.
 *
 * Erros do core (porta ainda sem suporte, peça sem comprimento comercial…)
 * são recolhidos por parede e devolvidos juntos; um projeto com erro não gera
 * nenhum arquivo — meia saída na fábrica é pior que nenhuma.
 */

import { panelizeWall, panelSvg, type Panel, type Warning } from 'core';
import { bomCsv, cutListCsv, projectBom } from './csv';
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

  for (const wall of project.walls) {
    try {
      panels.push(panelizeWall(wall, project.config));
    } catch (e) {
      problems.push(`parede ${wall.id}: ${(e as Error).message}`);
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
          content: bomCsv(projectBom(panels, project.config.studLength, project.stockLengths)),
        },
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
