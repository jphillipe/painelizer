import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/app', label: 'Viewer' },
  { href: '/app/extract', label: 'Extract' },
] as const;

/** Header navy + conteúdo em container do site + rodapé mínimo (docs/10-design.md §4). */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print h-16 bg-primary text-primary-foreground">
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
          </nav>
        </div>
      </header>
      <main className="container-site flex-1 py-8">{children}</main>
      <footer className="no-print border-t border-line-faint py-4 text-sm text-ink-3">
        <div className="container-site">Panelizer · National Lumber · WR Group</div>
      </footer>
    </div>
  );
}
