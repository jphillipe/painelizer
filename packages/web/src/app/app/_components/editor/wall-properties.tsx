'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { Dispatch } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isIdFree, isPlanWall, type DraftWall, type ProjectDraft } from '@/lib/editor/draft';
import { formatMeasure } from '@/lib/editor/measure';
import type { Issue } from '@/lib/editor/problems';
import { confidenceTone, type WallProvenance } from '@/lib/editor/provenance';
import { resolveDraftOpening } from '@/lib/editor/resolve';
import type { EditorAction, Selection } from '@/lib/editor/state';
import { BoolSelect, EnumSelect, Field, MeasureInput, NumberInput, Section, TextInput } from './fields';
import { IssueCallout } from './issue-callout';

export interface WallPropertiesProps {
  draft: ProjectDraft;
  wall: DraftWall;
  provenance: WallProvenance | undefined;
  issues: readonly Issue[];
  dispatch: Dispatch<EditorAction>;
  onSelect: (s: Selection) => void;
  /** Workspace (S21.4): issues no topo, seções recolhíveis (Framing fechada quando não tem issue), leitura da IA em uma linha. */
  collapsible?: boolean;
}

/** Painel de propriedades da parede: identidade, geometria (planta ou solta), framing, aberturas, proveniência. */
export function WallProperties({ draft, wall, provenance, issues, dispatch, onSelect, collapsible = false }: WallPropertiesProps) {
  const id = wall.id;
  const set = (patch: Extract<EditorAction, { type: 'updateWall' }>['patch']): void => dispatch({ type: 'updateWall', wallId: id, patch });
  const plan = isPlanWall(wall);
  const setEnds = (end: 'start' | 'end', v: string | undefined): void => {
    const ends = { ...(wall.ends ?? {}) };
    if (v === undefined) delete ends[end];
    else ends[end] = v as 'through' | 'butt';
    set({ ends: Object.keys(ends).length === 0 ? undefined : ends });
  };
  const length = wall.length ?? (wall.start !== undefined && wall.end !== undefined ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : undefined);
  const framingIssue = issues.some((i) => /section|exterior|bearing|floors|building|king|header|wind/i.test(i.kind ?? i.code ?? i.text));

  return (
    <div className="space-y-6">
      {collapsible ? <IssueCallout issues={issues} /> : null}
      <Section
        title="Wall"
        collapsible={collapsible}
        actions={
          <Button variant="ghost" size="xs" className="text-destructive" onClick={() => dispatch({ type: 'removeWall', wallId: id })}>
            <Trash2Icon /> Remove wall
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field id={`w-${id}-id`} label="Id">
            <TextInput id={`w-${id}-id`} value={id} required mono validate={(v) => (v === id || isIdFree(draft, v, 'wall') ? undefined : 'Another wall has this id')} onCommit={(v) => v !== undefined && dispatch({ type: 'renameWall', wallId: id, newId: v })} />
          </Field>
          <Field id={`w-${id}-type`} label="Wall type" hint="Architect's tag; not used by the engine">
            <TextInput id={`w-${id}-type`} value={wall.wallType} mono onCommit={(v) => set({ wallType: v })} />
          </Field>
          <Field id={`w-${id}-level`} label="Level">
            <NumberInput id={`w-${id}-level`} value={wall.level} integer min={1} placeholder="1" onCommit={(v) => set({ level: v })} />
          </Field>
          <Field id={`w-${id}-height`} label="Height" hint="Subfloor to top of double top plate">
            <MeasureInput id={`w-${id}-height`} value={wall.height} positive onCommit={(v) => set({ height: v })} />
          </Field>
        </div>
      </Section>

      <Section title={plan ? 'Geometry (axis, from the project origin)' : 'Geometry (by length)'} collapsible={collapsible}>
        {plan ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id={`w-${id}-sx`} label="Start x">
              <MeasureInput id={`w-${id}-sx`} value={wall.start?.x} signed required onCommit={(v) => v !== undefined && dispatch({ type: 'moveEndpoint', wallId: id, end: 'start', point: { x: v, y: wall.start?.y ?? 0 } })} />
            </Field>
            <Field id={`w-${id}-sy`} label="Start y">
              <MeasureInput id={`w-${id}-sy`} value={wall.start?.y} signed required onCommit={(v) => v !== undefined && dispatch({ type: 'moveEndpoint', wallId: id, end: 'start', point: { x: wall.start?.x ?? 0, y: v } })} />
            </Field>
            <Field id={`w-${id}-ex`} label="End x">
              <MeasureInput id={`w-${id}-ex`} value={wall.end?.x} signed required onCommit={(v) => v !== undefined && dispatch({ type: 'moveEndpoint', wallId: id, end: 'end', point: { x: v, y: wall.end?.y ?? 0 } })} />
            </Field>
            <Field id={`w-${id}-ey`} label="End y">
              <MeasureInput id={`w-${id}-ey`} value={wall.end?.y} signed required onCommit={(v) => v !== undefined && dispatch({ type: 'moveEndpoint', wallId: id, end: 'end', point: { x: wall.end?.x ?? 0, y: v } })} />
            </Field>
            <Field id={`w-${id}-len`} label="Length (axis)" hint="Moves the end along the axis">
              <MeasureInput id={`w-${id}-len`} value={length} positive required onCommit={(v) => v !== undefined && dispatch({ type: 'setWallLength', wallId: id, length: v })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id={`w-${id}-es`} label="Start corner">
                <EnumSelect id={`w-${id}-es`} value={wall.ends?.start} noneLabel="Auto" options={END_OPTIONS} onChange={(v) => setEnds('start', v)} />
              </Field>
              <Field id={`w-${id}-ee`} label="End corner">
                <EnumSelect id={`w-${id}-ee`} value={wall.ends?.end} noneLabel="Auto" options={END_OPTIONS} onChange={(v) => setEnds('end', v)} />
              </Field>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id={`w-${id}-len`} label="Length">
              <MeasureInput id={`w-${id}-len`} value={wall.length} positive required onCommit={(v) => v !== undefined && dispatch({ type: 'setWallLength', wallId: id, length: v })} />
            </Field>
            <Field id={`w-${id}-lo`} label="Layout origin" hint="Building mark 0 in wall x; negative when the panel starts mid-wall">
              <MeasureInput id={`w-${id}-lo`} value={wall.layoutOrigin} signed placeholder="0" onCommit={(v) => set({ layoutOrigin: v })} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Framing" collapsible={collapsible} defaultOpen={!collapsible || framingIssue || wall.section === undefined || wall.exterior === undefined || wall.bearing === undefined}>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`w-${id}-section`} label="Section">
            <EnumSelect id={`w-${id}-section`} value={wall.section} noneLabel="Not set" options={SECTION_OPTIONS} onChange={(v) => set({ section: v as DraftWall['section'] })} />
          </Field>
          <Field id={`w-${id}-ext`} label="Position">
            <BoolSelect id={`w-${id}-ext`} value={wall.exterior} trueLabel="Exterior" falseLabel="Interior" onChange={(v) => set({ exterior: v })} />
          </Field>
          <Field id={`w-${id}-bearing`} label="Load">
            <BoolSelect id={`w-${id}-bearing`} value={wall.bearing} trueLabel="Bearing" falseLabel="Non-bearing" onChange={(v) => set({ bearing: v })} />
          </Field>
          <Field id={`w-${id}-floors`} label="Floors above" hint="Bearing walls: for the IRC header table">
            <NumberInput id={`w-${id}-floors`} value={wall.floorsSupported} integer min={0} placeholder="0" onCommit={(v) => set({ floorsSupported: v })} />
          </Field>
          <Field id={`w-${id}-span`} label="Floor span">
            <EnumSelect id={`w-${id}-span`} value={wall.floorSpan} noneLabel="Worst case" options={SPAN_OPTIONS} onChange={(v) => set({ floorSpan: v as DraftWall['floorSpan'] })} />
          </Field>
          <Field id={`w-${id}-bw`} label="Building width" hint="Overrides the project's (L-shaped house)">
            <MeasureInput id={`w-${id}-bw`} value={wall.buildingWidth} positive placeholder="project" onCommit={(v) => set({ buildingWidth: v })} />
          </Field>
        </div>
      </Section>

      <Section
        title={`Openings (${wall.openings.length})`}
        collapsible={collapsible}
        actions={
          <Button variant="outline" size="xs" onClick={() => dispatch({ type: 'addOpening', wallId: id })}>
            <PlusIcon /> Add opening
          </Button>
        }
      >
        {wall.openings.length === 0 ? (
          <p className="text-[13px] text-ink-3">No openings. A wall with no door or window frames as studs only.</p>
        ) : (
          <ul className="divide-y divide-line-faint rounded-md border bg-card">
            {wall.openings.map((o) => {
              const r = resolveDraftOpening(draft, o);
              return (
                <li key={o.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-paper-2" onClick={() => onSelect({ kind: 'opening', wallId: id, openingId: o.id })}>
                    <span className="font-mono font-semibold">{o.id}</span>
                    <span className="font-mono text-ink-3">
                      {r.ok ? `${r.opening.type} ${formatMeasure(r.opening.roughWidth)} × ${formatMeasure(r.opening.roughHeight)} · edge ${formatMeasure(r.opening.offset)}` : 'unresolved'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {provenance !== undefined ? (
        <Section title="From the AI reading" collapsible={collapsible} defaultOpen={!collapsible || confidenceTone(provenance.confidence) !== 'success'}>
          <div className="space-y-1 text-[13px]">
            <p>
              Confidence <Badge variant={TONE_VARIANT[confidenceTone(provenance.confidence)]} className="font-mono">{provenance.confidence.toFixed(2)}</Badge>
              {provenance.wallType !== null ? <span className="ml-2 text-ink-3">type {provenance.wallType}</span> : null}
            </p>
            {collapsible ? (
              <details className="text-ink-2">
                <summary className="cursor-pointer text-ink-3 select-none">Evidence</summary>
                <p className="mt-1">{provenance.evidence}</p>
              </details>
            ) : (
              <p className="text-ink-2">{provenance.evidence}</p>
            )}
          </div>
        </Section>
      ) : null}

      {issues.length > 0 && !collapsible ? (
        <Section title={`Issues on this wall (${issues.length})`}>
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

const END_OPTIONS = [
  { value: 'through', label: 'Through (plate runs to the outer face)' },
  { value: 'butt', label: 'Butt (plate stops at the inner face)' },
] as const;
const SECTION_OPTIONS = [
  { value: '2x4', label: '2x4' },
  { value: '2x6', label: '2x6' },
] as const;
const SPAN_OPTIONS = [
  { value: 'center', label: 'Center bearing' },
  { value: 'clear', label: 'Clear span' },
] as const;
/** Confiança da IA → variante do Badge (chip claro, docs/10-design.md §3). */
export const TONE_VARIANT = { success: 'success', warning: 'warning', destructive: 'destructive' } as const;
