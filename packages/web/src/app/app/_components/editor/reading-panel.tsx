'use client';

import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadText } from '@/lib/download';
import type { ExtractOutcome } from '@/types/extract';

export interface ReadingPanelProps {
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  /** Origem do projeto quando não veio da IA. */
  source: 'sample' | 'file' | 'extraction' | undefined;
  slug: string;
}

/** Aba "Reading" do navegador (S21.4): tudo que a IA disse sobre a leitura, num lugar só — modelo, páginas, notas, relatório. */
export function ReadingPanel({ outcome, source, slug }: ReadingPanelProps) {
  if (outcome === undefined) {
    return (
      <div className="px-4 py-4 text-sm text-ink-3">
        {source === 'sample' ? 'Sample project: no AI reading.' : 'Project file: no AI reading.'}
      </div>
    );
  }
  return (
    <div className="workspace-pane h-full space-y-4 px-4 py-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-ink-3">Model</dt>
        <dd className="font-mono">{outcome.model}</dd>
        {outcome.pagesSent.length > 0 ? (
          <>
            <dt className="text-ink-3">Pages</dt>
            <dd className="font-mono">{outcome.pagesSent.map((p) => `${p.name} p.${p.pages.join(',')}`).join(' · ')}</dd>
          </>
        ) : null}
        <dt className="text-ink-3">Origin</dt>
        <dd>{outcome.origin}</dd>
        <dt className="text-ink-3">Tokens</dt>
        <dd className="font-mono">
          {outcome.usage.inputTokens} in · {outcome.usage.outputTokens} out
        </dd>
      </dl>
      {outcome.notes.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">Notes from the AI</p>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
            {outcome.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <details>
        <summary className="cursor-pointer text-[13px] text-ink-2 select-none">Full review report</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-card p-3 text-[12px] whitespace-pre-wrap">{outcome.report}</pre>
      </details>
      <Button variant="outline" size="sm" disabled={outcome.output === undefined} onClick={() => downloadText(`${slug}-reading.json`, JSON.stringify(outcome.output, null, 2))}>
        <DownloadIcon /> Download reading
      </Button>
    </div>
  );
}
