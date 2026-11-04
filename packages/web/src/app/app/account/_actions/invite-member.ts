'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { emailLinkRedirect } from '@/lib/auth/routes';
import { ACCOUNT_HREF } from '@/lib/site-nav';
import { authActionClient } from '@/lib/safe-action';
import { supabaseAdminInvites } from '@/lib/supabase/admin';
import { inviteMemberSchema } from '@/schemas/account';
import { defaultDeps, inviteMember } from '@/services/team.service';

/**
 * S32: admin põe alguém no time. A chave *secret* do Supabase entra SÓ aqui (`supabaseAdminInvites`), para o
 * `inviteUserByEmail` de quem ainda não tem conta; o resto usa a sessão de quem convida e a RLS.
 */
export const inviteMemberAction = authActionClient.inputSchema(inviteMemberSchema).action(async ({ parsedInput, ctx }) => {
  const redirectTo = emailLinkRedirect(await headers(), 'invite');
  const result = await inviteMember({ ...parsedInput, redirectTo }, ctx.user, { ...defaultDeps, invites: supabaseAdminInvites() });
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});
