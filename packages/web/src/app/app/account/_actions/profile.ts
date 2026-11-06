'use server';

import { revalidatePath } from 'next/cache';
import { ACCOUNT_HREF } from '@/lib/site-nav';
import { authActionClient } from '@/lib/safe-action';
import { myNameSchema } from '@/schemas/account';
import { setMyName } from '@/services/team.service';

/** S41: o próprio nome de exibição. */
export const setMyNameAction = authActionClient.inputSchema(myNameSchema).action(async ({ parsedInput, ctx }) => {
  const result = await setMyName(parsedInput, ctx.user);
  if (result.ok) revalidatePath(ACCOUNT_HREF);
  return result;
});
