import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseProject } from 'cli/project';
import { finish } from '../src/client';
import { parseArgs, run, USAGE, UsageError, type Deps, type Io } from '../src/main';
import { subsetPdf } from '../src/pdf';
import { makePdf } from './helpers/makePdf';

const ringgoldOutput = JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')) as unknown;

/** Io em memória: arquivos de entrada dados, saídas capturadas. */
function memIo(inputs: Record<string, Uint8Array | string>) {
  const files = new Map<string, string>();
  const binaries = new Map<string, Uint8Array>();
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
    writeBinary: (p, c) => {
      binaries.set(p.replace(/\\/g, '/').replace(/^.*\/saida\//, ''), c);
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
  return { io, files, binaries, dirs, out, err };
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
      date: '2026-10-14', revision: 'A', model: 'claude-sonnet-5-5', effort: 'max', maxTokens: 8000, dryRun: false, tiles: true,
    });
    expect(parseArgs(['p.pdf', '--out', 'd', '--no-tiles'])).toMatchObject({ tiles: false });
    expect(parseArgs(['p.pdf', '--out', 'd', '--max-tiles', '12', '--tiles-dpi', '220'])).toMatchObject({ tiles: { maxPerPage: 12, dpi: 220 } });
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--no-tiles', '--max-tiles', '4'])).toThrow(/cannot be combined/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--max-tiles', '4', '--no-tiles'])).toThrow(/cannot be combined/);
    expect(parseArgs(['p.pdf', '--out=d', '--dry-run'])).toMatchObject({ out: 'd', dryRun: true });
    expect(parseArgs(['p.pdf', '--out', 'd', '--wall-height', `9'-1 1/8"`])).toMatchObject({ wallHeight: `9'-1 1/8"` });
    expect(parseArgs(['p.pdf', '--out', 'd', '--snow', '30', '--width', `29'`, '--wind', '130', '--exposure', 'B'])).toMatchObject({
      snow: 30, width: `29'`, wind: 130, exposure: 'B',
    });
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--snow', 'x'])).toThrow(/--snow/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--exposure', 'E'])).toThrow(/--exposure/);
    expect(parseArgs(['p.pdf', '--out', 'd', '--floors', '2', '--floor-span', 'center'])).toMatchObject({ floors: 2, floorSpan: 'center' });
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--floors', '1.5'])).toThrow(/--floors/);
    expect(parseArgs(['p.pdf', '-o', 'd', '--response', 'r.json'])).toMatchObject({ response: 'r.json' });
  });

  it('erros de uso', () => {
    expect(() => parseArgs(['--out', 'd'])).toThrow(UsageError);
    expect(() => parseArgs(['p.pdf'])).toThrow(/--out/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--pages', '3,x'])).toThrow(/--pages/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--effort', 'alto'])).toThrow(/--effort/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--dry-run', '--response', 'r.json'])).toThrow(/cannot be combined/);
    expect(() => parseArgs(['p.pdf', '--out', 'd', '--bogus'])).toThrow(/unknown option/);
    expect(() => parseArgs(['p.pdf', 'q.pdf', '--out', 'd'])).toThrow(/unexpected argument/);
  });
});

