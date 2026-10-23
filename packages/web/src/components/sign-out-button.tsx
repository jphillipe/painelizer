'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { toast } from 'sonner';
import { signOutAction } from '@/app/login/_actions/sign-out';

/** Usuário logado e "Sign out" no header (S22.0). Sair limpa a sessão e vai ao login. */
export function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  const { execute, isPending } = useAction(signOutAction, {
    onSuccess: () => {
      router.push('/login');
      router.refresh();
    },
    onError: () => toast.error('Could not sign out. Try again.'),
  });
  return (
    <span className="flex items-center gap-4 text-sm">
      <span className="hidden text-paper/70 sm:inline" title={email}>
        {email}
      </span>
      <button type="button" onClick={() => execute()} disabled={isPending} className="border-b-2 border-transparent pb-0.5 font-semibold hover:border-gold-300 disabled:opacity-60">
        {isPending ? 'Signing out…' : 'Sign out'}
      </button>
    </span>
  );
}
