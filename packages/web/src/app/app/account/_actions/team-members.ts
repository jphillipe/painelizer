'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requestOrigin } from '@/lib/auth/routes';
import { ACCOUNT_HREF } from '@/lib/site-nav';
import { authActionClient } from '@/lib/safe-action';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { memberDisabledSchema, memberNameSchema, memberRoleSchema, memberSchema } from '@/schemas/account';
import { defaultDeps, deleteMemberAccount, memberResetLink, removeMember, setMemberDisabled, setMemberName, setMemberRole } from '@/services/team.service';

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

/** S41: admin muda o nome de alguém do time. */
export const setMemberNameAction = authActionClient.inputSchema(memberNameSchema).action(async ({ parsedInput, ctx }) => {
  const result = await setMemberName(parsedInput, ctx.user);
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});

/** S41: link de nova senha para alguém do time (chave secret). Não muda nada na tela: só devolve o link. */
export const memberResetLinkAction = authActionClient.inputSchema(memberSchema).action(async ({ parsedInput, ctx }) => {
  const origin = requestOrigin(await headers());
  return memberResetLink({ userId: parsedInput.userId, origin }, ctx.user, { ...defaultDeps, admin: supabaseAdmin() });
});

/** S41: desativar ou reativar a conta (chave secret). */
export const setMemberDisabledAction = authActionClient.inputSchema(memberDisabledSchema).action(async ({ parsedInput, ctx }) => {
  const result = await setMemberDisabled(parsedInput, ctx.user, { ...defaultDeps, admin: supabaseAdmin() });
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});

/** S41: apagar a conta de vez (chave secret). */
export const deleteMemberAccountAction = authActionClient.inputSchema(memberSchema).action(async ({ parsedInput, ctx }) => {
  const result = await deleteMemberAccount(parsedInput, ctx.user, { ...defaultDeps, admin: supabaseAdmin() });
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});
