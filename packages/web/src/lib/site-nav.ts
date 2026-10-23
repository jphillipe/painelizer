/** Regras puras do header (components/site-header.tsx): rota ativa, tela sem navegação e iniciais do avatar. */

export interface NavTarget {
  href: string;
  /** Ativo só com o caminho exato (senão, também nos filhos). */
  exact?: boolean;
}

export function isActivePath(pathname: string, item: NavTarget): boolean {
  if (pathname === item.href) return true;
  return item.exact !== true && pathname.startsWith(`${item.href}/`);
}

/** `/login` é a única tela sem navegação nem usuário: só a marca. */
export function isBareRoute(pathname: string): boolean {
  return pathname === '/login';
}

/** Iniciais para o avatar: até duas letras do que vem antes do `@`, separadas por ponto, hífen ou sublinhado ("joao.phillipe" → "JP"). */
export function initialsOf(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._\-+]+/).filter((p) => p !== '');
  const letters = parts.length >= 2 ? [parts[0]![0], parts[1]![0]] : [local[0], local[1]];
  return letters
    .filter((c): c is string => c !== undefined)
    .join('')
    .toUpperCase();
}
