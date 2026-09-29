#!/usr/bin/env node
// Executa o CLI direto do TypeScript, sem passo de build, via tsx.
import { tsImport } from 'tsx/esm/api';

const { run } = await tsImport('../src/main.ts', import.meta.url);
process.exitCode = run(process.argv.slice(2), undefined, process.env.INIT_CWD ?? process.cwd());
