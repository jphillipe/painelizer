/**
 * Ponto de execução: `tsx src/cli.ts build <projeto.json> --out <dir>`.
 * Via `pnpm panelizer …`, o cwd do script é `packages/cli`; `INIT_CWD` é onde o usuário chamou o pnpm.
 */
import { run } from './main';

process.exitCode = run(process.argv.slice(2), undefined, process.env['INIT_CWD'] ?? process.cwd());
