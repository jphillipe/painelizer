/**
 * Comando `extract` (S19): planta em PDF → JSON de entrada do CLI para revisão humana.
 *
 * Uso: `extract <planta.pdf> --out <dir> [--pages 3,15] [--dry-run | --response <resposta.json>] …`
 * Grava em <dir>: `project.json` (entrada do `panelizer build`), `extraction.json` (resposta do modelo),
 * `review.md` (relatório com confiança, evidência e o que revisar), `pages/<n>.txt` (texto posicionado
 * enviado) e, no `--dry-run`, `tiles/` e `request.json` (as imagens em alta resolução das plantas que iriam à API
 * e o resumo do pedido). Nomes de arquivo e textos em inglês; o texto posicionado e as legendas dos recortes
 * seguem o que vai ao modelo. Sem
 * `--dry-run`/`--response` chama a API, que precisa de `ANTHROPIC_API_KEY`.
 *
 * Único módulo do pacote que toca `node:fs` (junto com `bin/` e `cli.ts`), por uma `Io` injetável.
 * Códigos de saída: 0 ok (mesmo com problemas no JSON: a saída é para revisão), 1 erro, 2 uso incorreto.
 */

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildRequest, ExtractError, extractWalls, finish, selectionWarnings, selectPages, type Effort, type ExtractOptions, type ExtractRequest, type ExtractResult } from './client';
import { noticeText } from './notices';
import { formatPageText, openPdf } from './pdf';
import { pageKey } from './select';
import { RESPONSE_SCHEMA } from './prompt';
import type { TileOptions } from './tiles';

export const USAGE = `extract — PDF drawings → panelizer wall JSON, for review

Usage:
  extract <drawings.pdf> --out <dir> [options]

Writes to <dir>:
  project.json       input for \`panelizer build\` (review before running it)
  extraction.json    the model's response: walls, openings, types, confidence and evidence
  review.md          report: what was read, from where, and what to review
  pages/<n>.txt      positioned text of each page sent
  tiles/             (--dry-run only) high-resolution tiles of the floor plans, as sent to the API

Options:
  --out <dir>            output directory (required; created if missing)
  --pages 3,15           pages (1-based) to send; without it, the useful sheets by title block (plan, schedules, structural…)
  --level <n>            level to extract (hint to the model)
  --name <text>          project name (hint to the model)
  --hint <text>          free-form note to the model ("ignore the garage")
  --date <text>          sheet stamp (goes into project.json)
  --revision <text>      same
  --wall-height <size>   wall height (subfloor to top of double top plate) when the drawings have no sections
  --header-height <size> header bottom (top of RO) above subfloor when the project does not give it; default 82 1/2" (P2)
  --sill-height <size>   window sill height above subfloor when the elevations do not give it
  --snow <psf>           ground snow load, --width <size> building width, --wind <mph>,
  --exposure <B|C|D>     structural data the architectural set does not carry (only where the AI did not read it)
  --floors <n>           floors above the bearing walls; --floor-span <center|clear> floor support
  --model <id>           model (default claude-opus-5-5)
  --effort <level>       low | medium | high (default) | xhigh | max
  --max-tokens <n>       output limit (default 128000, the maximum; thinking counts)
  --no-tiles             no high-resolution tiles of the floor plans (default: up to 6 per plan, 16 per reading)
  --max-tiles <n>        tile cap per floor plan page
  --tiles-dpi <n>        target tile resolution (default 200; the per-page cap usually wins)
  --dry-run              does not call the API: writes pages/, tiles/ and request.json and stops
  --response <file>      does not call the API: post-processes a recorded response (model JSON)
  -h, --help             this help

Needs ANTHROPIC_API_KEY in the environment to call the API (not with --dry-run or --response).
`;

export interface Io {
  readFile(path: string): Uint8Array;
  writeFile(path: string, content: string): void;
  writeBinary(path: string, content: Uint8Array): void;
  mkdir(path: string): void;
  stdout(line: string): void;
  stderr(line: string): void;
}

