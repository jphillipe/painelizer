import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/services/auth.service';
import { UserMenu } from './site-header';

/**
 * Área do usuário do header, lida no servidor (S22.0) e transmitida em streaming (2026-10-23): o `AppShell`
 * a envolve num `Suspense`, então o resto da página chega antes de o Supabase responder quem está logado.
 * Antes, o layout inteiro esperava `currentUser()` em toda navegação.
 */
export async function HeaderUser() {
  const user = await currentUser();
  return user === undefined ? null : <UserMenu user={user} />;
}

/** O lugar do avatar enquanto o usuário não chegou: mesma caixa, sem pulo de layout. */
export function HeaderUserSkeleton() {
  return (
    <div className="flex items-center gap-2.5 py-1 pr-2.5 pl-1" aria-busy="true" aria-label="Loading account">
      <Skeleton className="size-9 rounded-pill bg-paper/15" />
      <Skeleton className="hidden h-3 w-40 bg-paper/15 md:block" />
    </div>
  );
}
