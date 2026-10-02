import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeIo, parseArgs, run, USAGE, UsageError, type Io } from '../src/main';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLE = join(PKG, 'examples', 'casa-exemplo.json');

/** I/O em memória: arquivos de entrada fixos, saídas capturadas. */
function memoryIo(inputs: Record<string, string> = {}) {
  const written = new Map<string, string>();
  const dirs: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    readFile: (p) => {
      const key = Object.keys(inputs).find((k) => resolve(k) === p);
      if (key === undefined) throw new Error('ENOENT');
      return inputs[key] as string;
    },
    writeFile: (p, c) => {
      written.set(p, c);
    },
    mkdir: (p) => {
      dirs.push(p);
    },
    stdout: (l) => {
      out.push(l);
    },
    stderr: (l) => {
      err.push(l);
    },
  };
  return { io, written, dirs, out, err };
}

describe('parseArgs', () => {
  it('build <arquivo> --out <dir>, em qualquer ordem e com --out=', () => {
    expect(parseArgs(['build', 'p.json', '--out', 'saida'])).toEqual({ command: 'build', input: 'p.json', out: 'saida' });
    expect(parseArgs(['build', '--out', 'saida', 'p.json'])).toEqual({ command: 'build', input: 'p.json', out: 'saida' });
    expect(parseArgs(['build', 'p.json', '--out=saida'])).toEqual({ command: 'build', input: 'p.json', out: 'saida' });
    expect(parseArgs(['build', 'p.json', '-o', 'saida'])).toEqual({ command: 'build', input: 'p.json', out: 'saida' });
  });

  it('sem argumentos, -h ou --help mostram ajuda', () => {
    expect(parseArgs([])).toEqual({ command: 'help' });
    expect(parseArgs(['--help'])).toEqual({ command: 'help' });
    expect(parseArgs(['build', '-h'])).toEqual({ command: 'help' });
  });

  it.each([
    [['fly'], /comando desconhecido: "fly"/],
    [['build'], /informe o arquivo/],
    [['build', 'p.json'], /informe --out/],
    [['build', 'p.json', '--out'], /--out exige um diretório/],
    [['build', 'p.json', '--out', '--x'], /--out exige um diretório/],
    [['build', 'p.json', '--out', 'd', '--verbose'], /opção desconhecida: "--verbose"/],
    [['build', 'p.json', 'q.json', '--out', 'd'], /argumento inesperado: "q.json"/],
  ])('uso incorreto lança UsageError (%j)', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe('run (I/O em memória)', () => {
  const exampleText = readFileSync(EXAMPLE, 'utf8');

  it('uso incorreto: código 2 e ajuda no stderr', () => {
    const m = memoryIo();
    expect(run(['build'], m.io)).toBe(2);
    expect(m.err[0]).toMatch(/^erro: informe o arquivo/);
    expect(m.err.join('\n')).toContain(USAGE);
    expect(m.written.size).toBe(0);
  });

  it('--help: código 0 e ajuda no stdout', () => {
    const m = memoryIo();
    expect(run(['--help'], m.io)).toBe(0);
    expect(m.out).toEqual([USAGE]);
  });

  it('arquivo inexistente: código 1', () => {
    const m = memoryIo();
    expect(run(['build', 'nao-existe.json', '--out', 'saida'], m.io)).toBe(1);
    expect(m.err[0]).toMatch(/não foi possível ler .*nao-existe\.json/);
  });

  it('projeto inválido: código 1 com o caminho do campo', () => {
    const m = memoryIo({ 'p.json': '{"config":{},"walls":[]}' });
    expect(run(['build', 'p.json', '--out', 'saida'], m.io)).toBe(1);
    expect(m.err).toEqual(['erro: p.json.config.studSpacing: esperado medida (número ou texto), recebido nada']);
    expect(m.written.size).toBe(0);
  });

  it('parede com porta (S8 pendente): código 1, problemas listados, nada gravado', () => {
    const project = JSON.parse(exampleText) as { walls: { openings: unknown[] }[] };
    project.walls[0]!.openings.push({ id: 'P1', type: 'door', offset: 48, roughWidth: 36, roughHeight: 82 });
    const m = memoryIo({ 'p.json': JSON.stringify(project) });
    expect(run(['build', 'p.json', '--out', 'saida'], m.io)).toBe(1);
    expect(m.err[0]).toBe('erro: 1 problema(s) ao gerar os painéis — nenhum arquivo gravado');
    expect(m.err[1]).toMatch(/^ {2}- parede W01: /);
    expect(m.written.size).toBe(0);
    expect(m.dirs).toEqual([]);
  });

  it('sucesso: grava 8 arquivos sob --out e resume no stdout', () => {
    const m = memoryIo({ 'p.json': exampleText });
    expect(run(['build', 'p.json', '--out', 'saida'], m.io)).toBe(0);
    const outDir = resolve('saida');
    expect([...m.written.keys()]).toEqual([
      join(outDir, 'cutlist.csv'),
      join(outDir, 'bom.csv'),
      join(outDir, 'panels', 'W01.svg'),
      join(outDir, 'panels', 'W02.svg'),
      join(outDir, 'panels', 'W03.svg'),
      join(outDir, 'panels', 'W04.svg'),
      join(outDir, 'panels', 'W05.svg'),
      join(outDir, 'panels', 'W06.svg'),
    ]);
    expect(m.dirs[0]).toBe(outDir);
    expect(m.dirs).toContain(join(outDir, 'panels'));
    expect(m.out[0]).toBe(`6 painel(is), 92 peças → ${outDir}`);
    expect(m.out.slice(1)).toEqual([
      '  cutlist.csv',
      '  bom.csv',
      '  panels/W01.svg',
      '  panels/W02.svg',
      '  panels/W03.svg',
      '  panels/W04.svg',
      '  panels/W05.svg',
      '  panels/W06.svg',
    ]);
    expect(m.err).toEqual([]);
  });

  it('avisos do core vão para o stderr sem mudar o código de saída', () => {
    const project = JSON.parse(exampleText) as { config: { studLength: number[] } };
    project.config.studLength = [104.625];
    const m = memoryIo({ 'p.json': JSON.stringify(project) });
    expect(run(['build', 'p.json', '--out', 'saida'], m.io)).toBe(0);
    expect(m.err).toHaveLength(5);
    expect(m.err[0]).toMatch(/^aviso W01 STUD_LENGTH_MISMATCH: /);
  });

  it('cwd explícito resolve entrada e saída relativas', () => {
    const m = memoryIo({ [join('C:', 'proj', 'p.json')]: exampleText });
    m.io.readFile = (p) => {
      if (p !== resolve('C:', 'proj', 'p.json')) throw new Error(`ENOENT ${p}`);
      return exampleText;
    };
    expect(run(['build', 'p.json', '--out', 'saida'], m.io, resolve('C:', 'proj'))).toBe(0);
    expect(m.dirs[0]).toBe(resolve('C:', 'proj', 'saida'));
  });

  it('falha de escrita: código 1', () => {
    const m = memoryIo({ 'p.json': exampleText });
    m.io.writeFile = () => {
      throw new Error('EACCES');
    };
    expect(run(['build', 'p.json', '--out', 'saida'], m.io)).toBe(1);
    expect(m.err[0]).toMatch(/não foi possível gravar em .*saida: EACCES/);
  });
});

describe('ponta a ponta (disco)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'panelizer-cli-'));
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('run com o I/O real grava o exemplo em um diretório novo', () => {
    const outDir = join(tmp, 'saida', 'aninhada');
    const err: string[] = [];
    const out: string[] = [];
    const code = run(['build', EXAMPLE, '--out', outDir], {
      ...nodeIo,
      stdout: (l) => {
        out.push(l);
      },
      stderr: (l) => {
        err.push(l);
      },
    });
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(readdirSync(outDir).sort()).toEqual(['bom.csv', 'cutlist.csv', 'panels']);
    expect(readdirSync(join(outDir, 'panels')).sort()).toEqual(['W01.svg', 'W02.svg', 'W03.svg', 'W04.svg', 'W05.svg', 'W06.svg']);
    expect(readFileSync(join(outDir, 'cutlist.csv'), 'utf8')).toContain('W04,plates,2x4,129.5,"129 1/2""",3');
    expect(readFileSync(join(outDir, 'panels', 'W02.svg'), 'utf8')).toContain(`>16'-0&quot;</text>`);
  });

  it('processo real: tsx src/cli.ts build ... --out ...', () => {
    const require = createRequire(import.meta.url);
    const tsxCli = require.resolve('tsx/cli');
    const outDir = join(tmp, 'proc');
    const r = spawnSync(process.execPath, [tsxCli, join(PKG, 'src', 'cli.ts'), 'build', EXAMPLE, '--out', outDir], {
      cwd: PKG,
      encoding: 'utf8',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe(`6 painel(is), 92 peças → ${outDir}`);
    expect(existsSync(join(outDir, 'panels', 'W01.svg'))).toBe(true);

    const bad = spawnSync(process.execPath, [tsxCli, join(PKG, 'src', 'cli.ts'), 'build'], { cwd: PKG, encoding: 'utf8' });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/^erro: informe o arquivo/);
  });
});
