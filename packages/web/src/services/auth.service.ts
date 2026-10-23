/**
 * Login (S22.0): e-mail e senha no Supabase Auth, sessão em cookie. Sem Supabase configurado, `currentUser` é
 * `undefined` e nada exige login (o app fica aberto em desenvolvimento; em produção o proxy bloqueia `/app`).
 * O cliente entra por `deps` (um objeto falso nos testes). Não há cadastro: as contas são criadas no painel.
 */

import 'server-only';

import { hasSupabase } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

export interface SessionUser {
  id: string;
  email: string;
}

interface AuthUserLike {
  id: string;
  email?: string | undefined;
}

interface AuthErrorLike {
  message: string;
  code?: string | undefined;
  status?: number | undefined;
}

/** O que o service usa do `supabase.auth` (estruturalmente compatível com o cliente real). */
export interface AuthApi {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
  signOut(): Promise<{ error: AuthErrorLike | null }>;
  getUser(): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
}

export interface AuthDeps {
  /** `undefined` = Supabase não configurado. */
  auth: () => Promise<AuthApi | undefined>;
  configured: () => boolean;
}

export const defaultDeps: AuthDeps = {
  auth: async () => (await supabaseServer())?.auth,
  configured: hasSupabase,
};

export type SignInResult = { ok: true; user: SessionUser } | { ok: false; message: string };

/** Lançado pelas actions que exigem usuário quando não há sessão; `handleServerError` traduz em mensagem. */
export class SignedOutError extends Error {
  constructor(message = 'Sign in to continue.') {
    super(message);
    this.name = 'SignedOutError';
  }
}

export function isAuthConfigured(deps: AuthDeps = defaultDeps): boolean {
  return deps.configured();
}

function sessionUser(u: AuthUserLike | null): SessionUser | undefined {
  if (u === null) return undefined;
  return { id: u.id, email: u.email ?? '' };
}

/** Usuário da sessão, ou `undefined` sem sessão / sem Supabase / com o serviço fora do ar. */
export async function currentUser(deps: AuthDeps = defaultDeps): Promise<SessionUser | undefined> {
  try {
    const auth = await deps.auth();
    if (auth === undefined) return undefined;
    const { data, error } = await auth.getUser();
    if (error !== null) return undefined;
    return sessionUser(data.user);
  } catch {
    return undefined;
  }
}

/** Para actions: com Supabase configurado exige sessão; sem ele, devolve `undefined` e deixa passar. */
export async function requireUser(deps: AuthDeps = defaultDeps): Promise<SessionUser | undefined> {
  if (!deps.configured()) return undefined;
  const user = await currentUser(deps);
  if (user === undefined) throw new SignedOutError();
  return user;
}

const SIGN_IN_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'This email hasn’t been confirmed yet. Ask the team to confirm it in Supabase.',
  user_banned: 'This account is disabled.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
};

export async function signIn(email: string, password: string, deps: AuthDeps = defaultDeps): Promise<SignInResult> {
  let auth: AuthApi | undefined;
  try {
    auth = await deps.auth();
  } catch {
    auth = undefined;
  }
  if (auth === undefined) return { ok: false, message: 'Sign-in is not set up on this server.' };
  try {
    const { data, error } = await auth.signInWithPassword({ email, password });
    if (error !== null) {
      // Rede fora: o cliente não lança, devolve um erro com status 0 ("fetch failed").
      if (error.status === 0 || (error.code === undefined && /fetch failed|network/i.test(error.message))) return { ok: false, message: UNREACHABLE };
      const known = error.code === undefined ? undefined : SIGN_IN_MESSAGES[error.code];
      return { ok: false, message: known ?? (error.status === 400 ? SIGN_IN_MESSAGES['invalid_credentials']! : `Could not sign in: ${error.message}`) };
    }
    const user = sessionUser(data.user);
    if (user === undefined) return { ok: false, message: 'Could not sign in.' };
    return { ok: true, user };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

const UNREACHABLE = 'Could not reach the sign-in service. Check the connection and try again.';

/** Encerra a sessão; sem Supabase não há o que encerrar. Falha do serviço não impede sair: os cookies são limpos pelo cliente. */
export async function signOut(deps: AuthDeps = defaultDeps): Promise<void> {
  try {
    const auth = await deps.auth();
    if (auth === undefined) return;
    await auth.signOut();
  } catch {
    /* sessão local já descartada pelo cliente */
  }
}
