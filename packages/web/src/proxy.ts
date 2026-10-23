import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routeFor } from '@/lib/auth/routes';
import { supabaseEnv } from '@/lib/supabase/env';

/**
 * Guard de login (S22.0): roda antes de toda página e action sob `/app`. Renova o token do Supabase (gravando os
 * cookies na resposta, o que um Server Component não pode fazer) e aplica `routeFor`: sem usuário vai a `/login`
 * com `next`; `/login` com usuário volta ao app. Sem as chaves, aberto em desenvolvimento e `/app` bloqueado em
 * produção. Não importa `server-only` nem services: só o que é puro.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const env = supabaseEnv();
  const production = process.env.NODE_ENV === 'production';
  const { pathname, search } = request.nextUrl;
  let response = NextResponse.next({ request });
  let signedIn = false;
  if (env !== undefined) {
    const supabase = createServerClient(env.url, env.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = data.user !== null;
    } catch {
      signedIn = false;
    }
  }
  const decision = routeFor(pathname, search, { signedIn, configured: env !== undefined, production });
  if (decision.kind === 'redirect') {
    const url = request.nextUrl.clone();
    const [path, query] = decision.to.split('?');
    url.pathname = path ?? decision.to;
    url.search = query === undefined ? '' : `?${query}`;
    const redirect = NextResponse.redirect(url);
    // Token renovado também na resposta de redirecionamento.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  // Tudo menos estáticos: o guard precisa ver páginas e os POSTs das server actions.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};
