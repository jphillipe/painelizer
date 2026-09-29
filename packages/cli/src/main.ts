/**
 * Entrada do CLI: interpreta argumentos, lê o projeto, chama `buildProject` e
 * grava os arquivos. Este é o único módulo do repositório (junto com `bin/`)
 * que toca `node:fs`.
 *
 * Uso: `panelizer build <projeto.json> --out <dir>`
 * Códigos de saída: 0 ok; 1 erro de projeto/geração; 2 uso incorreto.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildProject, BuildError, type BuildResult } from './build';
import { parseProject, ProjectError } from './project';

export const USAGE = `panelizer — motor de painelização de paredes

Uso:
  panelizer build <projeto.json> --out <dir>

Gera em <dir>:
  cutlist.csv        lista de corte de todos os painéis
  bom.csv            lista de material consolidada
  panels/<id>.svg    elevação de cada painel

Opções:
  --out <dir>   diretório de saída (obrigatório; criado se não existir)
  -h, --help    esta ajuda
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
  if (command !== 'build') throw new UsageError(`comando desconhecido: "${command}"`);

  let input: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === '--out' || a === '-o') {
      const v = rest[++i];
      if (v === undefined || v.startsWith('-')) throw new UsageError('--out exige um diretório');
      out = v;
    } else if (a.startsWith('--out=')) {
      out = a.slice('--out='.length);
    } else if (a.startsWith('-')) {
      throw new UsageError(`opção desconhecida: "${a}"`);
    } else if (input === undefined) {
      input = a;
    } else {
      throw new UsageError(`argumento inesperado: "${a}"`);
    }
  }
  if (input === undefined) throw new UsageError('informe o arquivo <projeto.json>');
  if (out === undefined || out === '') throw new UsageError('informe --out <dir>');
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
    io.stderr(`erro: ${(e as Error).message}`);
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
    io.stderr(`erro: não foi possível ler ${inputPath}: ${(e as Error).message}`);
    return 1;
  }

  let result: BuildResult;
  try {
    result = buildProject(parseProject(text, args.input));
  } catch (e) {
    if (e instanceof BuildError) {
      io.stderr(`erro: ${e.problems.length} problema(s) ao gerar os painéis — nenhum arquivo gravado`);
      for (const p of e.problems) io.stderr(`  - ${p}`);
      return 1;
    }
    if (e instanceof ProjectError) {
      io.stderr(`erro: ${e.message}`);
      return 1;
    }
    io.stderr(`erro inesperado: ${(e as Error).stack ?? String(e)}`);
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
    io.stderr(`erro: não foi possível gravar em ${outDir}: ${(e as Error).message}`);
    return 1;
  }

  for (const { panelId, warning } of result.warnings) {
    io.stderr(`aviso ${panelId} ${warning.code}: ${warning.message}`);
  }
  const pieces = result.panels.reduce((n, p) => n + p.members.length, 0);
  io.stdout(`${result.panels.length} painel(is), ${pieces} peças → ${outDir}`);
  for (const f of result.files) io.stdout(`  ${f.path}`);
  return 0;
}
