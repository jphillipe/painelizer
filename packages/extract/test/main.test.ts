import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProject } from 'cli/project';
import { finish } from '../src/client';
import { parseArgs, run, USAGE, UsageError, type Deps, type Io } from '../src/main';
import { subsetPdf } from '../src/pdf';
import { makePdf } from './helpers/makePdf';

const ringgoldOutput = JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')) as unknown;

/** Io em memória: arquivos de entrada dados, saídas capturadas. */
function memIo(inputs: Record<string, Uint8Array | string>) {
  const files = new Map<string, string>();
  const dirs: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    readFile: (p) => {
      const key = Object.keys(inputs).find((k) => p.replace(/\\/g, '/').endsWith(k));
      if (key === undefined) throw new Error(`ENOENT ${p}`);
      const v = inputs[key] as Uint8Array | string;
      return typeof v === 'string' ? new TextEncoder().encode(v) : v;
    },
    writeFile: (p, c) => {
      files.set(p.replace(/\\/g, '/').replace(/^.*\/saida\//, ''), c);
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
  return { io, files, dirs, out, err };
}

const fakeDeps: Deps = {
  extract: async (req, opts) => finish(ringgoldOutput, req.convert, opts.model ?? 'falso', { inputTokens: 10, outputTokens: 5 }),
};

describe('parseArgs', () => {
  it('ajuda sem argumentos ou com -h', () => {
    expect(parseArgs([])).toEqual({ command: 'help' });
    expect(parseArgs(['x.pdf', '--out', 'd', '--help'])).toEqual({ command: 'help' });
  });

  it('entrada, saída e todas as opções', () => {
    expect(
      parseArgs([
        'planta.pdf', '--out', 'saida', '--pages', '3,15', '--level', '1', '--name', 'Casa', '--hint', 'ignore a garagem',
        '--date', '2026-10-14', '--revision', 'A', '--model', 'claude-sonnet-5-5', '--effort', 'max', '--max-tokens', '8000',
      ]),
    ).toEqual({
      command: 'extract', input: 'planta.pdf', out: 'saida', pages: [3, 15], level: 1, name: 'Casa', hint: 'ignore a garagem',
      date: '2026-10-14', revision: 'A', model: 'claude-sonnet-5-5', effort: 'max', maxTokens: 8000, dryRun: false,
    });
    expect(parseArgs(['p.pdf', '--out=d', '--dry-run'])).toMatchObject({ out: 'd', dryRun: true });
    expect(parseArgs(['p.pdf', '-o', 'd', '--response', 'r.json'])).toMatchObject({ response: 'r.json' });
  });

  it('erros de uso', () => {
    expect(() => parseArgs(['--out', 'd'])).toThrow(UsageError);
    expect(() => parseArgs(['p.pdf'])).toThrow(/--out/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--pages', '3,x'])).toThrow(/--pages/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--effort', 'alto'])).toThrow(/--effort/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--dry-run', '--response', 'r.json'])).toThrow(/não combinam/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--bogus'])).toThrow(/desconhecida/);
    expect(() => parseArgs(['p.pdf', 'q.pdf', '--out', 'd'])).toThrow(/inesperado/);
  });
});

