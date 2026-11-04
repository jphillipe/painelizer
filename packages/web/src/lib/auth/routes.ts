/**
 * Decisão de rota do guard de login (S22.0), pura para testar; `src/proxy.ts` aplica.
 * Tudo sob `/app` exige usuário; `/login` com usuário volta ao app. Sem Supabase configurado o app fica aberto
 * em desenvolvimento, mas em produção `/app` é bloqueado — um deploy sem as chaves não pode expor a API paga.
 */

export const LOGIN_PATH = '/login';
export const APP_PATH = '/app';
export const NEXT_PARAM = 'next';

export type RouteDecision = { kind: 'pass' } | { kind: 'redirect'; to: string };

export interface RouteContext {
  signedIn: boolean;
  /** Há URL e chave do Supabase. */
  configured: boolean;
  production: boolean;
}

export function isProtected(pathname: string): boolean {
  return pathname === APP_PATH || pathname.startsWith(`${APP_PATH}/`);
}

/** Destino depois do login: só caminhos do próprio app (nunca `//host` nem URL absoluta). */
export function safeNext(next: string | undefined): string {
  if (next === undefined) return APP_PATH;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return APP_PATH;
  if (next === LOGIN_PATH || next.startsWith(`${LOGIN_PATH}?`)) return APP_PATH;
  return next;
}

export function routeFor(pathname: string, search: string, ctx: RouteContext): RouteDecision {
  const onLogin = pathname === LOGIN_PATH;
  if (!ctx.configured) {
    // Sem login configurado: aberto em desenvolvimento; em produção, só a página que explica.
    if (ctx.production && isProtected(pathname)) return { kind: 'redirect', to: LOGIN_PATH };
    return { kind: 'pass' };
  }
  if (onLogin) {
    if (!ctx.signedIn) return { kind: 'pass' };
    const next = new URLSearchParams(search).get(NEXT_PARAM) ?? undefined;
    return { kind: 'redirect', to: safeNext(next) };
  }
  if (isProtected(pathname) && !ctx.signedIn) {
    const back = `${pathname}${search}`;
    const to = back === APP_PATH ? LOGIN_PATH : `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(back)}`;
    return { kind: 'redirect', to };
  }
  return { kind: 'pass' };
}

/** Rota que recebe os links de e-mail do Supabase (S32): convite e "esqueci a senha". Fora do guard de login. */
export const AUTH_CONFIRM_PATH = '/auth/confirm';

/** Para onde a sessão aberta pelo link leva: a conta, com o aviso de escolher a senha. */
export const AFTER_INVITE = '/app/account?welcome=1';
export const AFTER_RECOVERY = '/app/account?reset=1';

interface HeadersLike {
  get(name: string): string | null;
}

/**
 * Origem pública do pedido (S32), para o link do e-mail voltar ao mesmo endereço: atrás do Cloud Run vale o
 * `x-forwarded-host`/`x-forwarded-proto`; sem eles, o `host` (http em localhost, https fora).
 */
export function requestOrigin(headers: HeadersLike): string {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3000').split(',')[0]!.trim();
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : local ? 'http' : 'https';
  return `${proto}://${host}`;
}

/**
 * `redirectTo` do convite e da recuperação: `<origem>/auth/confirm?next=…`. Com os modelos de e-mail do
 * `supabase/README.md` (S32) o link já vem com `token_hash`; com o modelo padrão, o Supabase devolve um `code` aqui.
 * A URL precisa estar em Authentication › URL Configuration › Redirect URLs.
 */
export function emailLinkRedirect(headers: HeadersLike, kind: 'invite' | 'recovery'): string {
  const next = kind === 'invite' ? AFTER_INVITE : AFTER_RECOVERY;
  return `${requestOrigin(headers)}${AUTH_CONFIRM_PATH}?next=${encodeURIComponent(next)}`;
}
