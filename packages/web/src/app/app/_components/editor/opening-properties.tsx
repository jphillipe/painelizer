'use client';

import { Trash2Icon } from 'lucide-react';
import type { Dispatch } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isIdFree, type DraftOpening, type DraftWall, type ProjectDraft } from '@/lib/editor/draft';
import { formatMeasure } from '@/lib/editor/measure';
import type { Issue } from '@/lib/editor/problems';
import { confidenceTone, type OpeningProvenance } from '@/lib/editor/provenance';
import { catalogTags, headerMarks, openingWidth, resolveDraftOpening } from '@/lib/editor/resolve';
import type { EditorAction } from '@/lib/editor/state';
import { cn } from '@/lib/utils';
import { EnumSelect, Field, MeasureInput, NumberInput, Section, TextInput } from './fields';
import { TONE_CLASS } from './wall-properties';

export interface OpeningPropertiesProps {
  draft: ProjectDraft;
  wall: DraftWall;
  opening: DraftOpening;
  provenance: OpeningProvenance | undefined;
  issues: readonly Issue[];
  dispatch: Dispatch<EditorAction>;
}

const RO = '__ro__';
const SPEC = '__spec__';
const round = (n: number): number => Math.round(n * 16) / 16;

/**
 * Painel de propriedades da abertura: tamanho por tag do schedule ou RO manual, posição por centro ou borda
 * (convertidas com a largura resolvida), header por marca do schedule, especificado aqui ou pela tabela.
 */
