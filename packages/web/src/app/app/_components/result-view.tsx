'use client';

import { useMemo, useState } from 'react';
import { Problems, Warnings } from './problems';
import { SvgView } from './svg-view';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { planOf, sheetsOf } from '@/lib/files';
import { cn } from '@/lib/utils';
import type { GenerateResult } from '@/types/panels';

export interface ResultViewProps {
  result: GenerateResult | undefined;
  pending: boolean;
}

/** Resultado do motor: vazio, carregando, problemas, ou resumo + abas Plan / Sheets (Files vem na S20.2). */
export function ResultView({ result, pending }: ResultViewProps) {
  if (pending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }
  if (result === undefined) {
    return (
      <div className="rounded-md border border-dashed bg-paper-2 p-10 text-center text-ink-3">
        Generate panels to see the plan, the sheets and the files here.
      </div>
    );
  }
  if (!result.ok) return <Problems problems={result.problems} />;
  return <Generated result={result} />;
}

function Generated({ result }: { result: Extract<GenerateResult, { ok: true }> }) {
  const plan = planOf(result.files);
  const sheets = useMemo(() => sheetsOf(result.files, result.panels), [result]);
  const [selected, setSelected] = useState<string | undefined>(sheets[0]?.panelId);
  const [showAll, setShowAll] = useState(false);
  const current = sheets.find((s) => s.panelId === selected) ?? sheets[0];
  const pieces = result.panels.reduce((n, p) => n + p.pieces, 0);

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2">{result.projectName}</h2>
        <Badge variant="secondary">{result.panels.length} panels</Badge>
        <Badge variant="secondary">{pieces} pieces to cut</Badge>
        <Badge variant="secondary">{result.files.length} files</Badge>
        {result.warnings.length > 0 ? (
          <Badge className="bg-warning text-paper">{result.warnings.length} warnings</Badge>
        ) : (
          <Badge className="bg-success text-paper">no warnings</Badge>
        )}
      </div>
      <Warnings warnings={result.warnings} />

      <Tabs defaultValue={plan === undefined ? 'sheets' : 'plan'}>
        <TabsList>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="sheets">Sheets</TabsTrigger>
        </TabsList>
        <TabsContent value="plan" className="pt-3">
          {plan === undefined ? (
            <p className="rounded-md border border-dashed bg-paper-2 p-6 text-ink-3">
              No plan for this project: its walls are loose (length only), not placed on a plan.
            </p>
          ) : (
            <SvgView svg={plan} label="Panel plan" className="plan" />
          )}
        </TabsContent>
        <TabsContent value="sheets" className="pt-3">
          <div className="mb-3 flex items-center gap-2 no-print">
            <Checkbox id="show-all" checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
            <Label htmlFor="show-all">Show all sheets</Label>
          </div>
          {showAll ? (
            <div className="space-y-4">
              {sheets.map((s) => (
                <SvgView key={s.panelId} svg={s.svg} label={`Sheet ${s.panelId}`} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <ul className="no-print max-h-[600px] divide-y divide-line-faint overflow-auto rounded-md border bg-card">
                {result.panels.map((p, i) => (
                  <li key={p.id} style={{ '--i': i } as React.CSSProperties} className="stagger">
                    <button
                      type="button"
                      onClick={() => setSelected(p.id)}
                      className={cn(
                        'flex w-full items-center justify-between border-l-2 border-transparent px-3 py-2 text-left font-mono text-[13px] transition-[background-color,border-color,padding] duration-200 ease-site hover:bg-paper-2 hover:pl-4',
                        p.id === current?.panelId && 'border-gold bg-gold-100 text-navy-900',
                      )}
                    >
                      <span>{p.id}</span>
                      <span className="text-ink-3">{p.pieces}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {current ? <SvgView key={current.panelId} svg={current.svg} label={`Sheet ${current.panelId}`} className="animate-fade-in" /> : null}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
