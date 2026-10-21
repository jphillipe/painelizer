'use client';

import { FileImageIcon, FileTextIcon, Loader2Icon, SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUsd, type CostEstimate } from '@/lib/extract-cost';
import type { ExtractPreview } from '@/types/extract';
import { formatBytes } from './drop-zone';

export interface SendPreviewProps {
  preview: ExtractPreview | undefined;
  previewing: boolean;
  estimate: CostEstimate | undefined;
  /** Conjunto grande: a prévia (que sobe os arquivos) só sob pedido. */
  needsRequest: boolean;
  totalBytes: number;
  onRequest: () => void;
}

/**
 * "What will be sent" (M7): antes de pagar, quais páginas de cada PDF vão para a IA (folha e título do carimbo),
 * quais folhas úteis ficaram fora do orçamento, as imagens, o tamanho codificado e o custo estimado a partir
 * das leituras reais.
 */
export function SendPreview({ preview, previewing, estimate, needsRequest, totalBytes, onRequest }: SendPreviewProps) {
  if (needsRequest) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed bg-paper-2 px-4 py-3 text-sm">
        <span className="text-ink-2">
          {formatBytes(totalBytes)} of drawings: preview what will be sent before paying? It uploads the set once.
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onRequest}>
          <SendIcon /> Preview what will be sent
        </Button>
      </div>
    );
  }
  return (
    <section className="rounded-md border bg-card" aria-label="What will be sent" aria-busy={previewing}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-faint px-4 py-2">
        <p className="eyebrow">What will be sent</p>
        {previewing ? (
          <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
            <Loader2Icon className="size-3.5 animate-spin" /> Reading the title blocks…
          </span>
        ) : preview?.ok ? (
          <span className="text-[13px] text-ink-2">
            {preview.pagesTotal} page{preview.pagesTotal === 1 ? '' : 's'}
            {preview.images > 0 ? ` · ${preview.images} image${preview.images === 1 ? '' : 's'}` : ''} · {formatBytes(preview.encodedBytes)} encoded
          </span>
        ) : null}
      </div>
      {preview === undefined ? (
        <p className="px-4 py-3 text-[13px] text-ink-3">The sheets the AI will read appear here.</p>
      ) : !preview.ok ? (
        <p className="px-4 py-3 text-[13px] text-destructive">{preview.message}</p>
      ) : (
        <ul className="divide-y divide-line-faint">
          {preview.files.map((f) => (
            <li key={f.name} className="space-y-1 px-4 py-2 text-[13px]">
              <p className="flex items-center gap-2">
                {f.kind === 'pdf' ? <FileTextIcon className="size-4 shrink-0 text-navy-900" /> : <FileImageIcon className="size-4 shrink-0 text-gold-600" />}
                <span className="min-w-0 truncate font-mono">{f.name}</span>
                <span className="text-ink-2">{f.kind === 'image' ? 'sent as an image' : f.pages.length === 0 ? 'nothing useful found — give its pages' : `${f.pages.length} page${f.pages.length === 1 ? '' : 's'}`}</span>
              </p>
              {f.pages.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5 pl-6">
                  {f.pages.map((p) => (
                    <li key={p.page} className="rounded-sm border border-ok/30 bg-ok/10 px-1.5 py-0.5 font-mono text-[12px] text-ok-700" title={p.title}>
                      p.{p.page}
                      {p.sheet !== undefined ? ` ${p.sheet}` : ''}
                      {p.title !== undefined ? <span className="font-sans text-ink-2"> · {p.title.length > 40 ? `${p.title.slice(0, 40)}…` : p.title}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {f.dropped.length > 0 ? (
                <p className="pl-6 text-[12px] text-warning">
                  Left out by the 40-page / 22 MB budget: {f.dropped.map((d) => `${d.sheet ?? `p.${d.page}`} (${d.category})`).join(', ')}. Click those pages above to force them.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {estimate !== undefined ? (
        <p className="border-t border-line-faint px-4 py-2 text-[13px] text-ink-2">
          Estimated cost <span className="font-semibold text-ink">about {formatUsd(estimate.usd)}</span> ({formatUsd(estimate.low)}–{formatUsd(estimate.high)}), from {Math.round(estimate.inputTokens / 1000)}k input and ~{Math.round(estimate.outputTokens / 1000)}k output tokens, calibrated on past reads. The exact amount shows in the Reading tab afterwards.
        </p>
      ) : null}
    </section>
  );
}
