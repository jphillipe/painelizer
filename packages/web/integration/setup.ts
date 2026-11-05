/**
 * Comum aos testes de integração (S33): as chaves do Supabase local, as contas semeadas e um prefixo por execução
 * nos nomes, para cada arquivo achar só o que criou (o banco local pode ter sobras de execuções anteriores).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import {
  localSupabaseEnv,
  seedAccounts,
  serviceClient,
  signedInClient,
  SKIP_REASON,
  type AccountId,
  type LocalSupabaseEnv,
  type SeededAccounts,
} from '../testing/local-supabase';

export const env: LocalSupabaseEnv | undefined = localSupabaseEnv();

/** `describe.skipIf(skip)`: sem Supabase local, o arquivo inteiro é pulado (o motivo sai no `global-setup.ts`). */
export const skip = env === undefined;

export interface World {
  env: LocalSupabaseEnv;
  seeded: SeededAccounts;
  service: SupabaseClient<Database>;
  as: Record<AccountId, SupabaseClient<Database>>;
}

/** Contas criadas/ajustadas e uma sessão de cada; chamar no `beforeAll`. */
export async function world(): Promise<World> {
  if (env === undefined) throw new Error(SKIP_REASON);
  const seeded = await seedAccounts(env);
  const [admin, editor, outsider, rival] = await Promise.all(
    (['admin', 'editor', 'outsider', 'rival'] as const).map((a) => signedInClient(env, a)),
  );
  return {
    env,
    seeded,
    service: serviceClient(env),
    as: { admin: admin!, editor: editor!, outsider: outsider!, rival: rival! },
  };
}

/** Prefixo único desta execução (`it-<base36>`), para nomes de projeto e pastas do bucket. */
export const RUN = `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Apaga, com a chave secret, os projetos cujo nome começa por `RUN`. */
export async function cleanProjects(service: SupabaseClient<Database>): Promise<void> {
  await service.from('projects').delete().like('name', `${RUN}%`);
}
