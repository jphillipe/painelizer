// ESLint (S27): uma config para o monorepo. `pnpm lint` na raiz lint tudo; `pnpm --filter <pacote> lint` só o
// pacote (o ESLint acha este arquivo subindo a partir de cada arquivo).
//
// Sem regras que dependem de tipo (`projectService`): o TypeScript do projeto é o 7 (nativo, sem API JS) e o
// typescript-eslint só conversa com o 5.x/6.0 — o `typescript` da raiz (6.0) serve só de parser ao lint; o
// typecheck de verdade continua no `tsc` 7 de cada pacote. Formatação é do Prettier, não daqui.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';

// Absoluto: `pnpm --filter web lint` roda de dentro de packages/web.
const webRoot = fileURLToPath(new URL('./packages/web/', import.meta.url));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      'out/**',
      'docs/**',
      'packages/web/next-env.d.ts',
    ],
  },
  {
    // Um `eslint-disable` que não desliga nada é erro: eles ficaram meses sem ESLint instalado (doc 13 §D).
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // O tsc 7 já acusa (noUnusedLocals/noUnusedParameters); aqui só o que ele não vê, com o `_` de praxe.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Node: CLI, extract, scripts da raiz, configs e testes.
    files: [
      'packages/cli/**',
      'packages/extract/**',
      'scripts/**',
      '*.{js,mjs,cjs,ts}',
      'packages/*/*.{js,mjs,cjs,ts}',
      '**/test/**',
      '**/*.test.{ts,tsx}',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Core: só ECMAScript (CLAUDE.md: funções puras). Quem barra DOM/Node de verdade é o `lib` do tsconfig.
    files: ['packages/core/src/**'],
    languageOptions: { globals: {} },
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    settings: { next: { rootDir: webRoot } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
);