export const nodeIo: Io = {
  readFile: (p) => new Uint8Array(readFileSync(p)),
  writeFile: (p, c) => writeFileSync(p, c, 'utf8'),
  writeBinary: (p, c) => writeFileSync(p, c),
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

export interface ExtractArgs {
  command: 'extract';
  input: string;
  out: string;
  pages?: number[];
  level?: number;
  name?: string;
  hint?: string;
  date?: string;
  revision?: string;
  wallHeight?: string;
  headerHeight?: string;
  sillHeight?: string;
  snow?: number;
  width?: string;
  wind?: number;
  exposure?: 'B' | 'C' | 'D';
  floors?: number;
  floorSpan?: 'center' | 'clear';
  model?: string;
  effort?: Effort;
  maxTokens?: number;
  /** `false` desliga os recortes; objeto ajusta teto por página e dpi. */
  tiles: boolean | Partial<TileOptions>;
  dryRun: boolean;
  response?: string;
}

export type ParsedArgs = ExtractArgs | { command: 'help' };

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function takeValue(argv: readonly string[], i: number, flag: string): string {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('-')) throw new UsageError(`${flag} requires a value`);
  return v;
}

function int(v: string, flag: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`${flag}: expected a whole number ≥ 1, got "${v}"`);
  return n;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) return { command: 'help' };
  let input: string | undefined;
  const args: Omit<ExtractArgs, 'command' | 'input' | 'out'> & { out?: string } = { dryRun: false, tiles: true };
  const tileOptions = (): Partial<TileOptions> => {
    if (args.tiles === false) throw new UsageError('--no-tiles cannot be combined with --max-tiles / --tiles-dpi');
    if (args.tiles === true) args.tiles = {};
    return args.tiles;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = (): string => {
      if (inline !== undefined) return inline;
      const v = takeValue(argv, i, flag);
      i++;
      return v;
    };
    switch (flag) {
      case '--out':
      case '-o':
        args.out = value();
        break;
      case '--pages':
        args.pages = value()
          .split(',')
          .map((s) => int(s.trim(), '--pages'));
        break;
      case '--level':
        args.level = int(value(), '--level');
        break;
      case '--name':
        args.name = value();
        break;
      case '--hint':
        args.hint = value();
        break;
      case '--date':
        args.date = value();
        break;
      case '--snow':
        args.snow = Number(value());
        if (!Number.isFinite(args.snow) || args.snow <= 0) throw new UsageError('--snow: expected psf > 0');
        break;
      case '--width':
        args.width = value();
        break;
      case '--wind':
        args.wind = Number(value());
        if (!Number.isFinite(args.wind) || args.wind <= 0) throw new UsageError('--wind: expected mph > 0');
        break;
      case '--exposure': {
        const e = value();
        if (e !== 'B' && e !== 'C' && e !== 'D') throw new UsageError('--exposure: expected B, C or D');
        args.exposure = e;
        break;
      }
      case '--floors':
        args.floors = Number(value());
        if (!Number.isInteger(args.floors) || args.floors < 0) throw new UsageError('--floors: expected a whole number ≥ 0');
        break;
      case '--floor-span': {
        const s = value();
        if (s !== 'center' && s !== 'clear') throw new UsageError('--floor-span: expected center or clear');
        args.floorSpan = s;
        break;
      }
      case '--wall-height':
        args.wallHeight = value();
        break;
      case '--header-height':
        args.headerHeight = value();
        break;
      case '--sill-height':
        args.sillHeight = value();
        break;
      case '--revision':
        args.revision = value();
        break;
      case '--model':
        args.model = value();
        break;
      case '--effort': {
        const e = value();
        if (!(EFFORTS as readonly string[]).includes(e)) throw new UsageError(`--effort: expected one of ${EFFORTS.join(', ')}`);
        args.effort = e as Effort;
        break;
      }
      case '--max-tokens':
        args.maxTokens = int(value(), '--max-tokens');
        break;
      case '--no-tiles':
        if (typeof args.tiles === 'object') throw new UsageError('--no-tiles cannot be combined with --max-tiles / --tiles-dpi');
        args.tiles = false;
        break;
      case '--max-tiles':
        tileOptions().maxPerPage = int(value(), '--max-tiles');
        break;
      case '--tiles-dpi':
        tileOptions().dpi = int(value(), '--tiles-dpi');
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--response':
        args.response = value();
        break;
      default:
        if (a.startsWith('-')) throw new UsageError(`unknown option: "${a}"`);
        if (input !== undefined) throw new UsageError(`unexpected argument: "${a}"`);
        input = a;
    }
  }
  if (input === undefined) throw new UsageError('missing the <drawings.pdf> file');
  if (args.out === undefined || args.out === '') throw new UsageError('missing --out <dir>');
  if (args.dryRun && args.response !== undefined) throw new UsageError('--dry-run and --response cannot be combined');
  const { out, ...rest } = args;
  return { command: 'extract', input, out, ...rest };
}

