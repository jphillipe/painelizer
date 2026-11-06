import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser, isAuthConfigured } from '@/services/auth.service';
import { invitePreview } from '@/services/team.service';
import { InviteView } from './_components/invite-view';

/** Sempre a request: o convite é lido do banco a cada visita (pode ter sido usado ou revogado). */
export const dynamic = 'force-dynamic';

/**
 * `/invite/<token>` (S41): o link que o admin gerou em `/app/account`. Público (fora do guard de `/app`): quem abre
 * ainda não tem conta. Mostra o time e o e-mail do convite e pede nome e senha; aceitar cria a conta e entra.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAuthConfigured()) return <InviteView token={token} preview={{ state: 'off', message: 'Accounts are not set up on this server.' }} />;
  const preview = await invitePreview(token, { admin: supabaseAdmin() });
  const signedInAs = preview.state === 'open' ? (await currentUser())?.email : undefined;
  return <InviteView token={token} preview={preview} {...(signedInAs === undefined || signedInAs === '' ? {} : { signedInAs })} />;
}
