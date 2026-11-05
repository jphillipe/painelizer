/**
 * Comum aos testes e2e (S33): o modo (com ou sem Supabase local), as contas e os passos que vários fluxos repetem.
 * Os seletores são os nomes acessíveis que a tela mostra (botões, rótulos), não classes.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { ACCOUNTS, localSupabaseEnv, SKIP_REASON, TEST_PASSWORD } from '../testing/local-supabase';

export const withSupabase = localSupabaseEnv() !== undefined;
export const NEEDS_SUPABASE = SKIP_REASON;
export { ACCOUNTS, TEST_PASSWORD };

/** Cookies da sessão do admin, gravados pelo `auth.setup.ts` (vazio sem Supabase). Fora do git. */
export const STORAGE_STATE = 'e2e/.auth/admin.json';

/** O sample "House 28×40" (5 paredes, 12 painéis): pequeno, sem leitura da IA, com planta. */
export const SAMPLE = { button: /House 28×40/, name: 'House 28x40 (overview)', walls: 5, panels: 12 } as const;

/** `/app` → clica o cartão do sample → editor aberto (passo 02). */
export async function openSample(page: Page): Promise<void> {
  await page.goto('/app');
  // O cartão aparece no HTML do servidor antes de o React hidratar (no `next dev`, segundos): um clique cedo demais
  // se perde em silêncio. Repete até o editor abrir.
  await expect(async () => {
    await page.getByRole('button', { name: SAMPLE.button }).click({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Generate panels' })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByText(`Ready · ${SAMPLE.panels} panels`)).toBeVisible();
}

/** Seleciona a parede na lista e troca a altura no inspetor (confirma com Enter, como o revisor). */
export async function setWallHeight(page: Page, wallId: string, height: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${wallId}\\b`) }).click();
  const field = page.getByLabel('Height', { exact: true });
  await field.fill(height);
  await field.press('Enter');
  await expect(field).toHaveValue(height);
}

/** Com Supabase: espera o auto-save terminar e devolve o id do projeto na URL (`/app/projects/<id>`). */
export async function waitSaved(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
  await expect(page.getByText(/^Saved/)).toBeVisible();
  const id = /\/app\/projects\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (id === undefined) throw new Error(`sem id na URL: ${page.url()}`);
  return id;
}

/**
 * Espera o React assumir o elemento (hidratação): antes disso um clique se perde ou, num formulário, vira o submit
 * nativo do navegador (GET com os campos na URL). O React marca o nó com chaves `__reactProps…`.
 */
export async function hydrated(locator: Locator): Promise<void> {
  const isHydrated = (el: Element): boolean => Object.keys(el).some((k) => k.startsWith('__reactProps'));
  // O `next dev` às vezes recarrega a página logo depois da primeira compilação: contexto destruído = ainda não.
  await expect
    .poll(() => locator.evaluate(isHydrated, undefined, { timeout: 5_000 }).catch(() => false), { timeout: 60_000 })
    .toBe(true);
}

/** Login pelo formulário de `/login` (depois da hidratação). */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await hydrated(page.getByRole('button', { name: 'Sign in', exact: true }));
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
