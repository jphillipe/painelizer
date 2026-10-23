import type { ReactNode } from 'react';
import { currentUser } from '@/services/auth.service';
import { ShellFooter, ShellFrame, ShellLayoutProvider, ShellMain } from './shell-layout';
import { SiteHeader } from './site-header';

/**
 * Header + conteúdo em container do site + rodapé mínimo (docs/10-design.md §4). O editor (passo 02) pede o
 * modo workspace pelo `useWorkspaceLayout`: conteúdo na largura toda e na altura da janela, sem rodapé.
 * O usuário da sessão (S22.0) é lido aqui, no servidor, e vai ao `SiteHeader`.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <ShellLayoutProvider>
      <ShellFrame>
        <SiteHeader user={user} />
        <ShellMain>{children}</ShellMain>
        <ShellFooter>
          <div className="container-site">Panelizer · National Lumber · WR Group</div>
        </ShellFooter>
      </ShellFrame>
    </ShellLayoutProvider>
  );
}
