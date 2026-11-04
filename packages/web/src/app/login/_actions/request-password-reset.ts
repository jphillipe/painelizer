'use server';

import { headers } from 'next/headers';
import { emailLinkRedirect } from '@/lib/auth/routes';
import { actionClient } from '@/lib/safe-action';
import { forgotPasswordSchema } from '@/schemas/account';
import { requestPasswordReset } from '@/services/auth.service';

/** S32: "Forgot password?" no `/login` — sem sessão, por isso o `actionClient` cru. Mesma resposta com ou sem conta. */
export const requestPasswordResetAction = actionClient.inputSchema(forgotPasswordSchema).action(async ({ parsedInput }) => requestPasswordReset(parsedInput.email, emailLinkRedirect(await headers(), 'recovery')));
