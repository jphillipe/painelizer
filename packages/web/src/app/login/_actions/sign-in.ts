'use server';

import { actionClient } from '@/lib/safe-action';
import { signInSchema } from '@/schemas/auth';
import { signIn } from '@/services/auth.service';

/** Login (S22.0): grava a sessão nos cookies; credencial errada volta em `data.ok === false`, não como erro de servidor. */
export const signInAction = actionClient.inputSchema(signInSchema).action(async ({ parsedInput }) => signIn(parsedInput.email, parsedInput.password));
