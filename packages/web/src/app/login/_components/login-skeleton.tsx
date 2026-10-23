'use client';

import { useShellMode } from '@/components/shell-layout';
import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto da tela de login: o palco navy, o título e o card de vidro vazio, na mesma posição da `LoginView`. */
export function LoginSkeleton() {
  useShellMode('stage');
  return (
    <section className="login-surface relative flex flex-1 flex-col text-paper" aria-busy="true" aria-label="Loading sign-in">
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-4 pt-10 pb-12 sm:px-8 lg:min-h-[calc(100dvh-72px)] lg:px-20 lg:pt-14">
        <header className="max-w-xl space-y-3">
          <Skeleton className="h-3 w-56 bg-paper/15" />
          <Skeleton className="h-10 w-96 max-w-full bg-paper/15" />
        </header>
        <div className="relative flex flex-1 flex-col items-center gap-8 lg:block">
          <Skeleton className="h-64 w-full max-w-3xl bg-paper/8 lg:absolute lg:top-[72px] lg:left-0 lg:h-[420px] lg:w-[76%] lg:max-w-none" />
          <div className="relative z-10 w-full max-w-[400px] space-y-5 rounded-lg border border-paper/15 bg-navy-900/85 p-7 shadow-2 sm:p-9 lg:absolute lg:top-1/2 lg:right-0 lg:-translate-y-1/2">
            <Skeleton className="h-3 w-16 bg-paper/15" />
            <Skeleton className="h-9 w-56 bg-paper/15" />
            <Skeleton className="h-4 w-full bg-paper/10" />
            <Skeleton className="h-10 w-full bg-paper/10" />
            <Skeleton className="h-10 w-full bg-paper/10" />
            <Skeleton className="h-11 w-full rounded-pill bg-gold-btn/40" />
          </div>
        </div>
        <p className="sr-only">Loading sign-in…</p>
      </div>
    </section>
  );
}
