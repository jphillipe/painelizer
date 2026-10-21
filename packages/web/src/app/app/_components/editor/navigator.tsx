'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface NavigatorTab {
  id: string;
  label: string;
  count?: number;
  /** Contagem em destaque (problemas). */
  alert?: boolean;
  content: ReactNode;
}

export interface NavigatorProps {
  tab: string;
  onTab: (id: string) => void;
  tabs: readonly NavigatorTab[];
  className?: string;
}

/**
 * Abas do navegador do workspace (S21.4). Conteúdo sempre montado (`forceMount` + `hidden`): a lista não
 * reanima a cada troca e a região `aria-live` das issues continua existindo em outra aba.
 */
export function Navigator({ tab, onTab, tabs, className }: NavigatorProps) {
  return (
    <Tabs value={tab} onValueChange={onTab} className={cn('flex min-h-0 flex-1 flex-col gap-0', className)}>
      <TabsList variant="line" className="h-auto w-full shrink-0 justify-start gap-0 border-b border-line px-2">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="h-9 flex-none rounded-none px-3 text-[13px] font-semibold after:bottom-0 after:h-0.5 after:bg-gold data-[state=active]:text-ink">
            {t.label}
            {t.count !== undefined ? (
              <span className={cn('rounded-pill px-1.5 font-mono text-[11px] font-medium', t.alert && t.count > 0 ? 'bg-destructive text-paper' : 'bg-paper-3 text-ink-2')}>{t.count}</span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} forceMount className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
