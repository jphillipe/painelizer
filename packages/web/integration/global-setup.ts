import { localSupabaseEnv, SKIP_REASON } from '../testing/local-supabase';

/**
 * Uma vez antes dos arquivos (S33): diz por que tudo foi pulado (o vitest não mostra o console de arquivo pulado) ou
 * onde está o Supabase local. As contas são preparadas por arquivo, no `world()` de `setup.ts`. Lança se a URL de
 * `TEST_SUPABASE_URL` não for da máquina.
 */
export default function setup(): void {
  const env = localSupabaseEnv();
  if (env === undefined) console.warn(`\n[integration] todos os testes pulados — ${SKIP_REASON}\n`);
  else console.log(`[integration] Supabase local em ${env.url}.`);
}
