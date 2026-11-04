/**
 * Lê um CONJUNTO de arquivos (vários PDFs e/ou imagens, como o Horace: uma folha por PDF) com a mesma seleção
 * automática do app, e grava o que o CLI grava: `projeto.json`, `extracao.json`, `revisao.md`, `paginas/`,
 * `recortes/` (dry-run) e `pedido.json`. O CLI (`src/main.ts`) recebe um PDF só; este script é o caminho para
 * medir leituras de conjuntos (2026-10-30).
 *
 * Uso: `pnpm --filter extract read-set --out <dir> [--level 1] [--dry-run] [--no-tiles] [--effort high] <arquivo|pasta> …`
 * Uma pasta entra com todos os PDFs dela (sem recursão). Precisa de ANTHROPIC_API_KEY, exceto com --dry-run.
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { buildRequest, ExtractError, extractWalls, type Effort, type ExtractOptions, type ExtractRequest, type ExtractSource } from '../src/client';
import { formatPageText } from '../src/pdf';
import type { ImageMediaType } from '../src/prompt';

const IMAGE_TYPES: Record<string, ImageMediaType> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function sourcesFrom(paths: string[]): ExtractSource[] {
  const out: ExtractSource[] = [];
  const add = (file: string) => {
    const ext = extname(file).toLowerCase();
    const data = new Uint8Array(readFileSync(file));
    if (ext === '.pdf') out.push({ kind: 'pdf', name: basename(file), data });
    else if (IMAGE_TYPES[ext] !== undefined) out.push({ kind: 'image', name: basename(file), data, mediaType: IMAGE_TYPES[ext] });
  };
  for (const p of paths) {
    const abs = resolve(p);
    if (statSync(abs).isDirectory()) {
      for (const f of readdirSync(abs).sort()) add(join(abs, f));
    } else add(abs);
  }
  return out;
}

async function main(argv: string[]): Promise<number> {
  const inputs: string[] = [];
  let out: string | undefined;
  let level: number | undefined;
  let dryRun = false;
  let tiles: boolean = true;
  let effort: Effort | undefined;
  let maxPerPage: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--out') out = argv[++i];
    else if (a === '--level') level = Number(argv[++i]);
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--no-tiles') tiles = false;
    else if (a === '--max-tiles') maxPerPage = Number(argv[++i]);
    else if (a === '--effort') effort = argv[++i] as Effort;
    else inputs.push(a);
  }
  if (out === undefined || inputs.length === 0) {
    process.stderr.write('uso: read-set --out <dir> [--level n] [--dry-run] [--no-tiles] [--max-tiles n] [--effort e] <arquivo|pasta> …\n');
    return 2;
  }
  const outDir = resolve(out);
  const write = (name: string, content: string | Uint8Array) => {
    const target = join(outDir, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const sources = sourcesFrom(inputs);
  process.stdout.write(`${sources.length} arquivo(s)\n`);
  const req: ExtractRequest = {
    sources,
    ...(level === undefined ? {} : { hints: { level } }),
    tiles: tiles === false ? false : maxPerPage === undefined ? true : { maxPerPage },
  };
  const opts: ExtractOptions = { ...(effort === undefined ? {} : { effort }) };

  const started = Date.now();
  const { params, pagesSent, pagesDropped, tiles: tileInfo, tileWarnings, selectionWarnings, pdfs, textChars, provenance } = await buildRequest(req, opts);
  // O texto posicionado já vem lido em cada `PdfInput` (S25: sem reabrir o PDF nem procurar a fonte pelo nome).
  for (const input of pdfs) {
    for (const t of input.pages) write(`paginas/${input.name.replace(/\.pdf$/i, '')}-${t.page}.txt`, formatPageText(t) + '\n');
  }
  const tilesWritten: Record<string, unknown>[] = [];
  for (const input of pdfs) {
    for (const t of input.tiles ?? []) {
      const file = `recortes/${input.name.replace(/\.pdf$/i, '')}-p${t.page}-l${t.tile.row}c${t.tile.col}.${t.tile.mediaType === 'image/png' ? 'png' : 'jpg'}`;
      if (dryRun) write(file, t.tile.data);
      tilesWritten.push({ file, sheet: t.sheet ?? null, dpi: t.grid.dpi, width: t.tile.width, height: t.tile.height, bytes: t.tile.data.byteLength });
    }
  }
  write(
    'pedido.json',
    JSON.stringify(
      {
        model: params.model,
        effort: params.output_config.effort,
        provenance,
        text_chars: textChars,
        pagesSent,
        pagesDropped,
        tiles: tilesWritten,
        tiles_encoded_bytes: tileInfo.encodedBytes,
        content_blocks: (params.messages[0]?.content as { type: string }[]).map((b) => b.type),
        tileWarnings,
      },
      null,
      2,
    ) + '\n',
  );
  const pages = pagesSent.reduce((n, p) => n + p.pages.length, 0);
  process.stdout.write(`${pages} página(s) de ${pagesSent.length} PDF(s), ${pagesDropped.length} fora, ${tileInfo.count} recorte(s) (${(tileInfo.encodedBytes / 1048576).toFixed(1)} MB) em ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  for (const w of [...selectionWarnings, ...tileWarnings]) process.stderr.write(`aviso: ${w}\n`);
  if (dryRun) {
    process.stdout.write(`dry-run → ${outDir}; nada enviado\n`);
    return 0;
  }

  let result: Awaited<ReturnType<typeof extractWalls>>;
  try {
    result = await extractWalls(req, {
      ...opts,
      onProgress: (p) => process.stderr.write(`\r${p.phase} · ${p.outputTokens} tokens de saída${p.inputTokens === undefined ? '' : ` (${p.inputTokens} de entrada)`}   `),
    });
  } catch (e) {
    process.stderr.write('\n');
    // Como o CLI: o texto cru fica no disco para a falha ser estudada (resposta cortada, JSON inválido, recusa).
    if (e instanceof ExtractError && e.rawText !== undefined) {
      write('resposta-bruta.txt', e.rawText);
      process.stderr.write(`texto cru em ${join(outDir, 'resposta-bruta.txt')}\n`);
    }
    throw e;
  }
  process.stderr.write('\n');
  write('projeto.json', JSON.stringify(result.project, null, 2) + '\n');
  write('extracao.json', JSON.stringify(result.output, null, 2) + '\n');
  write('revisao.md', result.report);
  write('resultado.json', JSON.stringify({ model: result.model, provenance: result.provenance, usage: result.usage, pagesSent: result.pagesSent, pagesDropped: result.pagesDropped, tilesSent: result.tilesSent, warnings: result.warnings, problems: result.problems, seconds: Math.round((Date.now() - started) / 1000) }, null, 2) + '\n');
  const openings = result.output.walls.reduce((n, w) => n + w.openings.length, 0);
  process.stdout.write(`${result.output.walls.length} parede(s), ${openings} abertura(s), ${result.output.rooms.length} cômodo(s) → ${outDir} (${result.usage.inputTokens} in / ${result.usage.outputTokens} out, ${Math.round((Date.now() - started) / 1000)} s)\n`);
  for (const w of result.warnings) process.stderr.write(`aviso: ${w}\n`);
  for (const p of result.problems) process.stderr.write(`problema: ${p}\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`erro: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    process.exitCode = 1;
  },
);