describe('run', () => {
  it('--help imprime o uso e sai 0; uso errado sai 2 com o uso no stderr', async () => {
    const m = memIo({});
    expect(await run(['--help'], m.io)).toBe(0);
    expect(m.out[0]).toBe(USAGE);
    const bad = memIo({});
    expect(await run(['--out', 'd'], bad.io)).toBe(2);
    expect(bad.err[0]).toMatch(/^error: missing the <drawings\.pdf> file/);
    expect(bad.err).toContain(USAGE);
  });

  it('PDF ilegível sai 1', async () => {
    const m = memIo({});
    expect(await run(['nao-existe.pdf', '--out', 'saida'], m.io, '/w', fakeDeps)).toBe(1);
    expect(m.err[0]).toMatch(/could not read/);
  });

  it('--dry-run: páginas pelo carimbo, texto posicionado e pedido.json, sem chamar a API', async () => {
    const m = memIo({ 'planta.pdf': await makePdf() });
    const deps: Deps = { extract: async () => { throw new Error('não deveria chamar'); } };
    expect(await run(['planta.pdf', '--out', 'saida', '--dry-run'], m.io, '/w', deps)).toBe(0);
    expect(m.out[0]).toBe('pages by title block: 1=A-100 2=A-800');
    expect(m.out[1]).toMatch(/^dry-run: 2 page\(s\), 1 tile\(s\)/);
    expect([...m.files.keys()].sort()).toEqual(['pages/1.txt', 'pages/2.txt', 'request.json']);
    // O recorte da A-100 (planta) vai para recortes/; a A-800 (schedule) não recorta.
    expect([...m.binaries.keys()]).toEqual(['tiles/p1-r1c1.png']);
    expect(Array.from(m.binaries.get('tiles/p1-r1c1.png')!.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(m.files.get('pages/1.txt')).toContain(`16' - 0"`);
    const pedido = JSON.parse(m.files.get('request.json') as string) as Record<string, unknown>;
    expect(pedido['model']).toBe('claude-opus-5-5');
    expect(pedido['pages']).toEqual([1, 2]);
    expect(pedido['content_blocks']).toEqual(['document', 'text', 'text', 'text', 'image', 'text']);
    expect(pedido['tiles']).toEqual([
      expect.objectContaining({ file: 'tiles/p1-r1c1.png', page: 1, sheet: 'A-100', row: 1, col: 1, region_pt: { x0: 0, y0: 0, x1: 612, y1: 792 }, mediaType: 'image/png' }),
    ]);
    expect(pedido['tiles_encoded_bytes']).toBeGreaterThan(0);
    expect(pedido['schema']).toHaveProperty('properties');
  });

  it('--dry-run --no-tiles: sem recortes/ e com os 4 blocos de antes', async () => {
    const m = memIo({ 'planta.pdf': await makePdf() });
    const deps: Deps = { extract: async () => { throw new Error('não deveria chamar'); } };
    expect(await run(['planta.pdf', '--out', 'saida', '--dry-run', '--no-tiles'], m.io, '/w', deps)).toBe(0);
    expect(m.out[1]).toMatch(/^dry-run: 2 page\(s\), 0 tile\(s\) → .*\(pages\/, request\.json\)/);
    expect(m.binaries.size).toBe(0);
    const pedido = JSON.parse(m.files.get('request.json') as string) as Record<string, unknown>;
    expect(pedido['content_blocks']).toEqual(['document', 'text', 'text', 'text']);
    expect(pedido['tiles']).toEqual([]);
  });

  it('--response: pós-processa a resposta gravada e escreve projeto.json válido, extracao.json e revisao.md', async () => {
    const m = memIo({ 'planta.pdf': await makePdf(), 'resposta.json': JSON.stringify(ringgoldOutput) });
    const deps: Deps = { extract: async () => { throw new Error('não deveria chamar'); } };
    const code = await run(['planta.pdf', '--out', 'saida', '--pages', '1,2', '--response', 'resposta.json', '--date', '2026-10-14'], m.io, '/w', deps);
    expect(code).toBe(0);
    expect(m.out).toHaveLength(1);
    expect(m.out[0]).toMatch(/^4 wall\(s\), 5 opening\(s\) → .*saida \(recorded:resposta\.json; 0 input tokens, 0 output\)$/);
    // P30: a S2 fecha com 1 jack por lado nas duas aberturas; os avisos vão para o revisor.
    expect(m.err).toHaveLength(2);
    for (const line of m.err) expect(line).toMatch(/^warning: 1-S2-P1 HEADER_JACKS_BELOW_TABLE: .*hypothesis P30/);
    const projeto = parseProject(m.files.get('project.json') as string, 'projeto');
    expect(projeto.walls.map((w) => w.id)).toEqual(['N1', 'S1', 'S2', 'I1']);
    expect(projeto.date).toBe('2026-10-14');
    expect(JSON.parse(m.files.get('extraction.json') as string)).toMatchObject({ projectName: '26 Ringgold St' });
    expect(m.files.get('review.md')).toContain('# Extraction — 26 Ringgold St');
    expect(m.files.get('pages/1.txt')).toContain('# página 1');
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
    expect(m.out[1]).toMatch(/^4 wall\(s\), 5 opening\(s\) → .*saida \(claude-sonnet-5-5; 10 input tokens, 5 output\)$/);
    expect(m.err.filter((l) => l.startsWith('warning:') && !l.includes('hypothesis P30'))).toEqual([]);
    expect(m.err.filter((l) => l.startsWith('problem:'))).toEqual([]);
  });

  it('problemas do CLI saem no stderr, mas os arquivos são gravados e o código é 0', async () => {
    const broken = JSON.parse(JSON.stringify(ringgoldOutput)) as { walls: { start: unknown; end: unknown; length: unknown }[] };
    broken.walls[0] = { ...broken.walls[0], start: { x: '0"', y: '0"' }, end: { x: `16' - 0"`, y: '0"' }, length: null } as (typeof broken.walls)[number];
    const m = memIo({ 'planta.pdf': await makePdf(), 'r.json': JSON.stringify(broken) });
    expect(await run(['planta.pdf', '--out', 'saida', '--pages', '1', '--response', 'r.json'], m.io, '/w', fakeDeps)).toBe(0);
    expect(m.err[0]).toMatch(/^problem: parser: /);
    expect(m.err[1]).toMatch(/needs fixing/);
    expect(m.files.has('project.json')).toBe(true);
    expect(m.files.get('review.md')).toContain('- parser: ');
  });

  it('resposta gravada fora do schema: sai 1 e grava o texto cru', async () => {
    const m = memIo({ 'planta.pdf': await makePdf(), 'r.json': '{"projectName":"x"}' });
    expect(await run(['planta.pdf', '--out', 'saida', '--pages', '1', '--response', 'r.json'], m.io, '/w', fakeDeps)).toBe(1);
    expect(m.err[0]).toMatch(/^error: response does not match the schema/);
    expect(m.files.get('raw-response.txt')).toBe('{"projectName":"x"}');
  });

  it('nenhuma folha útil pelo carimbo e sem --pages: sai 1, sem gravar nada', async () => {
    // Só uma folha de detalhes (A-501): nada para ler.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([612, 792]).drawText('A-501', { x: 500, y: 40, size: 24, font });
    const m = memIo({ 'planta.pdf': await doc.save() });
    expect(await run(['planta.pdf', '--out', 'saida'], m.io, '/w', fakeDeps)).toBe(1);
    expect(m.err[0]).toMatch(/no useful sheet/);
    expect(m.files.size).toBe(0);
  });

  it('PDF só com o schedule: vai a folha de schedule (A-8xx), sem exigir planta', async () => {
    const only = await subsetPdf(await makePdf(), [2]);
    const m = memIo({ 'planta.pdf': only });
    expect(await run(['planta.pdf', '--out', 'saida', '--dry-run'], m.io, '/w', fakeDeps)).toBe(0);
    expect(m.out[0]).toBe('pages by title block: 1=A-800');
  });
});
