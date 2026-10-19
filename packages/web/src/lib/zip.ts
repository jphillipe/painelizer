/**
 * Zip dos arquivos que o motor devolve, com a mesma árvore que `panelizer build --out <dir>` grava
 * (`cutlist.csv`, `bom.csv`, `panels.csv`, `plan.svg`, `panels/<id>.svg`): quem descompacta no disco fica com
 * o que o CLI gravaria. Puro; roda no cliente (fflate). Com `mtime` fixo o resultado é byte a byte o mesmo.
 */

import { strToU8, zipSync, type Zippable } from 'fflate';
import type { GeneratedFile } from '@/types/panels';

export function zipFiles(files: readonly GeneratedFile[], mtime: Date = new Date()): Uint8Array {
  const tree: Zippable = {};
  for (const f of files) tree[f.path] = [strToU8(f.content), { mtime }];
  return zipSync(tree, { level: 6 });
}
