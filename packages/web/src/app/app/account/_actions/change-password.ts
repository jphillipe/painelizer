'use server';

import { authActionClient } from '@/lib/safe-action';
import { changePasswordSchema } from '@/schemas/account';
import { changePassword } from '@/services/auth.service';

/** S32: troca de senha em `/app/account` (também o fim do link de recuperação e do convite). */
export const changePasswordAction = authActionClient.inputSchema(changePasswordSchema).action(async ({ parsedInput }) => changePassword(parsedInput.password));
