/**
 * Ponto de execução: `tsx src/cli.ts <planta.pdf> --out <dir>`.
 * Via `pnpm extract …` na raiz, o cwd do script é `packages/extract`; `INIT_CWD` é onde o usuário chamou o pnpm.
 */
import { run } from './main';

process.exitCode = await run(process.argv.slice(2), undefined, process.env['INIT_CWD'] ?? process.cwd());