/** Dependências substituíveis em teste: a chamada à API. */
export interface Deps {
  extract: (req: ExtractRequest, opts: ExtractOptions) => Promise<ExtractResult>;
}

export const defaultDeps: Deps = { extract: extractWalls };

type Defined<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

/** Remove as chaves `undefined`, para montar objetos com campos opcionais sob `exactOptionalPropertyTypes`. */
function strip<T extends object>(o: T): Partial<Defined<T>> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<Defined<T>>;
}

/** Executa o comando e devolve o código de saída. Nunca lança. */
export async function run(argv: readonly string[], io: Io = nodeIo, cwd: string = process.cwd(), deps: Deps = defaultDeps): Promise<number> {
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
  const write = (name: string, content: string) => {
    const target = join(outDir, ...name.split('/'));
    io.mkdir(dirname(target));
    io.writeFile(target, content);
  };
  const writeBinary = (name: string, content: Uint8Array) => {
    const target = join(outDir, ...name.split('/'));
    io.mkdir(dirname(target));
    io.writeBinary(target, content);
  };

  let pdf: Uint8Array;
  try {
    pdf = io.readFile(inputPath);
  } catch (e) {
    io.stderr(`error: could not read ${inputPath}: ${(e as Error).message}`);
    return 1;
  }

  try {
    // Páginas: explícitas ou pelo carimbo (planta, schedules, estrutural, elevações e cortes; `select.ts`).
    let pages = args.pages;
    if (pages === undefined) {
      const name = inputPath.split(/[\\/]/).pop() ?? 'drawings.pdf';
      const selection = await selectPages([{ kind: 'pdf', name, data: pdf }], args.level);
      pages = selection.pages[0] ?? [];
      if (pages.length === 0) {
        io.stderr('error: no useful sheet recognized by title block; use --pages');
        return 1;
      }
      const label = (p: number) => {
        const info = selection.sheets.get(pageKey(0, p));
        return `${p}=${info?.sheet ?? '?'}`;
      };
      io.stdout(`pages by title block: ${pages.map(label).join(' ')}`);
      for (const w of selectionWarnings(selection)) io.stderr(`warning: ${noticeText(w)}`);
    }

    io.mkdir(outDir);
    const opened = await openPdf(pdf);
    try {
      for (const p of pages) write(`pages/${p}.txt`, formatPageText(await opened.pageText(p)) + '\n');
    } finally {
      await opened.close();
    }

    const hints = strip({ level: args.level, projectName: args.name, extra: args.hint });
    const building = strip({ groundSnowLoad: args.snow, buildingWidth: args.width, windSpeed: args.wind, exposure: args.exposure });
    const convert = strip({
      date: args.date,
      revision: args.revision,
      wallHeight: args.wallHeight,
      headerHeight: args.headerHeight,
      sillHeight: args.sillHeight,
      building: Object.keys(building).length > 0 ? building : undefined,
      floorsSupported: args.floors,
      floorSpan: args.floorSpan,
    });
    const req: ExtractRequest = { pdf, pages, hints, convert, tiles: args.tiles };
    const opts: ExtractOptions = strip({ model: args.model, effort: args.effort, maxTokens: args.maxTokens });

    let result: ExtractResult;
    if (args.dryRun) {
      const { params, pdfs, tiles, tileWarnings, textChars, provenance } = await buildRequest(req, opts);
      const written: Record<string, unknown>[] = [];
      for (const input of pdfs) {
        for (const t of input.tiles ?? []) {
          const ext = t.tile.mediaType === 'image/png' ? 'png' : 'jpg';
          const file = `tiles/p${t.page}-r${t.tile.row}c${t.tile.col}.${ext}`;
          writeBinary(file, t.tile.data);
          written.push({
            file,
            page: t.page,
            sheet: t.sheet ?? null,
            row: t.tile.row,
            col: t.tile.col,
            region_pt: { x0: t.tile.x0, y0: t.tile.y0, x1: t.tile.x1, y1: t.tile.y1 },
            width: t.tile.width,
            height: t.tile.height,
            dpi: t.grid.dpi,
            bytes: t.tile.data.byteLength,
            mediaType: t.tile.mediaType,
          });
        }
      }
      const summary = {
        model: params.model,
        max_tokens: params.max_tokens,
        effort: params.output_config.effort,
        provenance,
        text_chars: textChars,
        system: params.system[0]?.text,
        pages,
        pdf_bytes: pdf.byteLength,
        tiles: written,
        tiles_encoded_bytes: tiles.encodedBytes,
        content_blocks: (params.messages[0]?.content as unknown[]).map((b) => (b as { type: string }).type),
        schema: RESPONSE_SCHEMA,
      };
      write('request.json', JSON.stringify(summary, null, 2) + '\n');
      for (const w of tileWarnings) io.stderr(`warning: ${noticeText(w)}`);
      io.stdout(
        `dry-run: ${pages.length} page(s), ${tiles.count} tile(s) → ${outDir} (pages/${tiles.count > 0 ? ', tiles/' : ''}, request.json); nothing sent`,
      );
      return 0;
    } else if (args.response !== undefined) {
      const text = Buffer.from(io.readFile(resolve(cwd, args.response))).toString('utf8');
      result = finish(JSON.parse(text), convert, `recorded:${args.response}`, { inputTokens: 0, outputTokens: 0 });
    } else {
      result = await deps.extract(req, opts);
    }

    write('project.json', JSON.stringify(result.project, null, 2) + '\n');
    write('extraction.json', JSON.stringify(result.output, null, 2) + '\n');
    write('review.md', result.report);

    const openings = result.output.walls.reduce((n, w) => n + w.openings.length, 0);
    const tilesSent = result.tilesSent.reduce((n, t) => n + t.tiles, 0);
    io.stdout(
      `${result.output.walls.length} wall(s), ${openings} opening(s) → ${outDir} ` +
        `(${result.model}; ${result.usage.inputTokens} input tokens, ${result.usage.outputTokens} output${tilesSent > 0 ? `; ${tilesSent} tile(s)` : ''})`,
    );
    for (const w of result.warnings) io.stderr(`warning: ${noticeText(w)}`);
    for (const p of result.problems) io.stderr(`problem: ${noticeText(p)}`);
    if (result.problems.length > 0) io.stderr('project.json needs fixing before `panelizer build`; see review.md');
    return 0;
  } catch (e) {
    if (e instanceof ExtractError) {
      io.stderr(`error: ${e.message}`);
      if (e.rawText !== undefined) {
        write('raw-response.txt', e.rawText);
        io.stderr(`  raw text in ${join(outDir, 'raw-response.txt')}`);
      }
      return 1;
    }
    if (e instanceof Anthropic.AuthenticationError) {
      io.stderr('error: the API rejected the credential — set ANTHROPIC_API_KEY, or use --dry-run / --response');
      return 1;
    }
    if (e instanceof Anthropic.APIError) {
      io.stderr(`API error (${e.status ?? '?'}): ${e.message}`);
      return 1;
    }
    if (e instanceof RangeError || e instanceof SyntaxError) {
      io.stderr(`error: ${e.message}`);
      return 1;
    }
    io.stderr(`unexpected error: ${(e as Error).stack ?? String(e)}`);
    return 1;
  }
}
