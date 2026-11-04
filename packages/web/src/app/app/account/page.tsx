import { secretKey } from '@/lib/supabase/admin';
import { currentUser, isAuthConfigured } from '@/services/auth.service';
import { myTeam } from '@/services/team.service';
import { AccountView } from './_components/account-view';

/** Conta e time (S32): `/app/account`. Sempre a request: usuário, time e papel vêm da sessão. */
export const dynamic = 'force-dynamic';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string; reset?: string }> }) {
  const params = await searchParams;
  const notice = params.welcome !== undefined ? 'welcome' : params.reset !== undefined ? 'reset' : undefined;
  if (!isAuthConfigured()) return <AccountView state="unconfigured" />;
  const user = await currentUser();
  if (user === undefined) return <AccountView state="unconfigured" />;
  const team = await myTeam(user);
  return (
    <AccountView
      state="ok"
      email={user.email}
      userId={user.id}
      team={team}
      invitesEnabled={secretKey() !== undefined}
      {...(notice === undefined ? {} : { notice })}
    />
  );
}
