'use server';

import { actionClient } from '@/lib/safe-action';
import { signOut } from '@/services/auth.service';

/** Sair (S22.0): limpa a sessão dos cookies. */
export const signOutAction = actionClient.action(async () => {
  await signOut();
  return { ok: true as const };
});
