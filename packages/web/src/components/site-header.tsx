'use client';

import { ChevronDownIcon, LogOutIcon, PlusIcon, type LucideIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { signOutAction } from '@/app/login/_actions/sign-out';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { initialsOf, isActivePath, isBareRoute, type NavTarget } from '@/lib/site-nav';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/services/auth.service';

interface NavItem extends NavTarget {
  label: string;
  icon: LucideIcon;
}

/** Rotas de `docs/10-design.md` §5; "Projects" entra na S22.2. */
const NAV: readonly NavItem[] = [{ href: '/app', label: 'New project', icon: PlusIcon, exact: true }];

export interface SiteHeaderProps {
  /** Area do usuario, montada pelo servidor (avatar + menu, um skeleton enquanto carrega, ou nada). */
  userSlot: ReactNode;
}

/**
 * Header do app (docs/10-design.md §4). Superfície navy com profundidade (`header-surface`: gradiente, brilho
 * dourado atrás da marca, grade fina) e fio dourado na base; fixo no topo, encolhe de 72 para 64 px e ganha
 * sombra ao rolar. Três áreas: **marca** (logo da National Lumber num tile de papel + "Panelizer" + assinatura),
 * **navegação** em grupo de pills (ativo pela rota, com ponto dourado), **usuário** (avatar de iniciais com
 * menu: e-mail e "Sign out"). Em `/login` só a marca e uma linha de contexto. Entradas em fade e cascata;
 * tudo respeita `prefers-reduced-motion` pela regra global.
 */
export function SiteHeader({ userSlot }: SiteHeaderProps) {
  const pathname = usePathname();
  const bare = isBareRoute(pathname);
  const scrolled = useScrolled();
  // Tom por rota: navy sobre as telas em papel; em /login o palco é navy, então o header vira papel para se destacar.
  const light = bare;
  return (
    <header
      data-scrolled={scrolled}
      data-tone={light ? 'light' : 'navy'}
      className={cn(
        'no-print sticky top-0 z-40 shrink-0 transition-[height,box-shadow] duration-300 ease-site',
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-gradient-to-r after:from-gold after:via-gold-300/70 after:to-transparent',
        light ? 'bg-paper text-ink shadow-1' : 'on-navy header-surface text-primary-foreground',
        scrolled ? 'h-16 shadow-2' : 'h-18',
      )}
    >
      <div className="container-site flex h-full items-center gap-4 sm:gap-6">
        <Link href="/app" className="group/brand flex items-center gap-3 rounded-sm animate-fade-in" aria-label="Panelizer — National Lumber">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-md transition-[transform,box-shadow] duration-300 ease-site group-hover/brand:-translate-y-0.5 motion-reduce:group-hover/brand:translate-y-0',
              light ? 'bg-white ring-1 ring-line group-hover/brand:shadow-1' : 'bg-paper shadow-1 ring-1 ring-paper/20 group-hover/brand:shadow-2',
            )}
          >
            <Image src="/brand/national-lumber.png" alt="" width={30} height={20} priority />
          </span>
          <span className="flex flex-col leading-none">
            <span className={cn('text-lg font-semibold tracking-tight', light ? 'text-navy-900' : 'text-paper')}>Panelizer</span>
            <span className={cn('mt-1 text-[10.5px] font-semibold uppercase tracking-[1.6px]', light ? 'text-gold-700' : 'text-gold-300')}>National Lumber · WR Group</span>
          </span>
        </Link>

        {bare ? (
          <p className="ml-auto hidden text-[12px] font-semibold uppercase tracking-[1.4px] text-ink-3 animate-fade-in sm:block">Wall panel fabrication · internal tool</p>
        ) : (
          <>
            <span aria-hidden className="hidden h-8 w-px bg-paper/15 sm:block" />
            <nav aria-label="Main" className="flex items-center gap-1 rounded-pill border border-paper/10 bg-paper/5 p-1">
              {NAV.map((item, i) => {
                const active = isActivePath(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    style={{ '--i': i } as CSSProperties}
                    className={cn(
                      'group/nav stagger relative flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold transition-[background-color,color] duration-200',
                      active ? 'bg-paper/12 text-paper' : 'text-paper/70 hover:bg-paper/8 hover:text-paper',
                    )}
                  >
                    <Icon className={cn('size-4 transition-colors duration-200', active ? 'text-gold-300' : 'text-paper/60 group-hover/nav:text-gold-300')} />
                    <span className="hidden sm:inline">{item.label}</span>
                    {active ? <span aria-hidden className="ml-0.5 size-1.5 rounded-pill bg-gold-300 animate-pop" /> : null}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-3 animate-fade-in">{userSlot}</div>
          </>
        )}
      </div>
    </header>
  );
}

/** Avatar com iniciais (ponto verde = sessão ativa) e menu: e-mail, "Sign out". Sair limpa a sessão e vai ao login. */
export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { execute, isPending } = useAction(signOutAction, {
    onSuccess: () => {
      router.push('/login');
      router.refresh();
    },
    onError: () => toast.error('Could not sign out. Try again.'),
  });
  const initials = initialsOf(user.email);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${user.email}`}
          className="group/user flex items-center gap-2.5 rounded-pill py-1 pr-2.5 pl-1 text-sm transition-colors duration-200 hover:bg-paper/10 data-[state=open]:bg-paper/10"
        >
          <span className="relative flex size-9 items-center justify-center rounded-pill bg-gold-btn text-[12px] font-semibold text-navy-900 ring-2 ring-transparent transition-[box-shadow] duration-200 ease-site group-hover/user:ring-gold-300/60 group-data-[state=open]/user:ring-gold-300">
            {initials}
            <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-pill bg-ok ring-2 ring-navy-900" />
          </span>
          <span className="hidden max-w-[200px] truncate text-paper/85 md:inline">{user.email}</span>
          <ChevronDownIcon className="size-4 text-paper/60 transition-transform duration-200 ease-site group-data-[state=open]/user:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="min-w-[15rem]">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <p className="truncate px-2 pb-2 text-sm text-ink" title={user.email}>
          {user.email}
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onSelect={() => execute()}>
          <LogOutIcon />
          {isPending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** `true` depois de rolar a página (o header fixo encolhe e ganha sombra). No workspace a página não rola: fica `false`. */
function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}
