'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInchesOnly, formatMeasure } from '@/lib/editor/measure';
import { cn } from '@/lib/utils';
import type { BomRow, CutRow, PanelSummary } from '@/types/panels';

export interface ResultMaterialsProps {
  bom: readonly BomRow[];
  cutLists: readonly { panelId: string; lines: CutRow[] }[];
  panels: readonly PanelSummary[];
  onOpenSheet: (panelId: string) => void;
}

const ROLE_LABEL: Readonly<Record<string, string>> = {
  plates: 'Plates',
  stud: 'Studs',
  kingStud: 'King studs',
  jackStud: 'Jack studs',
  header: 'Headers',
  sill: 'Sills',
  cripple: 'Cripples',
  block: 'Blocks',
};

const KIND_LABEL: Readonly<Record<BomRow['kind'], string>> = { commercial: 'stock', precut: 'precut', engineered: 'engineered', oversize: 'oversize' };

/** Comprimento de estoque como a fábrica o chama: comercial em pés (`8'-0"`), pré-corte e o resto em polegadas (`92 5/8"`). */
export function stockLabel(row: Pick<BomRow, 'stockLength' | 'kind'>): string {
  return row.kind === 'commercial' ? formatMeasure(row.stockLength) : formatInchesOnly(row.stockLength);
}

interface SectionGroup {
  section: string;
  rows: BomRow[];
  qty: number;
  /** Pés lineares comprados. */
  feet: number;
}

export function groupBySection(bom: readonly BomRow[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const row of bom) {
    let g = groups.find((x) => x.section === row.section);
    if (g === undefined) {
      g = { section: row.section, rows: [], qty: 0, feet: 0 };
      groups.push(g);
    }
    g.rows.push(row);
    g.qty += row.qty;
    g.feet += (row.qty * row.stockLength) / 12;
  }
  return groups;
}

const fmtFeet = (feet: number): string => `${Math.round(feet).toLocaleString('en-US')} ft`;

/**
 * Aba Materials (M3): a lista de material consolidada na tela — por seção, com subtotal de peças e pés lineares —
 * e, abaixo, a lista de corte de cada painel. São os mesmos números de `bom.csv` e `cutlist.csv`; a sobra é um
 * teto (sem otimização de corte, docs do core).
 */
export function ResultMaterials({ bom, cutLists, panels, onOpenSheet }: ResultMaterialsProps) {
  const groups = useMemo(() => groupBySection(bom), [bom]);
  const totalQty = groups.reduce((n, g) => n + g.qty, 0);
  const totalFeet = groups.reduce((n, g) => n + g.feet, 0);
  const weights = panels.map((p) => p.weightLb).filter((w): w is number => w !== undefined);
  const totalWeight = weights.length === 0 ? undefined : weights.reduce((a, b) => a + b, 0);
  const byPanel = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);
  const bought = bom.reduce((n, r) => n + r.qty * r.stockLength, 0);
  const waste = bom.reduce((n, r) => n + r.waste, 0);
  const wastePercent = bought === 0 ? 0 : Math.round((waste / bought) * 1000) / 10;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3>Bill of materials</h3>
          <p className="text-[13px] text-ink-2">
            One stock piece per cut, the shortest that fits; no offcut reuse, so waste is an upper bound.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{totalQty.toLocaleString('en-US')} pieces to buy</Badge>
          <Badge variant="secondary">{fmtFeet(totalFeet)} linear</Badge>
          <Badge variant="secondary">{wastePercent}% waste at most</Badge>
          {totalWeight !== undefined ? <Badge variant="secondary">{Math.round(totalWeight).toLocaleString('en-US')} lb of lumber</Badge> : null}
        </div>
        <div className="overflow-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Section</TableHead>
                <TableHead scope="col">Stock length</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col" className="text-right">
                  Qty
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Cut total
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Waste
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <GroupRows key={g.section} group={g} />
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">
                  Total
                </TableCell>
                <TableCell className="text-right font-mono text-[13px] font-semibold">{totalQty.toLocaleString('en-US')}</TableCell>
                <TableCell className="text-right font-mono text-[13px]">{fmtFeet(totalFeet)} bought</TableCell>
                <TableCell className="text-right font-mono text-[13px]">{wastePercent}%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3>Cut lists</h3>
          <p className="text-[13px] text-ink-2">One per panel, in the order of the sheets; plies count as pieces.</p>
        </div>
        <div className="divide-y divide-line-faint rounded-md border bg-card">
          {cutLists.map((c) => {
            const p = byPanel.get(c.panelId);
            const pieces = c.lines.reduce((n, l) => n + l.qty, 0);
            return (
              <details key={c.panelId} className="group px-4 py-2">
                <summary className="flex cursor-pointer list-none items-center gap-3 select-none [&::-webkit-details-marker]:hidden">
                  <span className="font-mono text-[13px] font-semibold">{c.panelId}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                    {p !== undefined ? `${formatMeasure(p.length)} · ` : ''}
                    {pieces} pieces
                    {p?.weightLb !== undefined ? ` · ${Math.round(p.weightLb)} lb` : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenSheet(c.panelId);
                    }}
                  >
                    <ExternalLinkIcon /> Sheet
                  </Button>
                </summary>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Piece</TableHead>
                      <TableHead scope="col">Section</TableHead>
                      <TableHead scope="col" className="text-right">
                        Length
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Qty
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.lines.map((l, i) => (
                      <TableRow key={`${l.role}-${l.section}-${l.length}-${i}`}>
                        <TableCell>{ROLE_LABEL[l.role] ?? l.role}</TableCell>
                        <TableCell className="font-mono text-[13px]">{l.section}</TableCell>
                        <TableCell className="text-right font-mono text-[13px]">
                          {formatMeasure(l.length)} <span className="text-ink-3">({formatInchesOnly(l.length)})</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-[13px]">{l.qty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function GroupRows({ group }: { group: SectionGroup }) {
  return (
    <>
      {group.rows.map((r, i) => (
        <TableRow key={`${r.section}-${r.kind}-${r.stockLength}`}>
          <TableCell className={cn('font-mono text-[13px] font-semibold', i > 0 && 'text-transparent')} aria-hidden={i > 0 || undefined}>
            {r.section}
          </TableCell>
          <TableCell className="font-mono text-[13px]">{stockLabel(r)}</TableCell>
          <TableCell>
            {r.kind === 'commercial' ? (
              <span className="text-ink-2">{KIND_LABEL[r.kind]}</span>
            ) : (
              <Badge variant={r.kind === 'oversize' ? 'warning' : 'outline'} className="font-mono">
                {KIND_LABEL[r.kind]}
              </Badge>
            )}
          </TableCell>
          <TableCell className="text-right font-mono text-[13px]">{r.qty}</TableCell>
          <TableCell className="text-right font-mono text-[13px] text-ink-2">{formatMeasure(r.cutTotal)}</TableCell>
          <TableCell className="text-right font-mono text-[13px] text-ink-2">{r.wastePercent}%</TableCell>
        </TableRow>
      ))}
      <TableRow className="bg-paper-2/60 hover:bg-paper-2/60">
        <TableCell className="font-mono text-[13px] text-ink-2">{group.section}</TableCell>
        <TableCell colSpan={2} className="text-[12px] text-ink-2">
          subtotal
        </TableCell>
        <TableCell className="text-right font-mono text-[13px] font-semibold">{group.qty}</TableCell>
        <TableCell className="text-right font-mono text-[13px] text-ink-2">{fmtFeet(group.feet)}</TableCell>
        <TableCell />
      </TableRow>
    </>
  );
}
