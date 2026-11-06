'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requestOrigin } from '@/lib/auth/routes';
import { ACCOUNT_HREF } from '@/lib/site-nav';
import { authActionClient } from '@/lib/safe-action';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { inviteMemberSchema } from '@/schemas/account';
import { defaultDeps, inviteMember } from '@/services/team.service';

/**
 * Admin põe alguém no time (S32) ou gera o convite por link (S41). A chave *secret* entra só nas actions de conta
 * (`supabaseAdmin`); a inclusão em si usa a sessão de quem convida e a RLS. O link volta uma vez, para copiar.
 */
export const inviteMemberAction = authActionClient.inputSchema(inviteMemberSchema).action(async ({ parsedInput, ctx }) => {
  const origin = requestOrigin(await headers());
  const result = await inviteMember({ ...parsedInput, origin }, ctx.user, { ...defaultDeps, admin: supabaseAdmin() });
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});
