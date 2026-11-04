/**
 * Login (S22.0): e-mail e senha no Supabase Auth, sessão em cookie. Sem Supabase configurado, `currentUser` é
 * `undefined` e nada exige login (o app fica aberto em desenvolvimento; em produção o proxy bloqueia `/app`).
 * O cliente entra por `deps` (um objeto falso nos testes). Não há cadastro: as contas são criadas no painel ou,
 * desde a S32, por convite de um admin do time (`services/team.service.ts`). S32 também traz "esqueci a senha"
 * (link por e-mail), troca de senha em `/app/account` e a rota `/auth/confirm` que abre a sessão a partir do link.
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

/** Tipo do link de e-mail do Supabase que `/auth/confirm` aceita (S32). */
export type EmailLinkType = 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email_change' | 'email';

/** O que o service usa do `supabase.auth` (estruturalmente compatível com o cliente real). */
export interface AuthApi {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
  signOut(): Promise<{ error: AuthErrorLike | null }>;
  getUser(): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
  /** S32: manda o link de "esqueci a senha". */
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: AuthErrorLike | null }>;
  /** S32: troca a senha de quem está logado. */
  updateUser(attributes: { password: string }): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
  /** S32: link com `token_hash` (modelos de e-mail do README). */
  verifyOtp(params: { token_hash: string; type: EmailLinkType }): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
  /** S32: link com `code` (modelo padrão do Supabase, fluxo PKCE no mesmo navegador). */
  exchangeCodeForSession(code: string): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
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

/** Senha mínima do app (o Supabase aceita 6 por padrão; o painel pode exigir mais). */
export const PASSWORD_MIN = 8;

export type AccountResult = { ok: true } | { ok: false; message: string };

function unreachable(error: AuthErrorLike): boolean {
  return error.status === 0 || (error.code === undefined && /fetch failed|network/i.test(error.message));
}

const PASSWORD_MESSAGES: Record<string, string> = {
  same_password: 'The new password must be different from the current one.',
  weak_password: 'This password is too weak. Use a longer one, with letters and numbers.',
  reauthentication_needed: 'For security, sign out and sign in again before changing the password.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many emails were sent. Wait a few minutes and try again.',
};

/**
 * "Esqueci a senha" (S32): o Supabase manda o link para `redirectTo` (`/auth/confirm`). A resposta é a mesma com
 * ou sem conta para o e-mail — a tela não pode servir para descobrir quem tem conta. Só falha de rede ou limite de
 * envio voltam como erro.
 */
export async function requestPasswordReset(email: string, redirectTo: string, deps: AuthDeps = defaultDeps): Promise<AccountResult> {
  let auth: AuthApi | undefined;
  try {
    auth = await deps.auth();
  } catch {
    auth = undefined;
  }
  if (auth === undefined) return { ok: false, message: 'Sign-in is not set up on this server.' };
  try {
    const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
    if (error === null) return { ok: true };
    if (unreachable(error)) return { ok: false, message: UNREACHABLE };
    const known = error.code === undefined ? undefined : PASSWORD_MESSAGES[error.code];
    // Conta inexistente e afins: a mesma resposta de sucesso.
    return known === undefined || error.code === 'same_password' || error.code === 'weak_password' ? { ok: true } : { ok: false, message: known };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

/** Troca a senha de quem está logado (S32, `/app/account`; também o passo final do link de recuperação). */
export async function changePassword(password: string, deps: AuthDeps = defaultDeps): Promise<AccountResult> {
  if (password.length < PASSWORD_MIN) return { ok: false, message: `Use at least ${PASSWORD_MIN} characters.` };
  let auth: AuthApi | undefined;
  try {
    auth = await deps.auth();
  } catch {
    auth = undefined;
  }
  if (auth === undefined) return { ok: false, message: 'Accounts are not set up on this server.' };
  try {
    const { error } = await auth.updateUser({ password });
    if (error === null) return { ok: true };
    if (unreachable(error)) return { ok: false, message: UNREACHABLE };
    const known = error.code === undefined ? undefined : PASSWORD_MESSAGES[error.code];
    return { ok: false, message: known ?? `Could not change the password: ${error.message}` };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

/** O que veio no link do e-mail (S32): `token_hash` + `type` (modelos do README) ou `code` (modelo padrão). */
export type EmailLink = { tokenHash: string; type: EmailLinkType } | { code: string };

/** Abre a sessão a partir do link (convite ou recuperação); os cookies saem pelo cliente do servidor. */
export async function verifyEmailLink(link: EmailLink, deps: AuthDeps = defaultDeps): Promise<SignInResult> {
  let auth: AuthApi | undefined;
  try {
    auth = await deps.auth();
  } catch {
    auth = undefined;
  }
  if (auth === undefined) return { ok: false, message: 'Sign-in is not set up on this server.' };
  try {
    const { data, error } = 'code' in link ? await auth.exchangeCodeForSession(link.code) : await auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
    if (error !== null) {
      if (unreachable(error)) return { ok: false, message: UNREACHABLE };
      return { ok: false, message: 'This link has expired or was already used. Ask for a new one.' };
    }
    const user = sessionUser(data.user);
    return user === undefined ? { ok: false, message: 'This link has expired or was already used. Ask for a new one.' } : { ok: true, user };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}