describe('run', () => {
  it('--help imprime o uso e sai 0; uso errado sai 2 com o uso no stderr', async () => {
    const m = memIo({});
    expect(await run(['--help'], m.io)).toBe(0);
    expect(m.out[0]).toBe(USAGE);
    const bad = memIo({});
    expect(await run(['--out', 'd'], bad.io)).toBe(2);
    expect(bad.err[0]).toMatch(/^erro: informe o arquivo/);
    expect(bad.err).toContain(USAGE);
  });

  it('PDF ilegível sai 1', async () => {
    const m = memIo({});
    expect(await run(['nao-existe.pdf', '--out', 'saida'], m.io, '/w', fakeDeps)).toBe(1);
    expect(m.err[0]).toMatch(/não foi possível ler/);
  });

  it('--dry-run: páginas pelo carimbo, texto posicionado e pedido.json, sem chamar a API', async () => {
    const m = memIo({ 'planta.pdf': await makePdf() });
    const deps: Deps = { extract: async () => { throw new Error('não deveria chamar'); } };
    expect(await run(['planta.pdf', '--out', 'saida', '--dry-run'], m.io, '/w', deps)).toBe(0);
    expect(m.out[0]).toBe('páginas pelo carimbo: 1,2');
    expect(m.out[1]).toMatch(/^dry-run: 2 página\(s\)/);
    expect([...m.files.keys()].sort()).toEqual(['paginas/1.txt', 'paginas/2.txt', 'pedido.json']);
    expect(m.files.get('paginas/1.txt')).toContain(`16' - 0"`);
    const pedido = JSON.parse(m.files.get('pedido.json') as string) as Record<string, unknown>;
    expect(pedido['model']).toBe('claude-opus-5-5');
    expect(pedido['pages']).toEqual([1, 2]);
    expect(pedido['content_blocks']).toEqual(['document', 'text', 'text', 'text']);
    expect(pedido['schema']).toHaveProperty('properties');
  });

  it('--response: pós-processa a resposta gravada e escreve projeto.json válido, extracao.json e revisao.md', async () => {
    const m = memIo({ 'planta.pdf': await makePdf(), 'resposta.json': JSON.stringify(ringgoldOutput) });
    const deps: Deps = { extract: async () => { throw new Error('não deveria chamar'); } };
    const code = await run(['planta.pdf', '--out', 'saida', '--pages', '1,2', '--response', 'resposta.json', '--date', '2026-10-14'], m.io, '/w', deps);
    expect(code).toBe(0);
    expect(m.out).toHaveLength(1);
    expect(m.out[0]).toMatch(/^4 parede\(s\), 5 abertura\(s\) → .*saida \(gravado:resposta\.json; 0 tokens de entrada, 0 de saída\)$/);
    // P30: o motor não fecha a S2 sem `jackStuds: 1`; vai para o revisor, não derruba o comando.
    expect(m.err).toHaveLength(2);
    expect(m.err[0]).toMatch(/^problema: motor: parede S2/);
    expect(m.err[1]).toMatch(/precisa de ajuste/);
    const projeto = parseProject(m.files.get('projeto.json') as string, 'projeto');
    expect(projeto.walls.map((w) => w.id)).toEqual(['N1', 'S1', 'S2', 'I1']);
    expect(projeto.date).toBe('2026-10-14');
    expect(JSON.parse(m.files.get('extracao.json') as string)).toMatchObject({ projectName: '26 Ringgold St' });
    expect(m.files.get('revisao.md')).toContain('# Extração — 26 Ringgold St');
    expect(m.files.get('paginas/1.txt')).toContain('# página 1');
  });

  it('chamada pela dependência injetada, com dicas, modelo e esforço repassados', async () => {
    const m = memIo({ 'planta.pdf': await makePdf() });
    let seen: unknown[] = [];
    const deps: Deps = {
      extract: async (req, opts) => {
        seen = [req.pages, req.hints, req.convert, opts];
        return fakeDeps.extract(req, opts);
      },
    };
    const code = await run(
      ['planta.pdf', '--out', 'saida', '--level', '2', '--name', 'Casa', '--hint', 'só o térreo', '--revision', 'B', '--model', 'claude-sonnet-5-5', '--effort', 'low'],
      m.io, '/w', deps,
    );
    expect(code).toBe(0);
    expect(seen).toEqual([[1, 2], { level: 2, projectName: 'Casa', extra: 'só o térreo' }, { revision: 'B' }, { model: 'claude-sonnet-5-5', effort: 'low' }]);
    expect(m.out[1]).toMatch(/^4 parede\(s\), 5 abertura\(s\) → .*saida \(claude-sonnet-5-5; 10 tokens de entrada, 5 de saída\)$/);
    expect(m.err.filter((l) => l.startsWith('aviso:'))).toEqual([]);
  });

  it('problemas do CLI saem no stderr, mas os arquivos são gravados e o código é 0', async () => {
    const broken = JSON.parse(JSON.stringify(ringgoldOutput)) as { walls: { start: unknown; end: unknown; length: unknown }[] };
    broken.walls[0] = { ...broken.walls[0], start: { x: '0"', y: '0"' }, end: { x: `16' - 0"`, y: '0"' }, length: null } as (typeof broken.walls)[number];
    const m = memIo({ 'planta.pdf': await makePdf(), 'r.json': JSON.stringify(broken) });
    expect(await run(['planta.pdf', '--out', 'saida', '--pages', '1', '--response', 'r.json'], m.io, '/w', fakeDeps)).toBe(0);
    expect(m.err[0]).toMatch(/^problema: parser: /);
    expect(m.err[1]).toMatch(/precisa de ajuste/);
    expect(m.files.has('projeto.json')).toBe(true);
    expect(m.files.get('revisao.md')).toContain('- parser: ');
  });

  it('resposta gravada fora do schema: sai 1 e grava o texto cru', async () => {
    const m = memIo({ 'planta.pdf': await makePdf(), 'r.json': '{"projectName":"x"}' });
    expect(await run(['planta.pdf', '--out', 'saida', '--pages', '1', '--response', 'r.json'], m.io, '/w', fakeDeps)).toBe(1);
    expect(m.err[0]).toMatch(/^erro: resposta fora do schema/);
    expect(m.files.get('resposta-bruta.txt')).toBe('{"projectName":"x"}');
  });

  it('sem folha A-1xx e sem --pages: sai 1 listando as folhas, sem gravar nada', async () => {
    // PDF só com o schedule (A-800): não há planta para escolher pelo carimbo.
    const only = await subsetPdf(await makePdf(), [2]);
    const m = memIo({ 'planta.pdf': only });
    expect(await run(['planta.pdf', '--out', 'saida'], m.io, '/w', fakeDeps)).toBe(1);
    expect(m.err[0]).toMatch(/nenhuma folha A-1xx/);
    expect(m.err[1]).toContain('1=A-800');
    expect(m.files.size).toBe(0);
  });
});
