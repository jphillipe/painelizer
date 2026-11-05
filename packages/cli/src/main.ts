/**
 * Entrada do CLI: interpreta argumentos, lê o projeto, chama `buildProject` e
 * grava os arquivos. Este é o único módulo do repositório (junto com `bin/`)
 * que toca `node:fs`.
 *
 * Uso: `panelizer build <project.json> --out <dir>`
 * Códigos de saída: 0 ok; 1 erro de projeto/geração; 2 uso incorreto.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { piecesOf } from 'core';
import { buildProject, BuildError, problemText, type BuildResult } from './build';
import { parseProject, ProjectError } from './project';

export const USAGE = `panelizer — wall panelization engine

Usage:
  panelizer build <project.json> --out <dir>

Writes to <dir>:
  cutlist.csv        cut list for all panels
  bom.csv            consolidated bill of materials
  cost.csv           cost estimate: BOM × config.prices (only when the project has prices)
  panels.csv         one panel per line: wall, level, position, size, pieces, weight, warnings
  plan.svg           panel plan (top view; plan projects only)
  panels/<id>.svg    shop sheet for each panel ({level}-{wall}-P{n}): title block
                     (project name, date and revision), dimensioned elevation, piece list, weight,
                     field cuts and warnings — open and print in the browser

Options:
  --out <dir>   output directory (required; created if missing)
  -h, --help    this help
`;

/** Superfície de I/O injetável para testar sem tocar o disco. */
export interface Io {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  mkdir(path: string): void;
  stdout(line: string): void;
  stderr(line: string): void;
}

export const nodeIo: Io = {
  readFile: (p) => readFileSync(p, 'utf8'),
  writeFile: (p, c) => writeFileSync(p, c, 'utf8'),
  mkdir: (p) => {
    mkdirSync(p, { recursive: true });
  },
  stdout: (l) => {
    process.stdout.write(l + '\n');
  },
  stderr: (l) => {
    process.stderr.write(l + '\n');
  },
};

export interface BuildArgs {
  command: 'build';
  input: string;
  out: string;
}

export type ParsedArgs = BuildArgs | { command: 'help' };

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) return { command: 'help' };
  const [command, ...rest] = argv;
  if (command !== 'build') throw new UsageError(`unknown command: "${command}"`);

  let input: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === '--out' || a === '-o') {
      const v = rest[++i];
      if (v === undefined || v.startsWith('-')) throw new UsageError('--out requires a directory');
      out = v;
    } else if (a.startsWith('--out=')) {
      out = a.slice('--out='.length);
    } else if (a.startsWith('-')) {
      throw new UsageError(`unknown option: "${a}"`);
    } else if (input === undefined) {
      input = a;
    } else {
      throw new UsageError(`unexpected argument: "${a}"`);
    }
  }
  if (input === undefined) throw new UsageError('missing the <project.json> file');
  if (out === undefined || out === '') throw new UsageError('missing --out <dir>');
  return { command: 'build', input, out };
}

/**
 * Executa o CLI e devolve o código de saída. Nunca lança.
 * `cwd` é a base dos caminhos relativos (`process.env.INIT_CWD` quando chamado via `pnpm`).
 */
export function run(argv: readonly string[], io: Io = nodeIo, cwd: string = process.cwd()): number {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.stderr(`error: ${(e as Error).message}`);
    io.stderr('');
    io.stderr(USAGE);
    return 2;
  }
  if (args.command === 'help') {
    io.stdout(USAGE);
    return 0;
  }

  const inputPath = resolve(cwd, args.input);
  const outDir = resolve(cwd, args.out);

  let text: string;
  try {
    text = io.readFile(inputPath);
  } catch (e) {
    io.stderr(`error: could not read ${inputPath}: ${(e as Error).message}`);
    return 1;
  }

  let result: BuildResult;
  try {
    result = buildProject(parseProject(text, args.input));
  } catch (e) {
    if (e instanceof BuildError) {
      io.stderr(`error: ${e.problems.length} problem(s) generating the panels — no files written`);
      for (const p of e.problems) io.stderr(`  - ${problemText(p)}`);
      return 1;
    }
    if (e instanceof ProjectError) {
      io.stderr(`error: ${e.message}`);
      return 1;
    }
    io.stderr(`unexpected error: ${(e as Error).stack ?? String(e)}`);
    return 1;
  }

  try {
    io.mkdir(outDir);
    for (const f of result.files) {
      const target = join(outDir, ...f.path.split('/'));
      io.mkdir(dirname(target));
      io.writeFile(target, f.content);
    }
  } catch (e) {
    io.stderr(`error: could not write to ${outDir}: ${(e as Error).message}`);
    return 1;
  }

  for (const { panelId, warning } of result.warnings) {
    io.stderr(`warning ${panelId} ${warning.code}: ${warning.message}${warning.hypothesis === undefined ? '' : ` (hypothesis ${warning.hypothesis})`}`);
  }
  // Peças a cortar, como na folha e em panels.csv: header de n plies conta n (`piecesOf`).
  const pieces = result.panels.reduce((n, p) => n + piecesOf(p), 0);
  io.stdout(`${result.panels.length} panel(s), ${pieces} pieces → ${outDir}`);
  for (const f of result.files) io.stdout(`  ${f.path}`);
  return 0;
}
