import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Testes de integração (S33): adaptadores reais e RLS contra o Supabase LOCAL (`supabase start`). Fora do `pnpm test`
 * e do `pnpm check` — sem `TEST_SUPABASE_*` cada arquivo é pulado com o motivo. Um arquivo por vez: os testes de time
 * mexem nas mesmas contas que os de RLS conferem.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['integration/**/*.int.test.ts'],
    globalSetup: ['integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
