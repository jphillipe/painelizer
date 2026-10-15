#!/usr/bin/env node
// Executa o comando direto do TypeScript, sem passo de build, via tsx.
import { tsImport } from 'tsx/esm/api';

const { run } = await tsImport('../src/main.ts', import.meta.url);
process.exitCode = await run(process.argv.slice(2), undefined, process.env.INIT_CWD ?? process.cwd());
