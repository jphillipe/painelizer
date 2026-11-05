import { localSupabaseEnv, seedAccounts } from '../testing/local-supabase';

/** Antes de tudo (S33): com Supabase local, as contas de teste existem e estão no time certo; sem ele, nada. */
export default async function globalSetup(): Promise<void> {
  const env = localSupabaseEnv();
  if (env === undefined) {
    console.log('[e2e] sem Supabase local: app sem login; login e lista de projetos pulados (rodam no CI, job e2e).');
    return;
  }
  await seedAccounts(env);
  console.log(`[e2e] Supabase local em ${env.url}: contas de teste prontas.`);
}
