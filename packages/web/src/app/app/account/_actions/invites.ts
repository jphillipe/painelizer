'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requestOrigin } from '@/lib/auth/routes';
import { ACCOUNT_HREF } from '@/lib/site-nav';
import { authActionClient } from '@/lib/safe-action';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { inviteIdSchema } from '@/schemas/account';
import { defaultDeps, renewInvite, revokeInvite } from '@/services/team.service';

/** S41: link novo para um convite pendente (o anterior deixa de valer). */
export const renewInviteAction = authActionClient.inputSchema(inviteIdSchema).action(async ({ parsedInput, ctx }) => {
  const origin = requestOrigin(await headers());
  const result = await renewInvite({ id: parsedInput.id, origin }, ctx.user, { ...defaultDeps, admin: supabaseAdmin() });
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});

/** S41: retira um convite pendente. */
export const revokeInviteAction = authActionClient.inputSchema(inviteIdSchema).action(async ({ parsedInput, ctx }) => {
  const result = await revokeInvite(parsedInput, ctx.user);
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});
