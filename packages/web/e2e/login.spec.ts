import { expect, test } from '@playwright/test';
import { ACCOUNTS, NEEDS_SUPABASE, signIn, TEST_PASSWORD, withSupabase } from './support';

// Começa sem sessão (o projeto `chromium` carrega a do admin).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('login (Supabase local)', () => {
  test.skip(!withSupabase, NEEDS_SUPABASE);

  test('sem sessão, /app/projects manda ao login e volta para lá depois', async ({ page }) => {
    await page.goto('/app/projects');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fprojects$/);
    await signIn(page, ACCOUNTS.editor.email, 'wrong-password');
    await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, ACCOUNTS.editor.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/app\/projects$/);
    await expect(page.getByRole('heading', { name: 'Saved projects' })).toBeVisible();
  });

  test('sair limpa a sessão', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, ACCOUNTS.admin.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/app(\?|$)/);
    await page.getByRole('button', { name: `Account: ${ACCOUNTS.admin.email}` }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
  });

  test('conta sem time entra, mas não vê projetos', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, ACCOUNTS.outsider.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/app(\?|$)/);
    await page.goto('/app/projects');
    await expect(page.getByRole('link', { name: /House 28x40/ })).toHaveCount(0);
  });
});

test.describe('sem Supabase', () => {
  test.skip(withSupabase, 'só no modo sem Supabase');

  test('o app abre sem pedir login', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('button', { name: 'Extract walls with AI' })).toBeVisible();
  });
});
