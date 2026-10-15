/**
 * Comando `extract` (S19): planta em PDF → JSON de entrada do CLI para revisão humana.
 *
 * Uso: `extract <planta.pdf> --out <dir> [--pages 3,15] [--dry-run | --response <resposta.json>] …`
 * Grava em <dir>: `projeto.json` (entrada do `panelizer build`), `extracao.json` (resposta do modelo),
 * `revisao.md` (relatório com confiança, evidência e o que revisar) e `paginas/<n>.txt` (texto posicionado
 * enviado). Sem `--dry-run`/`--response` chama a API, que precisa de `ANTHROPIC_API_KEY`.
 *
 * Único módulo do pacote que toca `node:fs` (junto com `bin/` e `cli.ts`), por uma `Io` injetável.
 * Códigos de saída: 0 ok (mesmo com problemas no JSON: a saída é para revisão), 1 erro, 2 uso incorreto.
 */

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildRequest, ExtractError, extractWalls, finish, type Effort, type ExtractOptions, type ExtractRequest, type ExtractResult } from './client';
import { formatPageText, listSheets, pickPages, readPageText } from './pdf';
import { RESPONSE_SCHEMA } from './prompt';

export const USAGE = `extract — planta em PDF → JSON de paredes do panelizer, para revisão

Uso:
  extract <planta.pdf> --out <dir> [opções]

Gera em <dir>:
  projeto.json       entrada do \`panelizer build\` (revisar antes de rodar)
  extracao.json      resposta do modelo: paredes, aberturas, tipos, confiança e evidência
  revisao.md         relatório: o que foi lido, de onde, e o que revisar
  paginas/<n>.txt    texto posicionado de cada página enviada

Opções:
  --out <dir>            diretório de saída (obrigatório; criado se não existir)
  --pages 3,15           páginas (1-based) a enviar; sem isto, a planta A-1xx e o schedule A-8xx pelo carimbo
  --level <n>            pavimento a extrair (dica ao modelo)
  --name <texto>         nome do projeto (dica ao modelo)
  --hint <texto>         observação livre para o modelo ("ignore a garagem")
  --date <texto>         carimbo das folhas (vai para projeto.json)
  --revision <texto>     idem
  --wall-height <medida> altura da parede (subfloor ao topo da double top) quando os desenhos não trazem cortes
  --snow <psf>           carga de neve no solo, --width <medida> largura da edificação, --wind <mph>,
  --exposure <B|C|D>     dados do estrutural que o conjunto de arquiteto não traz (só onde a IA não leu)
  --floors <n>           pavimentos acima das paredes portantes; --floor-span <center|clear> apoio do piso
  --model <id>           modelo (default claude-opus-5-5)
  --effort <nível>       low | medium | high (default) | xhigh | max
  --max-tokens <n>       limite de saída (default 96000; o raciocínio conta)
  --dry-run              não chama a API: grava paginas/ e pedido.json e para
  --response <arquivo>   não chama a API: pós-processa uma resposta gravada (JSON do modelo)
  -h, --help             esta ajuda

Precisa de ANTHROPIC_API_KEY no ambiente para chamar a API (não com --dry-run nem --response).
`;

export interface Io {
  readFile(path: string): Uint8Array;
  writeFile(path: string, content: string): void;
  mkdir(path: string): void;
  stdout(line: string): void;
  stderr(line: string): void;
}

export const nodeIo: Io = {
  readFile: (p) => new Uint8Array(readFileSync(p)),
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
  snow?: number;
  width?: string;
  wind?: number;
  exposure?: 'B' | 'C' | 'D';
  floors?: number;
  floorSpan?: 'center' | 'clear';
  model?: string;
  effort?: Effort;
  maxTokens?: number;
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
  if (v === undefined || v.startsWith('-')) throw new UsageError(`${flag} exige um valor`);
  return v;
}

