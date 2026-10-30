/**
 * Mede leituras do Ringgold contra a verdade contada à mão (`test/eval/ringgold-truth.json`).
 *
 * Uso: `pnpm --filter extract eval <leitura.json> [outra.json …] [--truth <verdade.json>]`
 * Aceita `extracao.json` (saída do modelo) ou um `.panelizer.json` do app (a leitura em `$panelizer.reading.output`).
 * Imprime um relatório por arquivo; com dois ou mais, dá para comparar antes/depois ou duas leituras iguais.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateReading, formatEvalReport, type ReadingTruth } from '../src/eval';
import { ExtractionOutput } from '../src/schema';

const DEFAULT_TRUTH = new URL('../test/eval/ringgold-truth.json', import.meta.url);

function readingFrom(path: string): ExtractionOutput {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const stored = (raw['$panelizer'] as { reading?: { output?: unknown } } | undefined)?.reading?.output;
  const parsed = ExtractionOutput.safeParse(stored ?? raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`${path}: não é uma leitura válida (${issues.join('; ')})`);
  }
  return parsed.data;
}

function main(argv: string[]): number {
  const files: string[] = [];
  let truthPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--truth') truthPath = argv[++i];
    else files.push(a);
  }
  if (files.length === 0) {
    process.stderr.write('uso: eval <leitura.json> [outra.json …] [--truth <verdade.json>]\n');
    return 2;
  }
  const truth = JSON.parse(readFileSync(truthPath === undefined ? DEFAULT_TRUTH : resolve(truthPath), 'utf8')) as ReadingTruth;
  const reports = files.map((f) => formatEvalReport(evaluateReading(readingFrom(resolve(f)), truth), f));
  process.stdout.write(reports.join('\n\n') + '\n');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
