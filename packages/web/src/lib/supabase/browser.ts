'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { SupabaseEnv } from './env';

/**
 * Cliente do Supabase no navegador (S22.3): sobe os desenhos direto ao Storage e baixa os de um projeto reaberto,
 * sem passar pelo app (o Cloud Run corta pedidos em 32 MB). A sessão é a mesma do login — `@supabase/ssr` lê o
 * cookie que o servidor gravou. A URL e a chave publicável chegam do servidor por props (`supabaseEnv()` na
 * request): o build do Cloud Run não tem variáveis, então `NEXT_PUBLIC_*` não entra no bundle do cliente.
 * Um cliente por URL, reaproveitado entre renders.
 */
const clients = new Map<string, SupabaseClient<Database>>();

export function supabaseBrowser(env: SupabaseEnv): SupabaseClient<Database> {
  const key = `${env.url}|${env.key}`;
  let client = clients.get(key);
  if (client === undefined) {
    client = createBrowserClient<Database>(env.url, env.key);
    clients.set(key, client);
  }
  return client;
}
