'use client';

import { CircleCheckIcon, DownloadIcon, PrinterIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Problems, Warnings } from './problems';
import { SvgView } from './svg-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadBytes, downloadText } from '@/lib/download';
import { baseName, fileLabel, formatSize, mimeOf, planOf, sheetsOf, zipName } from '@/lib/files';
import { cn } from '@/lib/utils';
import { zipFiles } from '@/lib/zip';
import type { GenerateResult } from '@/types/panels';

export interface ResultViewProps {
  result: GenerateResult | undefined;
  pending: boolean;
  /** Arquivo de projeto do app (projeto + leitura): entra no zip e na lista, para o pacote ser reproduzível (M2). */
  projectFile?: string | undefined;
  /** O draft mudou depois que este resultado saiu (M2). */
  stale?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: (() => void) | undefined;
}

/** Nome do arquivo de projeto dentro do zip (ao lado de `cutlist.csv`, `plan.svg`…). */
export const PROJECT_FILE_IN_ZIP = 'project.panelizer.json';

/** Resultado do motor: vazio, carregando, problemas, ou resumo + abas Plan / Sheets / Files, zip e impressão. */
export function ResultView({ result, pending, projectFile, stale = false, canRegenerate = false, onRegenerate }: ResultViewProps) {
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
  return <Generated result={result} projectFile={projectFile} stale={stale} canRegenerate={canRegenerate} onRegenerate={onRegenerate} />;
}

type Tab = 'plan' | 'sheets' | 'files';

function Generated({ result, projectFile, stale, canRegenerate, onRegenerate }: { result: Extract<GenerateResult, { ok: true }>; projectFile: string | undefined; stale: boolean; canRegenerate: boolean; onRegenerate: (() => void) | undefined }) {
  const plan = planOf(result.files);
  const sheets = useMemo(() => sheetsOf(result.files, result.panels), [result]);
  const files = useMemo(() => (projectFile === undefined ? result.files : [...result.files, { path: PROJECT_FILE_IN_ZIP, content: projectFile }]), [result, projectFile]);
  const panelIdByPath = useMemo(() => new Map(sheets.map((s) => [s.path, s.panelId])), [sheets]);
  const [tab, setTab] = useState<Tab>(plan === undefined ? 'sheets' : 'plan');
  const [selected, setSelected] = useState<string | undefined>(sheets[0]?.panelId);
  const [showAll, setShowAll] = useState(false);
  const [printing, setPrinting] = useState(false);
  const current = sheets.find((s) => s.panelId === selected) ?? sheets[0];
  const pieces = result.panels.reduce((n, p) => n + p.pieces, 0);
  const zip = zipName(result.projectName);

  // "Print sheets": vai para a aba Sheets com todas as folhas e imprime no render seguinte, quando o DOM
  // já tem uma `.sheet` por painel (globals.css: uma folha por página, carta paisagem).
  useEffect(() => {
    if (!printing) return;
    setPrinting(false);
    window.print();
  }, [printing]);
  const printSheets = () => {
    setTab('sheets');
    setShowAll(true);
    setPrinting(true);
  };
  const downloadAll = () => downloadBytes(zip, zipFiles(files), 'application/zip');

  return (
    <div className="space-y-4" aria-live="polite">
      {stale ? (
        <Alert variant="warning" className="no-print">
          <TriangleAlertIcon />
          <AlertTitle>Edited since these panels were generated</AlertTitle>
          <AlertDescription>
            <p>The sheets below come from an earlier revision of the project.</p>
            <Button variant="outline" size="sm" className="mt-1" disabled={!canRegenerate} onClick={onRegenerate}>
              <RefreshCwIcon /> Generate again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2 className="mr-2">{result.projectName}</h2>
        <Badge variant="secondary">{result.panels.length} panels</Badge>
        <Badge variant="secondary">{pieces} pieces to cut</Badge>
        <Badge variant="secondary">{files.length} files</Badge>
        {result.warnings.length > 0 ? (
          <Badge variant="warning">
            <TriangleAlertIcon /> {result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
          </Badge>
        ) : (
          <Badge variant="success">
            <CircleCheckIcon /> no warnings
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={printSheets} disabled={sheets.length === 0}>
            <PrinterIcon /> Print sheets
          </Button>
          <Button variant="accent" size="sm" onClick={downloadAll}>
            <DownloadIcon /> Download all
          </Button>
        </div>
      </div>
      <div className="no-print">
        <Warnings warnings={result.warnings} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="line" className="no-print h-auto gap-0 border-b border-line">
          <TabsTrigger value="plan" className="h-9 flex-none rounded-none px-3 after:bottom-0">
            Plan
          </TabsTrigger>
          <TabsTrigger value="sheets" className="h-9 flex-none rounded-none px-3 after:bottom-0">
            Sheets
          </TabsTrigger>
          <TabsTrigger value="files" className="h-9 flex-none rounded-none px-3 after:bottom-0">
            Files
          </TabsTrigger>
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
          <div className="no-print mb-3 flex items-center gap-2">
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
                        p.id === current?.panelId && 'border-selection bg-selection/8 text-navy-900',
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
        <TabsContent value="files" className="pt-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">
              The same files and folders the command line writes: CSVs open in a spreadsheet, SVGs in any browser.
              “Download all” packs them as <code>{zip}</code>.
            </p>
            <Button variant="accent" size="sm" onClick={downloadAll}>
              <DownloadIcon /> Download all
            </Button>
          </div>
          <div className="max-h-[600px] overflow-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">File</TableHead>
                  <TableHead scope="col">Contents</TableHead>
                  <TableHead scope="col" className="text-right">
                    Size
                  </TableHead>
                  <TableHead scope="col" className="w-10">
                    <span className="sr-only">Download</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.path}>
                    <TableCell className="font-mono text-[13px]">{f.path}</TableCell>
                    <TableCell className="text-ink-2">{fileLabel(f.path, panelIdByPath.get(f.path))}</TableCell>
                    <TableCell className="text-right font-mono text-[13px] text-ink-3">{formatSize(f.content)}</TableCell>
                    <TableCell className="py-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Download ${f.path}`}
                        onClick={() => downloadText(baseName(f.path), f.content, mimeOf(f.path))}
                      >
                        <DownloadIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
