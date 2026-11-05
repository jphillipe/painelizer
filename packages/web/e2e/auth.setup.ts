import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { ACCOUNTS, signIn, STORAGE_STATE, TEST_PASSWORD, withSupabase } from './support';

/**
 * Sessão do admin para os outros testes (S33): com Supabase, entra pelo formulário e guarda os cookies; sem ele, um
 * estado vazio (o app não pede login).
 */
setup('sessão do admin', async ({ page }) => {
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  if (!withSupabase) {
    writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  await page.goto('/login');
  await signIn(page, ACCOUNTS.admin.email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/app(\?|$)/);
  await page.context().storageState({ path: STORAGE_STATE });
});
