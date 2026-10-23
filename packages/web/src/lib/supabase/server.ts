import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { supabaseEnv } from './env';

/**
 * Cliente do Supabase no servidor (S22.0), um por requisição, com a sessão nos cookies (`@supabase/ssr`).
 * `undefined` quando as chaves não estão no ambiente: o app roda sem login. Só services importam isto
 * (docs/10-design.md §7). Em Server Components o Next não deixa gravar cookies: o `setAll` engole o erro e o
 * refresh do token fica a cargo do `src/proxy.ts`, que roda antes e grava na resposta.
 */
export async function supabaseServer(): Promise<SupabaseClient<Database> | undefined> {
  const env = supabaseEnv();
  if (env === undefined) return undefined;
  const store = await cookies();
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* Server Component: o proxy cuida do refresh. */
        }
      },
    },
  });
}
