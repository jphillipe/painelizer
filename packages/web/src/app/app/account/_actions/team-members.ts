'use server';

import { revalidatePath } from 'next/cache';
import { ACCOUNT_HREF } from '@/lib/site-nav';
import { authActionClient } from '@/lib/safe-action';
import { memberRoleSchema, memberSchema } from '@/schemas/account';
import { removeMember, setMemberRole } from '@/services/team.service';

/** S32: admin troca o papel de alguém (o último admin não sai — trigger no banco). */
export const setMemberRoleAction = authActionClient.inputSchema(memberRoleSchema).action(async ({ parsedInput, ctx }) => {
  const result = await setMemberRole(parsedInput, ctx.user);
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});

/** S32: admin tira alguém do time (a conta continua no Supabase, sem acesso aos projetos). */
export const removeMemberAction = authActionClient.inputSchema(memberSchema).action(async ({ parsedInput, ctx }) => {
  const result = await removeMember(parsedInput, ctx.user);
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});
