import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentUser } from '@/services/auth.service';
import { ShellFooter, ShellFrame, ShellLayoutProvider, ShellMain } from './shell-layout';
import { SignOutButton } from './sign-out-button';

/** Rotas de `docs/10-design.md` §5; `/app/projects` entra na S22.2. */
const NAV = [{ href: '/app', label: 'New project' }] as const;

/**
 * Header navy + conteúdo em container do site + rodapé mínimo (docs/10-design.md §4). O editor (passo 02) pede o
 * modo workspace pelo `useWorkspaceLayout`: conteúdo na largura toda e na altura da janela, sem rodapé.
 * Com login (S22.0) o header mostra o e-mail e "Sign out"; sem Supabase, nada.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <ShellLayoutProvider>
      <ShellFrame>
        <header className="no-print on-navy h-16 shrink-0 bg-primary text-primary-foreground">
          <div className="container-site flex h-full items-center justify-between">
            <Link href="/app" className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">Panelizer</span>
              <span className="text-sm text-paper/70">· National Lumber</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-semibold">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="border-b-2 border-transparent pb-0.5 hover:border-gold-300">
                  {item.label}
                </Link>
              ))}
              {user !== undefined ? <SignOutButton email={user.email} /> : null}
            </nav>
          </div>
        </header>
        <ShellMain>{children}</ShellMain>
        <ShellFooter>
          <div className="container-site">Panelizer · National Lumber · WR Group</div>
        </ShellFooter>
      </ShellFrame>
    </ShellLayoutProvider>
  );
}