export function OpeningProperties({ draft, wall, opening, provenance, issues, dispatch }: OpeningPropertiesProps) {
  const o = opening;
  const id = o.id;
  const set = (patch: Extract<EditorAction, { type: 'updateOpening' }>['patch']): void => dispatch({ type: 'updateOpening', wallId: wall.id, openingId: id, patch });
  const tags = catalogTags(draft.config);
  const marks = headerMarks(draft.config);
  const resolved = resolveDraftOpening(draft, o);
  const width = openingWidth(draft, o);
  const entry = o.tag === undefined ? undefined : draft.config.openingTypes?.[o.tag];
  const kind = o.type ?? entry?.kind;
  const sizeBy = o.tag ?? RO;
  const positionBy = o.center !== undefined ? 'center' : 'offset';
  const headerBy = o.headerMark ?? (o.header !== undefined ? SPEC : undefined);

  return (
    <div className="space-y-6">
      <Section
        title={`Opening on ${wall.id}`}
        actions={
          <Button variant="ghost" size="xs" className="text-destructive" onClick={() => dispatch({ type: 'removeOpening', wallId: wall.id, openingId: id })}>
            <Trash2Icon /> Remove opening
          </Button>
        }
      >
        <div className="rounded-md border bg-paper-2 px-3 py-2 font-mono text-[13px]">
          {resolved.ok ? (
            <>
              {resolved.opening.type} · RO {formatMeasure(resolved.opening.roughWidth)} × {formatMeasure(resolved.opening.roughHeight)} · left edge {formatMeasure(resolved.opening.offset)}
              {resolved.opening.headerHeight !== undefined ? ` · top of RO ${formatMeasure(resolved.opening.headerHeight)}` : ' · header under the top plate'}
            </>
          ) : (
            <span className="text-destructive">{resolved.message}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`o-${id}-id`} label="Id">
            <TextInput id={`o-${id}-id`} value={id} required mono validate={(v) => (v === id || isIdFree(draft, v, 'opening') ? undefined : 'Another opening has this id')} onCommit={(v) => v !== undefined && dispatch({ type: 'renameOpening', wallId: wall.id, openingId: id, newId: v })} />
          </Field>
          <Field id={`o-${id}-size`} label="Size by">
            <EnumSelect
              id={`o-${id}-size`}
              value={sizeBy}
              options={[...tags.map((t) => ({ value: t, label: `Schedule ${t}${draft.config.openingTypes?.[t]?.kind === undefined ? '' : ` (${draft.config.openingTypes[t]?.kind})`}` })), { value: RO, label: 'Rough opening (typed here)' }]}
              onChange={(v) => {
                if (v === undefined || v === RO) {
                  const rw = resolved.ok ? resolved.opening.roughWidth : (o.roughWidth ?? 36);
                  const rh = resolved.ok ? resolved.opening.roughHeight : (o.roughHeight ?? 48);
                  set({ tag: undefined, type: kind ?? 'window', roughWidth: rw, roughHeight: rh });
                } else {
                  set({ tag: v, type: undefined, roughWidth: undefined, roughHeight: undefined });
                }
              }}
            />
          </Field>
          {o.tag === undefined ? (
            <>
              <Field id={`o-${id}-type`} label="Type">
                <EnumSelect id={`o-${id}-type`} value={o.type} noneLabel="Not set" options={TYPE_OPTIONS} onChange={(v) => set({ type: v as DraftOpening['type'] })} />
              </Field>
              <div />
              <Field id={`o-${id}-rw`} label="RO width">
                <MeasureInput id={`o-${id}-rw`} value={o.roughWidth} positive required onCommit={(v) => set({ roughWidth: v })} />
              </Field>
              <Field id={`o-${id}-rh`} label="RO height">
                <MeasureInput id={`o-${id}-rh`} value={o.roughHeight} positive required onCommit={(v) => set({ roughHeight: v })} />
              </Field>
            </>
          ) : (
            <>
              <Field id={`o-${id}-rw`} label="RO width override" hint={entry?.roughWidth !== undefined ? `schedule: ${formatMeasure(entry.roughWidth)}` : 'empty: schedule size + default clearance'}>
                <MeasureInput id={`o-${id}-rw`} value={o.roughWidth} positive placeholder="schedule" onCommit={(v) => set({ roughWidth: v })} />
              </Field>
              <Field id={`o-${id}-rh`} label="RO height override" hint={entry?.roughHeight !== undefined ? `schedule: ${formatMeasure(entry.roughHeight)}` : 'empty: schedule size + default clearance'}>
                <MeasureInput id={`o-${id}-rh`} value={o.roughHeight} positive placeholder="schedule" onCommit={(v) => set({ roughHeight: v })} />
              </Field>
            </>
          )}
        </div>
      </Section>

      <Section title="Position (from the wall start)">
        <div className="grid grid-cols-2 gap-3">
          <Field id={`o-${id}-posby`} label="Given as">
            <EnumSelect
              id={`o-${id}-posby`}
              value={positionBy}
              options={POSITION_OPTIONS}
              onChange={(v) => {
                if (v === positionBy) return;
                if (v === 'center') set({ center: round((o.offset ?? 0) + width / 2), offset: undefined });
                else set({ offset: round(Math.max(0, (o.center ?? width / 2) - width / 2)), center: undefined });
              }}
            />
          </Field>
          {positionBy === 'center' ? (
            <Field id={`o-${id}-center`} label="Center of RO" hint={`RO width ${formatMeasure(width)}`}>
              <MeasureInput id={`o-${id}-center`} value={o.center} required onCommit={(v) => v !== undefined && set({ center: v })} />
            </Field>
          ) : (
            <Field id={`o-${id}-offset`} label="Left edge of RO" hint={`RO width ${formatMeasure(width)}`}>
              <MeasureInput id={`o-${id}-offset`} value={o.offset} required onCommit={(v) => v !== undefined && set({ offset: v })} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Heights">
        <div className="grid grid-cols-2 gap-3">
          {kind !== 'door' ? (
            <Field id={`o-${id}-sill`} label="Sill height" hint="Bottom of RO above subfloor (windows)">
              <MeasureInput id={`o-${id}-sill`} value={o.sillHeight} placeholder={entry?.sillHeight !== undefined ? `schedule ${formatMeasure(entry.sillHeight)}` : 'project'} onCommit={(v) => set({ sillHeight: v })} />
            </Field>
          ) : null}
          <Field id={`o-${id}-hh`} label="Top of RO" hint="Underside of the header; empty = project default">
            <MeasureInput id={`o-${id}-hh`} value={o.headerHeight} positive placeholder={draft.config.headerHeight !== undefined ? formatMeasure(draft.config.headerHeight) : 'top plate'} onCommit={(v) => set({ headerHeight: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Header and studs">
        <div className="grid grid-cols-2 gap-3">
          <Field id={`o-${id}-hby`} label="Header">
            <EnumSelect
              id={`o-${id}-hby`}
              value={headerBy}
              noneLabel="IRC table / flat (engine decides)"
              options={[...marks.map((m) => ({ value: m, label: `Schedule ${m}` })), { value: SPEC, label: 'Specified here' }]}
              onChange={(v) => {
                if (v === undefined) set({ headerMark: undefined, header: undefined });
                else if (v === SPEC) set({ headerMark: undefined, header: o.header ?? { section: '2x10', plies: 2 } });
                else set({ headerMark: v, header: undefined });
              }}
            />
          </Field>
          {o.header !== undefined ? (
            <>
              <Field id={`o-${id}-hs`} label="Header section" hint={`2x10, LVL 1.75x9.25`}>
                <TextInput id={`o-${id}-hs`} value={typeof o.header.section === 'string' ? o.header.section : o.header.section === undefined ? undefined : `${o.header.section.material} ${o.header.section.width}x${o.header.section.depth}`} required mono onCommit={(v) => v !== undefined && set({ header: { ...o.header, section: v } })} />
              </Field>
              <Field id={`o-${id}-hp`} label="Plies">
                <NumberInput id={`o-${id}-hp`} value={o.header.plies} integer min={1} required onCommit={(v) => v !== undefined && set({ header: { ...o.header, plies: v } })} />
              </Field>
            </>
          ) : null}
          <Field id={`o-${id}-jacks`} label="Jack studs per side" hint="Empty: table or schedule">
            <NumberInput id={`o-${id}-jacks`} value={o.jackStuds} integer min={1} placeholder="auto" onCommit={(v) => set({ jackStuds: v })} />
          </Field>
          <Field id={`o-${id}-kings`} label="King studs per side" hint="Empty: wind table (exterior) or 1">
            <NumberInput id={`o-${id}-kings`} value={o.kingStuds} integer min={1} placeholder="auto" onCommit={(v) => set({ kingStuds: v })} />
          </Field>
        </div>
      </Section>

      {provenance !== undefined ? (
        <Section title="From the AI reading">
          <p className="text-[13px]">
            Confidence <Badge className={cn('font-mono', TONE_CLASS[confidenceTone(provenance.confidence)])}>{provenance.confidence.toFixed(2)}</Badge>
            <span className="ml-2 font-mono text-ink-3">
              {provenance.kind} @ {provenance.position}
            </span>
          </p>
        </Section>
      ) : null}

      {issues.length > 0 ? (
        <Section title={`Issues on this opening (${issues.length})`}>
          <ul className="space-y-1 font-mono text-[12px]">
            {issues.map((i, n) => (
              <li key={`${n}-${i.text}`} className={i.severity === 'problem' ? 'text-destructive' : 'text-warning'}>
                {i.text}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: 'window', label: 'Window' },
  { value: 'door', label: 'Door' },
] as const;
const POSITION_OPTIONS = [
  { value: 'center', label: 'Center (as the plan dimensions it)' },
  { value: 'offset', label: 'Left edge of the RO' },
] as const;
