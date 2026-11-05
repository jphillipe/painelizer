import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './e2e/support';
import { localSupabaseEnv } from './testing/local-supabase';

/**
 * E2E (S33). Dois modos, decididos pelo ambiente:
 *
 * - **Com Supabase local** (`TEST_SUPABASE_*`, ver `testing/supabase-env.mjs`): login com as contas semeadas,
 *   projetos gravados no banco, F5 que recarrega do servidor, lista de projetos. É o job `e2e` do CI.
 * - **Sem Supabase** (o padrão na máquina sem Docker): o app roda sem login, os projetos vivem no navegador; os
 *   testes que exigem banco são pulados com o motivo.
 *
 * O servidor é `next dev` na 3100 (no CI, `next start` sobre o build do job). O `next dev` lê o `.env.local`, que
 * aponta para o projeto REAL e tem a chave da Anthropic: cada chave dele vai ZERADA (ou com a do Supabase local) no
 * ambiente do servidor — variável presente, mesmo vazia, vence o arquivo. (`NODE_ENV=test`, que pula o `.env.local`,
 * deixa o `next dev` 16 num laço de Fast Refresh que nunca hidrata o `/login`.) O Next 16 só aceita um `next dev` por
 * pasta: pare o `pnpm web` antes de `pnpm e2e`. Fora do `pnpm check`.
 * Navegador: no CI o Chromium do Playwright (`playwright install`); na máquina, o Chrome instalado
 * (`E2E_CHANNEL=chrome`, padrão fora do CI) — sem baixar navegador.
 */

const PORT = 3100;
// `localhost`, não `127.0.0.1`: o `next dev` 16 bloqueia os recursos de dev (HMR, chunks) para outra origem e a
// página nunca hidrata (`allowedDevOrigins`).
const baseURL = `http://localhost:${PORT}`;
const ci = process.env['CI'] !== undefined && process.env['CI'] !== '';
const supabase = localSupabaseEnv();
const channel = process.env['E2E_CHANNEL'] ?? (ci ? undefined : 'chrome');

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // Um projeto por vez: os fluxos com banco usam as mesmas contas; o app compila rotas na primeira visita (dev).
  workers: 1,
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: ci ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    ...(channel === undefined || channel === '' ? {} : { channel }),
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(channel === undefined || channel === '' ? {} : { channel }),
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: ci ? `pnpm exec next start -p ${PORT}` : `pnpm exec next dev -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !ci,
    timeout: 180_000,
    stdout: 'pipe',
    // Todas as chaves do `.env.example`: vazias = sem Supabase e sem IA; com o local, as chaves dele.
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: supabase?.url ?? '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase?.key ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SECRET_KEY: supabase?.secretKey ?? '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ANTHROPIC_API_KEY: '',
      EXTRACT_MODEL: '',
      EXTRACT_EFFORT: '',
    },
  },
});
