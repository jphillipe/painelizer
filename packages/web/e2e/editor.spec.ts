import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { openSample, SAMPLE, setWallHeight, waitSaved, withSupabase } from './support';

const EDITED = `9'-1 1/8"`;

test('sample → editar → F5 retoma a edição', async ({ page }) => {
  await openSample(page);
  await setWallHeight(page, 'W01', EDITED);

  if (withSupabase) {
    // Sample vira projeto no servidor na primeira edição (S23, A6); o F5 recarrega do banco.
    const id = await waitSaved(page);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/app/projects/${id}`));
  } else {
    // Sem servidor, a sessão fica no localStorage (M2: 500 ms depois da edição e no `beforeunload`) e `/app`
    // oferece retomá-la.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('panelizer.session.v1') !== null)).toBe(true);
    await page.reload();
    await expect(page.getByText(`Resume “${SAMPLE.name}”?`)).toBeVisible();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
  }

  await expect(page.getByRole('button', { name: 'Generate panels' })).toBeVisible();
  await page.getByRole('button', { name: /^W01\b/ }).click();
  await expect(page.getByLabel('Height', { exact: true })).toHaveValue(EDITED);
});

test('gerar painéis e baixar o PDF das folhas', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Generate panels' }).click();
  await expect(page.getByText(`${SAMPLE.panels} panels`, { exact: true })).toBeVisible();
  if (withSupabase) await expect(page).toHaveURL(/\/panels$/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-sheets\.pdf$/);
  const path = await download.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  // A planta de painéis e uma folha por painel (M9).
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(SAMPLE.panels + 1);
});
