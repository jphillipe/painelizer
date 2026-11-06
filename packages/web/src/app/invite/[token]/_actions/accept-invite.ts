'use server';

import { actionClient } from '@/lib/safe-action';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acceptInviteSchema } from '@/schemas/account';
import { signIn } from '@/services/auth.service';
import { acceptInvite } from '@/services/team.service';

/**
 * S41: aceitar o convite — sem sessão (`actionClient` cru, como o login). Cria a conta com a chave secret e, em
 * seguida, entra com a senha escolhida (a sessão vai nos cookies). Se o login logo depois falhar, a conta já existe:
 * a tela manda para `/login`.
 */
export const acceptInviteAction = actionClient.inputSchema(acceptInviteSchema).action(async ({ parsedInput }) => {
  const result = await acceptInvite(parsedInput.token, { name: parsedInput.name, password: parsedInput.password }, { admin: supabaseAdmin() });
  if (!result.ok) return result;
  const signed = await signIn(result.email, parsedInput.password);
  return { ok: true as const, email: result.email, signedIn: signed.ok };
});
