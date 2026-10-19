import { resolve, sep } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildProject } from 'cli/build';
import { EXAMPLES } from 'cli/examples';
import { run, type Io } from 'cli/main';
import { parseProject } from 'cli/project';
import { zipFiles } from './zip';

const example = (id: string): string => {
  const e = EXAMPLES.find((x) => x.id === id);
  if (e === undefined) throw new Error(`exemplo ${id} não existe`);
  return e.text;
};

/** Lê o zip como `{ caminho com '/' → texto }`. */
const unzipText = (bytes: Uint8Array): Map<string, string> =>
  new Map(Object.entries(unzipSync(bytes)).map(([p, b]) => [p, strFromU8(b)]));

describe('zipFiles', () => {
  it('descompacta na mesma árvore que `panelizer build --out` grava (CLI em memória)', () => {
    const text = example('house-28x40');
    const written = new Map<string, string>();
    const io: Io = {
      readFile: () => text,
      writeFile: (p, c) => {
        written.set(p, c);
      },
      mkdir: () => {},
      stdout: () => {},
      stderr: () => {},
    };
    const cwd = resolve('proj');
    expect(run(['build', 'p.json', '--out', 'saida'], io, cwd)).toBe(0);
    const outDir = resolve(cwd, 'saida') + sep;
    const onDisk = new Map([...written].map(([p, c]) => [p.slice(outDir.length).split(sep).join('/'), c]));

    const files = buildProject(parseProject(text, 'p.json')).files;
    const inZip = unzipText(zipFiles(files));

    expect([...inZip.keys()].sort()).toEqual([...onDisk.keys()].sort());
    for (const [p, c] of onDisk) expect(inZip.get(p)).toBe(c);
    expect(inZip.has('plan.svg')).toBe(true);
    expect([...inZip.keys()].filter((p) => p.startsWith('panels/')).length).toBe(12);
  });

  it('é determinístico com data fixa e preserva UTF-8', () => {
    const files = [{ path: 'a/b.txt', content: 'ação ½" × 2' }];
    const date = new Date(2000, 0, 1);
    const a = zipFiles(files, date);
    expect(zipFiles(files, date)).toEqual(a);
    expect(unzipText(a).get('a/b.txt')).toBe('ação ½" × 2');
  });

  it('lista vazia vira um zip vazio válido', () => {
    expect(unzipText(zipFiles([])).size).toBe(0);
  });
});
