import { Suspense, type ReactNode } from 'react';
import { HeaderUser, HeaderUserSkeleton } from './header-user';
import { ShellFooter, ShellFrame, ShellLayoutProvider, ShellMain } from './shell-layout';
import { SiteHeader } from './site-header';

/**
 * Header + conteúdo em container do site + rodapé mínimo (docs/10-design.md §4). O editor (passo 02) pede o
 * modo workspace pelo `useWorkspaceLayout`: conteúdo na largura toda e na altura da janela, sem rodapé.
 * O usuário da sessão (S22.0) entra no header por um `Suspense`: a página não espera o Supabase.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShellLayoutProvider>
      <ShellFrame>
        <SiteHeader
          userSlot={
            <Suspense fallback={<HeaderUserSkeleton />}>
              <HeaderUser />
            </Suspense>
          }
        />
        <ShellMain>{children}</ShellMain>
        <ShellFooter>
          <div className="container-site">Panelizer · National Lumber · WR Group</div>
        </ShellFooter>
      </ShellFrame>
    </ShellLayoutProvider>
  );
}
