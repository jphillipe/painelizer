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
