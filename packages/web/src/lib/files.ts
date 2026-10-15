/**
 * Leitura dos arquivos que o motor devolve (`GeneratedFile[]`), para a tela: planta, folhas na ordem dos
 * painéis, CSVs, nomes de download. Puro; roda no cliente.
 */

import type { GeneratedFile, PanelSummary } from '@/types/panels';

export interface Sheet {
  panelId: string;
  path: string;
  svg: string;
}

/** Mesma regra de `svgFileName` do CLI: fora de [A-Za-z0-9._-] vira `_`; pontos iniciais viram `_`. */
export function sheetFileName(panelId: string): string {
  const safe = panelId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return `${safe || 'panel'}.svg`;
}

export function planOf(files: readonly GeneratedFile[]): string | undefined {
  return files.find((f) => f.path === 'plan.svg')?.content;
}

/** Folhas na ordem dos painéis; painel sem folha é pulado. */
export function sheetsOf(files: readonly GeneratedFile[], panels: readonly PanelSummary[]): Sheet[] {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const out: Sheet[] = [];
  for (const p of panels) {
    const path = `panels/${sheetFileName(p.id)}`;
    const svg = byPath.get(path);
    if (svg !== undefined) out.push({ panelId: p.id, path, svg });
  }
  return out;
}

export function csvsOf(files: readonly GeneratedFile[]): GeneratedFile[] {
  return files.filter((f) => f.path.endsWith('.csv'));
}

/** `Casa 28x40 (visão)` → `casa-28x40-visao-panels.zip`. */
export function zipName(projectName: string): string {
  const slug = projectName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'project' : slug}-panels.zip`;
}

/** Tamanho em bytes do texto em UTF-8, formatado (`1.2 KB`). */
export function formatSize(content: string): string {
  const bytes = new TextEncoder().encode(content).byteLength;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
