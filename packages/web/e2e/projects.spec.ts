import { expect, test } from '@playwright/test';
import { NEEDS_SUPABASE, openSample, SAMPLE, setWallHeight, waitSaved, withSupabase } from './support';

test.describe('lista de projetos (Supabase local)', () => {
  test.skip(!withSupabase, NEEDS_SUPABASE);

  test('o projeto salvo aparece na lista, a busca acha e o nome abre o editor', async ({ page }) => {
    await openSample(page);
    await setWallHeight(page, 'W02', `8'-0"`);
    const id = await waitSaved(page);

    await page.goto('/app/projects');
    await expect(page.getByRole('heading', { name: 'Saved projects' })).toBeVisible();
    const link = page.locator(`a[href="/app/projects/${id}"]`);
    await expect(link).toHaveText(SAMPLE.name);

    await page.getByPlaceholder('Search by name').fill('28x40');
    await page.getByPlaceholder('Search by name').press('Enter');
    await expect(page).toHaveURL(/[?&]q=28x40/);
    await expect(link).toBeVisible();
    await page.getByPlaceholder('Search by name').fill('no-such-project-xyz');
    await page.getByPlaceholder('Search by name').press('Enter');
    await expect(link).toHaveCount(0);

    await page.goto('/app/projects');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/app/projects/${id}$`));
    await page.getByRole('button', { name: /^W02\b/ }).click();
    await expect(page.getByLabel('Height', { exact: true })).toHaveValue(`8'-0"`);
  });

  test('mandar para a lixeira e restaurar', async ({ page }) => {
    await openSample(page);
    await setWallHeight(page, 'W03', `8'-6"`);
    const id = await waitSaved(page);
    await page.goto('/app/projects');
    const row = page.getByRole('row').filter({ has: page.locator(`a[href="/app/projects/${id}"]`) });
    await row.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('menuitem', { name: /Move to trash/ }).click();
    await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
    await expect(page.locator(`a[href="/app/projects/${id}"]`)).toHaveCount(0);

    await page.getByRole('link', { name: 'Trash', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
    const trashed = page.getByRole('row').filter({ has: page.locator(`a[href="/app/projects/${id}"]`) });
    await trashed.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await expect(page.getByText(/^Restored /)).toBeVisible();

    await page.goto('/app/projects');
    await expect(page.locator(`a[href="/app/projects/${id}"]`)).toBeVisible();
  });
});

test.describe('lista sem Supabase', () => {
  test.skip(withSupabase, 'só no modo sem Supabase');

  test('explica que os projetos ficam no navegador', async ({ page }) => {
    await page.goto('/app/projects');
    await expect(page.getByText('Projects are not saved on this server')).toBeVisible();
  });
});
