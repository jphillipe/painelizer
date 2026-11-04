import { NextResponse } from 'next/server';
import { AFTER_RECOVERY, LOGIN_PATH, safeNext } from '@/lib/auth/routes';
import { verifyEmailLink, type EmailLink, type EmailLinkType } from '@/services/auth.service';

/** Sempre a request: abre sessão a partir do link e grava cookies. */
export const dynamic = 'force-dynamic';

const TYPES: readonly EmailLinkType[] = ['invite', 'recovery', 'signup', 'magiclink', 'email_change', 'email'];

/**
 * Link de e-mail do Supabase (S32): convite de um admin ou "esqueci a senha". Com `token_hash` + `type` (modelos de
 * e-mail do `supabase/README.md`, "S32 — aplicar") ou `code` (modelo padrão, fluxo PKCE no mesmo navegador), abre a
 * sessão — os cookies saem pelo cliente do servidor — e leva a `next` (a conta, para escolher a senha). Link velho
 * ou usado volta ao `/login` com a mensagem.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailLinkType | null;
  const code = params.get('code');
  const next = safeNext(params.get('next') ?? (type === 'recovery' ? AFTER_RECOVERY : undefined));
  const link: EmailLink | undefined = tokenHash !== null && type !== null && TYPES.includes(type) ? { tokenHash, type } : code !== null ? { code } : undefined;
  const target = new URL(next, url.origin);
  if (link === undefined) return redirectToLogin(url, 'This link is incomplete. Open it again from the email, or ask for a new one.');
  const result = await verifyEmailLink(link);
  if (!result.ok) return redirectToLogin(url, result.message);
  return NextResponse.redirect(target);
}

function redirectToLogin(url: URL, message: string): Response {
  const to = new URL(LOGIN_PATH, url.origin);
  to.searchParams.set('error', message);
  return NextResponse.redirect(to);
}
