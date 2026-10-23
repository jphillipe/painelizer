'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Modo do shell (S21.4): `page` é o container do site (1200 px, rolagem da página); `workspace` é o editor do
 * passo 02, que ocupa a altura toda da janela e rola painel a painel (docs/10-design.md §4); `stage` (login, S22)
 * é largura toda e sem rodapé, mas com rolagem normal — a tela de login tem um palco em tela cheia. O `AppShell`
 * é Server Component e o modo é estado do cliente, por isso vive num contexto do cliente.
 */
export type ShellMode = 'page' | 'workspace' | 'stage';

const ShellLayoutContext = createContext<{ mode: ShellMode; setMode: (mode: ShellMode) => void }>({ mode: 'page', setMode: () => {} });

export function ShellLayoutProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ShellMode>('page');
  return <ShellLayoutContext.Provider value={{ mode, setMode }}>{children}</ShellLayoutContext.Provider>;
}

export function ShellFrame({ children }: { children: ReactNode }) {
  const { mode } = useContext(ShellLayoutContext);
  return <div className={cn('flex flex-col', mode === 'workspace' ? 'h-dvh overflow-hidden' : 'min-h-screen')}>{children}</div>;
}

export function ShellMain({ children }: { children: ReactNode }) {
  const { mode } = useContext(ShellLayoutContext);
  return <main className={mode === 'page' ? 'container-site flex-1 py-8' : 'flex min-h-0 flex-1 flex-col'}>{children}</main>;
}

/** Rodapé do site: some no workspace (a altura é da janela e o editor precisa dela inteira) e no palco do login. */
export function ShellFooter({ children }: { children: ReactNode }) {
  const { mode } = useContext(ShellLayoutContext);
  return <footer className={cn('no-print shrink-0 border-t border-line-faint py-4 text-sm text-ink-3', mode !== 'page' && 'hidden')}>{children}</footer>;
}

/** Liga um modo enquanto `enabled`; volta a `page` ao desmontar. */
export function useShellMode(mode: Exclude<ShellMode, 'page'>, enabled = true): void {
  const { setMode } = useContext(ShellLayoutContext);
  useEffect(() => {
    setMode(enabled ? mode : 'page');
    return () => setMode('page');
  }, [enabled, mode, setMode]);
}

/** Liga o modo workspace enquanto `enabled`; desliga ao desmontar. */
export function useWorkspaceLayout(enabled: boolean): void {
  useShellMode('workspace', enabled);
}
