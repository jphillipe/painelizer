/**
 * Cliente de server actions (docs/10-design.md §7). Toda action passa por aqui: valida a entrada com zod e
 * traduz erros conhecidos em mensagem para a UI. Problemas de projeto não chegam aqui: os services os
 * devolvem em `data` como `{ ok: false, problems }`.
 *
 * `authActionClient` (S22.0): exige usuário quando o Supabase está configurado (o proxy já barra a página, mas
 * a action é um POST que pode chegar sem ela); sem Supabase deixa passar com `ctx.user` vazio. Só `signIn` e
 * `signOut` usam o `actionClient` cru.
 */

import { createSafeActionClient } from 'next-safe-action';
import { requireUser } from '@/services/auth.service';
import { toServiceError } from './http';

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    const se = toServiceError(e);
    if (se) return se.message;
    if (e instanceof Error && (e.name === 'ProjectError' || e.name === 'BuildError' || e.name === 'ExtractError' || e.name === 'SignedOutError')) {
      return e.message;
    }
    console.error(e);
    return 'Something went wrong on the server.';
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  const user = await requireUser();
  return next({ ctx: { user } });
});
