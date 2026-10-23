'use client';

import { FileJsonIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ExtractOutcome } from '@/types/extract';
import type { Example } from '@/types/panels';
import { finishResponse } from '../_actions/finish-response';

export interface SampleCardsProps {
  examples: readonly Example[];
  disabled: boolean;
  /** Projeto do CLI: abre direto no editor. */
  onPick: (text: string) => void;
  /** Leitura gravada da IA: o resultado da conversão (com proveniência) segue o mesmo caminho da extração. */
  onOutcome: (outcome: ExtractOutcome) => void;
}

/**
 * "Or try a sample" como cards (2026-10-23): visíveis para quem testa, não um select escondido. O primeiro é a
 * leitura real da IA do Ringgold (replay sem chave, pela action `finishResponse`); os outros, projetos do CLI.
 */
export function SampleCards({ examples, disabled, onPick, onOutcome }: SampleCardsProps) {
  const [loadingId, setLoadingId] = useState<string | undefined>(undefined);
  const { execute } = useAction(finishResponse, {
    onSuccess: ({ data }) => {
      setLoadingId(undefined);
      if (data) {
        onOutcome(data);
        if (data.ok) toast.success('Sample reading loaded. Review the walls as you would after a real read.');
      }
    },
    onError: ({ error }) => {
      setLoadingId(undefined);
      toast.error(error.serverError ?? 'Could not load the sample.');
    },
  });
  if (examples.length === 0) return null;
  return (
    <section id="samples" className="scroll-mt-24 space-y-3" aria-label="Sample projects">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="eyebrow">Or try a sample</p>
        <p className="text-[13px] text-ink-3">no drawings and no API call — opens straight in the editor</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {examples.map((e, i) => {
          const reading = e.kind === 'reading';
          const loading = loadingId === e.id;
          return (
            <li key={e.id} style={{ '--i': i } as React.CSSProperties} className="stagger">
              <button
                type="button"
                disabled={disabled || loadingId !== undefined}
                onClick={() => {
                  if (reading) {
                    setLoadingId(e.id);
                    execute({ responseJson: e.text });
                  } else onPick(e.text);
                }}
                className={cn(
                  'lift flex h-full w-full flex-col gap-2 rounded-md border bg-card p-4 text-left transition-[border-color] duration-200 hover:border-gold disabled:pointer-events-none disabled:opacity-60',
                  reading && 'border-gold/60 bg-gold-100/30',
                )}
              >
                <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[1.2px] uppercase text-gold-700">
                  {loading ? <Loader2Icon className="size-3.5 animate-spin" /> : reading ? <SparklesIcon className="size-3.5" /> : <FileJsonIcon className="size-3.5" />}
                  {reading ? 'AI reading · real set' : 'Project file'}
                </span>
                <span className="text-base font-semibold text-ink">{e.label}</span>
                <span className="font-mono text-[12px] text-ink-2">{e.facts}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
