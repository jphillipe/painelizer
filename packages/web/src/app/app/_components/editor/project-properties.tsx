'use client';

import type { Dispatch } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DraftConfig, DraftPanelConfig, ProjectDraft } from '@/lib/editor/draft';
import { formatMeasure } from '@/lib/editor/measure';
import type { EditorAction } from '@/lib/editor/state';
import type { ExtractOutcome } from '@/types/extract';
import { ProjectDataForm } from '../project-data-form';
import { EnumSelect, Field, MeasureInput, MeasureListInput, NumberInput, Section, TextInput } from './fields';

export interface ProjectPropertiesProps {
  draft: ProjectDraft;
  dispatch: Dispatch<EditorAction>;
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  dirty: boolean;
  onOutcome: (outcome: ExtractOutcome) => void;
  /** O card de dados do projeto já está no topo do editor (pede dados): não repetir aqui. */
  showProjectData: boolean;
}

/** Propriedades do projeto: carimbo, config de framing, divisão em painéis, dados da casa, catálogo (só leitura). */
export function ProjectProperties({ draft, dispatch, outcome, dirty, onOutcome, showProjectData }: ProjectPropertiesProps) {
  const c = draft.config;
  const setProject = (patch: Extract<EditorAction, { type: 'updateProject' }>['patch']): void => dispatch({ type: 'updateProject', patch });
  const setConfig = (patch: Extract<EditorAction, { type: 'updateConfig' }>['patch']): void => dispatch({ type: 'updateConfig', patch });
  const setBuilding = (patch: Extract<EditorAction, { type: 'updateBuilding' }>['patch']): void => dispatch({ type: 'updateBuilding', patch });
  const setPanel = (patch: Partial<Record<keyof DraftPanelConfig, number | undefined>>): void => {
    const panel: DraftPanelConfig = { ...(c.panel ?? {}) };
    for (const [k, v] of Object.entries(patch) as [keyof DraftPanelConfig, number | undefined][]) {
      if (v === undefined) delete panel[k];
      else panel[k] = v;
    }
    setConfig({ panel: Object.keys(panel).length === 0 ? undefined : panel });
  };
  const b = c.building ?? {};

  return (
    <div className="space-y-6">
      <Section title="Project">
        <div className="grid grid-cols-2 gap-3">
          <Field id="p-name" label="Name" className="col-span-2">
            <TextInput id="p-name" value={draft.name} placeholder="Untitled project" onCommit={(v) => setProject({ name: v })} />
          </Field>
          <Field id="p-date" label="Date" hint="Printed on every sheet">
            <TextInput id="p-date" value={draft.date} placeholder="2026-10-19" onCommit={(v) => setProject({ date: v })} />
          </Field>
          <Field id="p-rev" label="Revision">
            <TextInput id="p-rev" value={draft.revision} placeholder="A" onCommit={(v) => setProject({ revision: v })} />
          </Field>
          <Field id="p-north" label="North angle (°)" hint="From plan +y, clockwise">
            <NumberInput id="p-north" value={draft.northAngle} placeholder="0" onCommit={(v) => setProject({ northAngle: v })} />
          </Field>
        </div>
      </Section>

      {outcome !== undefined && showProjectData ? <ProjectDataForm outcome={outcome} onOutcome={onOutcome} highlight={false} confirm={dirty} /> : null}

      <Section title="Framing">
        <div className="grid grid-cols-2 gap-3">
          <Field id="c-spacing" label="Stud spacing">
            <MeasureInput id="c-spacing" value={c.studSpacing} positive required placeholder={`16"`} onCommit={(v) => setConfig({ studSpacing: v })} />
          </Field>
          <Field id="c-hh" label="Header height" hint="Top of RO above subfloor; openings may override">
            <MeasureInput id="c-hh" value={c.headerHeight} positive placeholder="top plate" onCommit={(v) => setConfig({ headerHeight: v })} />
          </Field>
          <Field id="c-precuts" label="Precut studs" hint="Wall height minus three plates, comma-separated" className="col-span-2">
            <MeasureListInput id="c-precuts" value={c.studLength} onCommit={(v) => setConfig({ studLength: v })} />
          </Field>
          <Field id="c-dso" label="Double sill over" hint="Windows wider than this get a double sill">
            <MeasureInput id="c-dso" value={c.doubleSillOver} positive placeholder="off" onCommit={(v) => setConfig({ doubleSillOver: v })} />
          </Field>
          <div />
          <Field id="c-corner" label="Corner">
            <EnumSelect id="c-corner" value={c.corner} noneLabel="California (default)" options={CORNER_OPTIONS} onChange={(v) => setConfig({ corner: v as DraftConfig['corner'] })} />
          </Field>
          <Field id="c-tee" label="Tee">
            <EnumSelect id="c-tee" value={c.tee} noneLabel="Ladder (default)" options={TEE_OPTIONS} onChange={(v) => setConfig({ tee: v as DraftConfig['tee'] })} />
          </Field>
        </div>
      </Section>

      <Section title="Panels and stock">
        <div className="grid grid-cols-2 gap-3">
          <Field id="pn-max" label="Max panel length">
            <MeasureInput id="pn-max" value={c.panel?.maxLength} positive placeholder={`20'-0"`} onCommit={(v) => setPanel({ maxLength: v })} />
          </Field>
          <Field id="pn-weight" label="Max panel weight (lb)">
            <NumberInput id="pn-weight" value={c.panel?.maxWeight} min={1} placeholder="no limit" onCommit={(v) => setPanel({ maxWeight: v })} />
          </Field>
          <Field id="pn-module" label="Break module">
            <MeasureInput id="pn-module" value={c.panel?.module} positive placeholder={`4'-0"`} onCommit={(v) => setPanel({ module: v })} />
          </Field>
          <Field id="pn-lap" label="Top plate lap">
            <MeasureInput id="pn-lap" value={c.panel?.lap} positive placeholder={`4'-0"`} onCommit={(v) => setPanel({ lap: v })} />
          </Field>
          <Field id="pn-minlap" label="Min lap">
            <MeasureInput id="pn-minlap" value={c.panel?.minLap} positive placeholder={`2'-0"`} onCommit={(v) => setPanel({ minLap: v })} />
          </Field>
          <Field id="c-stock" label="Stock lengths" hint="Comma-separated; empty = 8' to 16'">
            <MeasureListInput id="c-stock" value={c.stockLengths} placeholder={`8', 10', 12', 14', 16'`} onCommit={(v) => setConfig({ stockLengths: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Building (structural notes)">
        <div className="grid grid-cols-2 gap-3">
          <Field id="b-snow" label="Ground snow load (psf)">
            <NumberInput id="b-snow" value={b.groundSnowLoad} min={0} placeholder="30" onCommit={(v) => setBuilding({ groundSnowLoad: v })} />
          </Field>
          <Field id="b-width" label="Building width">
            <MeasureInput id="b-width" value={b.buildingWidth} positive placeholder={`28'`} onCommit={(v) => setBuilding({ buildingWidth: v })} />
          </Field>
          <Field id="b-wind" label="Wind speed (mph)">
            <NumberInput id="b-wind" value={b.windSpeed} min={1} placeholder="130" onCommit={(v) => setBuilding({ windSpeed: v })} />
          </Field>
          <Field id="b-exp" label="Exposure">
            <EnumSelect id="b-exp" value={b.exposure} noneLabel="B (default)" options={EXPOSURE_OPTIONS} onChange={(v) => setBuilding({ exposure: v as DraftConfig['building'] extends infer B ? (B extends { exposure?: infer E } ? E : never) : never })} />
          </Field>
          <Field id="b-species" label="Species">
            <EnumSelect id="b-species" value={b.species} noneLabel="SPF (tables)" options={SPECIES_OPTIONS} onChange={(v) => setBuilding({ species: v as NonNullable<DraftConfig['building']>['species'] })} />
          </Field>
        </div>
        <p className="text-[12px] text-ink-3">Snow load and width together enable the IRC header table; wind speed enables the king stud table.</p>
      </Section>

      <Section title={`Opening schedule (${Object.keys(c.openingTypes ?? {}).length})`}>
        {c.openingTypes === undefined || Object.keys(c.openingTypes).length === 0 ? (
          <p className="text-[13px] text-ink-3">No schedule: openings carry their own rough opening.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>RO</TableHead>
                  <TableHead>Sill</TableHead>
                  <TableHead>Frame</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(c.openingTypes).map(([tag, t]) => (
                  <TableRow key={tag}>
                    <TableCell className="font-mono font-semibold" title={t.description}>
                      {tag}
                    </TableCell>
                    <TableCell>{t.kind ?? '?'}</TableCell>
                    <TableCell className="font-mono text-[13px]">
                      {formatMeasure(t.width)} × {formatMeasure(t.height)}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">{t.roughWidth !== undefined || t.roughHeight !== undefined ? `${formatMeasure(t.roughWidth)} × ${formatMeasure(t.roughHeight)}` : 'default clearance'}</TableCell>
                    <TableCell className="font-mono text-[13px]">{t.sillHeight === undefined ? '—' : formatMeasure(t.sillHeight)}</TableCell>
                    <TableCell>{t.frame ?? (t.kind === 'door' ? 'wood' : '—')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-[12px] text-ink-3">Read-only for now; edit the project file to change the schedule.</p>
      </Section>

      <Section title={`Header schedule (${Object.keys(c.headerSchedule ?? {}).length})`}>
        {c.headerSchedule === undefined || Object.keys(c.headerSchedule).length === 0 ? (
          <p className="text-[13px] text-ink-3">No header schedule: headers come from the opening or the IRC table.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mark</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">Plies</TableHead>
                  <TableHead className="text-right">Jacks</TableHead>
                  <TableHead className="text-right">Kings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(c.headerSchedule).map(([mark, h]) => (
                  <TableRow key={mark}>
                    <TableCell className="font-mono font-semibold" title={h.description}>
                      {mark}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">{typeof h.section === 'string' ? h.section : h.section === undefined ? '?' : `${h.section.material} ${h.section.width}x${h.section.depth}`}</TableCell>
                    <TableCell className="text-right font-mono">{h.plies ?? '?'}</TableCell>
                    <TableCell className="text-right font-mono">{h.jackStuds ?? '?'}</TableCell>
                    <TableCell className="text-right font-mono">{h.kingStuds ?? '?'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

const CORNER_OPTIONS = [
  { value: 'california', label: 'California (flat stud)' },
  { value: 'three-stud', label: 'Three studs' },
] as const;
const TEE_OPTIONS = [
  { value: 'ladder', label: 'Ladder blocking' },
  { value: 'backer', label: 'Backer studs' },
] as const;
const EXPOSURE_OPTIONS = [
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D (outside the king table)' },
] as const;
const SPECIES_OPTIONS = [
  { value: 'SPF', label: 'SPF' },
  { value: 'Hem-Fir', label: 'Hem-Fir' },
  { value: 'DF', label: 'Douglas Fir' },
  { value: 'SP', label: 'Southern Pine' },
] as const;