function int(v: string, flag: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`${flag}: esperado inteiro ≥ 1, recebido "${v}"`);
  return n;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) return { command: 'help' };
  let input: string | undefined;
  const args: Omit<ExtractArgs, 'command' | 'input' | 'out'> & { out?: string } = { dryRun: false };

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
        if (!Number.isFinite(args.snow) || args.snow <= 0) throw new UsageError('--snow: esperado psf > 0');
        break;
      case '--width':
        args.width = value();
        break;
      case '--wind':
        args.wind = Number(value());
        if (!Number.isFinite(args.wind) || args.wind <= 0) throw new UsageError('--wind: esperado mph > 0');
        break;
      case '--exposure': {
        const e = value();
        if (e !== 'B' && e !== 'C' && e !== 'D') throw new UsageError('--exposure: esperado B, C ou D');
        args.exposure = e;
        break;
      }
      case '--floors':
        args.floors = Number(value());
        if (!Number.isInteger(args.floors) || args.floors < 0) throw new UsageError('--floors: esperado inteiro ≥ 0');
        break;
      case '--floor-span': {
        const s = value();
        if (s !== 'center' && s !== 'clear') throw new UsageError('--floor-span: esperado center ou clear');
        args.floorSpan = s;
        break;
      }
      case '--wall-height':
        args.wallHeight = value();
        break;
      case '--revision':
        args.revision = value();
        break;
      case '--model':
        args.model = value();
        break;
      case '--effort': {
        const e = value();
        if (!(EFFORTS as readonly string[]).includes(e)) throw new UsageError(`--effort: esperado um de ${EFFORTS.join(', ')}`);
        args.effort = e as Effort;
        break;
      }
      case '--max-tokens':
        args.maxTokens = int(value(), '--max-tokens');
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--response':
        args.response = value();
        break;
      default:
        if (a.startsWith('-')) throw new UsageError(`opção desconhecida: "${a}"`);
        if (input !== undefined) throw new UsageError(`argumento inesperado: "${a}"`);
        input = a;
    }
  }
  if (input === undefined) throw new UsageError('informe o arquivo <planta.pdf>');
  if (args.out === undefined || args.out === '') throw new UsageError('informe --out <dir>');
  if (args.dryRun && args.response !== undefined) throw new UsageError('--dry-run e --response não combinam');
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
  const write = (name: string, content: string) => {
    const target = join(outDir, ...name.split('/'));
    io.mkdir(dirname(target));
    io.writeFile(target, content);
  };

  let pdf: Uint8Array;
  try {
    pdf = io.readFile(inputPath);
  } catch (e) {
    io.stderr(`erro: não foi possível ler ${inputPath}: ${(e as Error).message}`);
    return 1;
  }

  try {
    // Páginas: explícitas ou pelo carimbo.
    let pages = args.pages;
    if (pages === undefined) {
      const sheets = await listSheets(pdf);
      const picked = pickPages(sheets);
      if (picked.plan === undefined) {
        io.stderr('erro: nenhuma folha A-1xx encontrada pelo carimbo; informe --pages');
        io.stderr(`  folhas: ${sheets.map((s) => `${s.page}=${s.sheet ?? '?'}`).join(' ')}`);
        return 1;
      }
      pages = picked.schedule === undefined ? [picked.plan] : [picked.plan, picked.schedule];
      io.stdout(`páginas pelo carimbo: ${pages.join(',')}`);
    }

    io.mkdir(outDir);
    for (const p of pages) write(`paginas/${p}.txt`, formatPageText(await readPageText(pdf, p)) + '\n');

    const hints = strip({ level: args.level, projectName: args.name, extra: args.hint });
    const building = strip({ groundSnowLoad: args.snow, buildingWidth: args.width, windSpeed: args.wind, exposure: args.exposure });
    const convert = strip({
      date: args.date,
      revision: args.revision,
      wallHeight: args.wallHeight,
      building: Object.keys(building).length > 0 ? building : undefined,
      floorsSupported: args.floors,
      floorSpan: args.floorSpan,
    });
    const req: ExtractRequest = { pdf, pages, hints, convert };
    const opts: ExtractOptions = strip({ model: args.model, effort: args.effort, maxTokens: args.maxTokens });

    let result: ExtractResult;
    if (args.dryRun) {
      const { params } = await buildRequest(req, opts);
      const summary = {
        model: params.model,
        max_tokens: params.max_tokens,
        effort: params.output_config.effort,
        system: params.system[0]?.text,
        pages,
        pdf_bytes: pdf.byteLength,
        content_blocks: (params.messages[0]?.content as unknown[]).map((b) => (b as { type: string }).type),
        schema: RESPONSE_SCHEMA,
      };
      write('pedido.json', JSON.stringify(summary, null, 2) + '\n');
      io.stdout(`dry-run: ${pages.length} página(s) → ${outDir} (paginas/, pedido.json); nada enviado`);
      return 0;
    } else if (args.response !== undefined) {
      const text = Buffer.from(io.readFile(resolve(cwd, args.response))).toString('utf8');
      result = finish(JSON.parse(text), convert, `gravado:${args.response}`, { inputTokens: 0, outputTokens: 0 });
    } else {
      result = await deps.extract(req, opts);
    }

    write('projeto.json', JSON.stringify(result.project, null, 2) + '\n');
    write('extracao.json', JSON.stringify(result.output, null, 2) + '\n');
    write('revisao.md', result.report);

    const openings = result.output.walls.reduce((n, w) => n + w.openings.length, 0);
    io.stdout(
      `${result.output.walls.length} parede(s), ${openings} abertura(s) → ${outDir} ` +
        `(${result.model}; ${result.usage.inputTokens} tokens de entrada, ${result.usage.outputTokens} de saída)`,
    );
    for (const w of result.warnings) io.stderr(`aviso: ${w}`);
    for (const p of result.problems) io.stderr(`problema: ${p}`);
    if (result.problems.length > 0) io.stderr('projeto.json precisa de ajuste antes do `panelizer build`; ver revisao.md');
    return 0;
  } catch (e) {
    if (e instanceof ExtractError) {
      io.stderr(`erro: ${e.message}`);
      if (e.rawText !== undefined) {
        write('resposta-bruta.txt', e.rawText);
        io.stderr(`  texto cru em ${join(outDir, 'resposta-bruta.txt')}`);
      }
      return 1;
    }
    if (e instanceof Anthropic.AuthenticationError) {
      io.stderr('erro: a API recusou a credencial — defina ANTHROPIC_API_KEY, ou use --dry-run / --response');
      return 1;
    }
    if (e instanceof Anthropic.APIError) {
      io.stderr(`erro da API (${e.status ?? '?'}): ${e.message}`);
      return 1;
    }
    if (e instanceof RangeError || e instanceof SyntaxError) {
      io.stderr(`erro: ${e.message}`);
      return 1;
    }
    io.stderr(`erro inesperado: ${(e as Error).stack ?? String(e)}`);
    return 1;
  }
}
