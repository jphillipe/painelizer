#!/usr/bin/env node
/**
 * `supabase status -o env` (ou `-o json`) na entrada → as três variáveis dos testes contra o Supabase local (S33):
 * TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY e TEST_SUPABASE_SECRET_KEY, uma por linha (`KEY=value`).
 *
 *   supabase status -o env | node packages/web/testing/supabase-env.mjs >> "$GITHUB_ENV"     # CI
 *   eval "$(supabase status -o env | node packages/web/testing/supabase-env.mjs --export)"   # Git Bash/WSL
 *
 * Aceita os nomes novos (`PUBLISHABLE_KEY`, `SECRET_KEY`) e os antigos (`ANON_KEY`, `SERVICE_ROLE_KEY`) da CLI, e
 * JSON com as chaves em qualquer nível. Não imprime nada além das três linhas; falta alguma → sai com erro.
 */

import { readFileSync } from 'node:fs';

const input = readFileSync(0, 'utf8');

/** Todas as chaves → valor de texto, de um JSON (em qualquer nível) ou de linhas `KEY="value"`. */
function variables(text) {
  const found = new Map();
  try {
    const walk = (v) => {
      if (v === null || typeof v !== 'object') return;
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'string' && !found.has(k.toUpperCase())) found.set(k.toUpperCase(), x);
        else walk(x);
      }
    };
    walk(JSON.parse(text));
    if (found.size > 0) return found;
  } catch {
    /* não é JSON: linhas */
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m === null) continue;
    found.set(m[1].toUpperCase(), m[2].replace(/^(['"])(.*)\1$/, '$2'));
  }
  return found;
}

const vars = variables(input);
const pick = (...names) => names.map((n) => vars.get(n)).find((v) => v !== undefined && v !== '');
const out = {
  TEST_SUPABASE_URL: pick('API_URL', 'SUPABASE_URL'),
  TEST_SUPABASE_PUBLISHABLE_KEY: pick('PUBLISHABLE_KEY', 'ANON_KEY'),
  TEST_SUPABASE_SECRET_KEY: pick('SECRET_KEY', 'SERVICE_ROLE_KEY'),
};
const missing = Object.entries(out)
  .filter(([, v]) => v === undefined)
  .map(([k]) => k);
if (missing.length > 0) {
  console.error(
    `supabase-env: faltou ${missing.join(', ')} na saída do \`supabase status\` (chaves vistas: ${[...vars.keys()].join(', ') || 'nenhuma'})`,
  );
  process.exit(1);
}
const prefix = process.argv.includes('--export') ? 'export ' : '';
for (const [k, v] of Object.entries(out)) console.log(`${prefix}${k}=${v}`);
