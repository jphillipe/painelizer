'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInchesOnly, formatMeasure } from '@/lib/editor/measure';
import { cn } from '@/lib/utils';
import type { BomRow, CutRow, PanelSummary, SheathingRow } from '@/types/panels';

export interface ResultMaterialsProps {
  bom: readonly BomRow[];
  /** Chapas de sheathing (S38); ausente ou vazia = nenhum painel leva chapa. */
  sheathing?: readonly SheathingRow[] | undefined;
  /** Orçamento (S31): presente quando o projeto tem `config.prices`; liga as colunas de preço. */
  cost?: { total: number; unpriced: number } | undefined;
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
  post: 'Posts',
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
  /** Soma dos custos das linhas com preço. */
  cost: number;
}

export function groupBySection(bom: readonly BomRow[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const row of bom) {
    let g = groups.find((x) => x.section === row.section);
    if (g === undefined) {
      g = { section: row.section, rows: [], qty: 0, feet: 0, cost: 0 };
      groups.push(g);
    }
    g.rows.push(row);
    g.qty += row.qty;
    g.feet += (row.qty * row.stockLength) / 12;
    g.cost = Math.round((g.cost + (row.cost ?? 0)) * 100) / 100;
  }
  return groups;
}

const fmtFeet = (feet: number): string => `${Math.round(feet).toLocaleString('en-US')} ft`;

/** Preço com duas casas (US$, a moeda das fábricas atendidas; o motor não converte). */
export const fmtMoney = (v: number): string => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Aba Materials (M3): a lista de material consolidada na tela — por seção, com subtotal de peças e pés lineares —
 * e, abaixo, a lista de corte de cada painel. São os mesmos números de `bom.csv` e `cutlist.csv`; a sobra é um
 * teto (sem otimização de corte, docs do core). Com `config.prices` (S31), colunas de preço unitário e custo, como o
 * `cost.csv`; linha sem preço na tabela mostra "—" e fica fora do total.
 */
export function ResultMaterials({ bom, sheathing = [], cost, cutLists, panels, onOpenSheet }: ResultMaterialsProps) {
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
          {totalWeight !== undefined ? (
            <Badge variant="secondary">
              {Math.round(totalWeight).toLocaleString('en-US')} lb {sheathing.length > 0 ? 'of lumber and sheathing' : 'of lumber'}
            </Badge>
          ) : null}
          {cost !== undefined ? <Badge variant="secondary">{fmtMoney(cost.total)} lumber cost</Badge> : null}
          {cost !== undefined && cost.unpriced > 0 ? (
            <Badge variant="warning">
              {cost.unpriced} {cost.unpriced === 1 ? 'line' : 'lines'} without price
            </Badge>
          ) : null}
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
                {cost !== undefined ? (
                  <>
                    <TableHead scope="col" className="text-right">
                      Unit price
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Cost
                    </TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <GroupRows key={g.section} group={g} priced={cost !== undefined} />
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
                {cost !== undefined ? (
                  <>
                    <TableCell />
                    <TableCell className="text-right font-mono text-[13px] font-semibold">{fmtMoney(cost.total)}</TableCell>
                  </>
                ) : null}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>

      {sheathing.length > 0 ? <SheathingTable rows={sheathing} priced={cost !== undefined} /> : null}

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

function GroupRows({ group, priced }: { group: SectionGroup; priced: boolean }) {
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
          {priced ? (
            <>
              <TableCell className="text-right font-mono text-[13px] text-ink-2">{r.unitPrice === undefined ? '—' : fmtMoney(r.unitPrice)}</TableCell>
              <TableCell className="text-right font-mono text-[13px]">{r.cost === undefined ? '—' : fmtMoney(r.cost)}</TableCell>
            </>
          ) : null}
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
        {priced ? (
          <>
            <TableCell />
            <TableCell className="text-right font-mono text-[13px] font-semibold">{group.rows.some((r) => r.cost !== undefined) ? fmtMoney(group.cost) : '—'}</TableCell>
          </>
        ) : null}
      </TableRow>
    </>
  );
}

/**
 * Chapas de sheathing (S38): uma linha por chapa inteira (espessura × largura × altura), as mesmas do fim de `bom.csv`.
 * Uma chapa por pedaço, sem aproveitamento de sobra (a tira cortada no topo também conta); sem preço por enquanto.
 */
function SheathingTable({ rows, priced }: { rows: readonly SheathingRow[]; priced: boolean }) {
  return (
    <section className="space-y-3" aria-label="Sheathing">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3>Sheathing</h3>
        <p className="text-[13px] text-ink-2">
          One full sheet per piece on the panels; no offcut reuse, so the count and the waste are upper bounds.
          {priced ? ' Not in the cost total.' : ''}
        </p>
      </div>
      <div className="overflow-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Sheet</TableHead>
              <TableHead scope="col">Thickness</TableHead>
              <TableHead scope="col" className="text-right">
                Sheets
              </TableHead>
              <TableHead scope="col" className="text-right">
                Cut
              </TableHead>
              <TableHead scope="col" className="text-right">
                Installed
              </TableHead>
              <TableHead scope="col" className="text-right">
                Waste
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.thickness}|${r.width}|${r.height}`}>
                <TableCell className="font-mono text-[13px]">
                  {formatMeasure(r.width)} × {formatMeasure(r.height)}
                </TableCell>
                <TableCell className="font-mono text-[13px]">{formatInchesOnly(r.thickness)}</TableCell>
                <TableCell className="text-right font-mono text-[13px] font-semibold">{r.qty.toLocaleString('en-US')}</TableCell>
                <TableCell className="text-right font-mono text-[13px]">{r.cut.toLocaleString('en-US')}</TableCell>
                <TableCell className="text-right font-mono text-[13px]">{r.areaSqFt.toLocaleString('en-US')} sq ft</TableCell>
                <TableCell className="text-right font-mono text-[13px]">{r.wastePercent}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
