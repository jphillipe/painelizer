'use client';

import { CircleCheckIcon, DownloadIcon, PrinterIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadBytes, downloadText } from '@/lib/download';
import type { IdIndex } from '@/lib/editor/problems';
import { baseName, fileLabel, formatSize, mimeOf, planOf, sheetsOf, zipName } from '@/lib/files';
import { zipFiles } from '@/lib/zip';
import type { GenerateResult } from '@/types/panels';
import { PlanView } from './plan-view';
import { Problems } from './problems';
import { ResultMaterials } from './result-materials';
import { ResultSheets } from './result-sheets';
import { ResultWarnings } from './result-warnings';

export interface ResultViewProps {
  result: GenerateResult | undefined;
  pending: boolean;
  /** Arquivo de projeto do app (projeto + leitura): entra no zip e na lista, para o pacote ser reproduzível (M2). */
  projectFile?: string | undefined;
  /** O draft mudou depois que este resultado saiu (M2). */
  stale?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: (() => void) | undefined;
  /** Ids do projeto, para os avisos acharem parede e abertura (M3). */
  ids?: IdIndex | undefined;
}

/** Nome do arquivo de projeto dentro do zip (ao lado de `cutlist.csv`, `plan.svg`…). */
export const PROJECT_FILE_IN_ZIP = 'project.panelizer.json';

/** Resultado do motor: vazio, carregando, problemas, ou resumo + abas Plan / Sheets / Materials / Files, zip e impressão. */
export function ResultView({ result, pending, projectFile, stale = false, canRegenerate = false, onRegenerate, ids }: ResultViewProps) {
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
        Nothing generated yet. Go back to the review and press “Generate panels”.
      </div>
    );
  }
  if (!result.ok) return <Problems problems={result.problems} />;
  return <Generated result={result} projectFile={projectFile} stale={stale} canRegenerate={canRegenerate} onRegenerate={onRegenerate} ids={ids} />;
}

type Tab = 'plan' | 'sheets' | 'materials' | 'files';

const TAB_CLASS = 'h-9 flex-none rounded-none px-3 after:bottom-0';

/** Nº de avisos por painel: os avisos do motor começam com o id do painel. */
export function warningsByPanel(warnings: readonly string[], panelIds: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of warnings) {
    const id = panelIds.find((p) => w.startsWith(`${p} `));
    if (id !== undefined) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

function Generated({ result, projectFile, stale, canRegenerate, onRegenerate, ids }: { result: Extract<GenerateResult, { ok: true }>; projectFile: string | undefined; stale: boolean; canRegenerate: boolean; onRegenerate: (() => void) | undefined; ids: IdIndex | undefined }) {
  const plan = planOf(result.files);
  const sheets = useMemo(() => sheetsOf(result.files, result.panels), [result]);
  const files = useMemo(() => (projectFile === undefined ? result.files : [...result.files, { path: PROJECT_FILE_IN_ZIP, content: projectFile }]), [result, projectFile]);
  const panelIdByPath = useMemo(() => new Map(sheets.map((s) => [s.path, s.panelId])), [sheets]);
  const perPanel = useMemo(() => warningsByPanel(result.warnings, result.panels.map((p) => p.id)), [result]);
  const [tab, setTab] = useState<Tab>(plan === undefined ? 'sheets' : 'plan');
  const [selected, setSelected] = useState<string | undefined>(sheets[0]?.panelId);
  const [showAll, setShowAll] = useState(false);
  const [printing, setPrinting] = useState(false);
  const pieces = result.panels.reduce((n, p) => n + p.pieces, 0);
  const weights = result.panels.map((p) => p.weightLb).filter((w): w is number => w !== undefined);
  const weight = weights.length === 0 ? undefined : Math.round(weights.reduce((a, b) => a + b, 0));
  const zip = zipName(result.projectName);

  // Imprimir: na aba Sheets, no render seguinte (o DOM precisa ter as `.sheet`; globals.css põe uma por página).
  useEffect(() => {
    if (!printing) return;
    setPrinting(false);
    window.print();
  }, [printing]);
  const printAll = () => {
    setTab('sheets');
    setShowAll(true);
    setPrinting(true);
  };
  const printOne = () => {
    setTab('sheets');
    setShowAll(false);
    setPrinting(true);
  };
  const openSheet = (panelId: string) => {
    setSelected(panelId);
    setShowAll(false);
    setTab('sheets');
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
      <div className="no-print space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2">{result.projectName}</h2>
          <Badge variant="secondary">{result.panels.length} panels</Badge>
          <Badge variant="secondary">{pieces} pieces to cut</Badge>
          {weight !== undefined ? <Badge variant="secondary">{weight.toLocaleString('en-US')} lb</Badge> : null}
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
            <Button variant="outline" size="sm" onClick={printAll} disabled={sheets.length === 0}>
              <PrinterIcon /> Print all sheets
            </Button>
            <Button variant="accent" size="sm" onClick={downloadAll}>
              <DownloadIcon /> Download all
            </Button>
          </div>
        </div>
        <p className="text-sm text-ink-2">
          {result.warnings.length === 0
            ? 'Every panel built. Click a panel on the plan to open its sheet; Materials has the lumber to buy.'
            : `Every panel built, with ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'} to review below before cutting.`}
        </p>
      </div>
      <div className="no-print">
        <ResultWarnings warnings={result.warnings} panels={result.panels} ids={ids} onOpenSheet={openSheet} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="line" className="no-print h-auto gap-0 border-b border-line">
          <TabsTrigger value="plan" className={TAB_CLASS} disabled={plan === undefined}>
            Plan
          </TabsTrigger>
          <TabsTrigger value="sheets" className={TAB_CLASS}>
            Sheets
          </TabsTrigger>
          <TabsTrigger value="materials" className={TAB_CLASS}>
            Materials
          </TabsTrigger>
          <TabsTrigger value="files" className={TAB_CLASS}>
            Files
          </TabsTrigger>
        </TabsList>
        <TabsContent value="plan" className="pt-3">
          {plan === undefined ? (
            <p className="rounded-md border border-dashed bg-paper-2 p-6 text-ink-3">No plan for this project: its walls are loose (length only), not placed on a plan.</p>
          ) : (
            <div className="space-y-2">
              <p className="no-print text-[13px] text-ink-2">Click a panel to open its sheet.</p>
              <PlanView svg={plan} selected={selected} onPanel={openSheet} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="sheets" className="pt-3">
          <ResultSheets sheets={sheets} panels={result.panels} warningsByPanel={perPanel} selected={selected} onSelect={setSelected} showAll={showAll} onShowAll={setShowAll} onPrint={printOne} />
        </TabsContent>
        <TabsContent value="materials" className="pt-3">
          <ResultMaterials bom={result.bom} cutLists={result.cutLists} panels={result.panels} onOpenSheet={openSheet} />
        </TabsContent>
        <TabsContent value="files" className="pt-3">
          <p className="mb-3 text-sm text-ink-2">
            The same files and folders the command line writes: CSVs open in a spreadsheet, SVGs in any browser. “Download all” packs them as <code>{zip}</code>.
          </p>
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
                      <Button variant="ghost" size="icon-sm" aria-label={`Download ${f.path}`} onClick={() => downloadText(baseName(f.path), f.content, mimeOf(f.path))}>
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
