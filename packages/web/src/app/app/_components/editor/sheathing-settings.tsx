'use client';

import type { DraftConfig } from '@/lib/editor/draft';
import { SHEATHING_SIDE_OPTIONS, SHEATHING_WALLS_OPTIONS, patchSheathing, type SheathingPatch } from '@/lib/editor/sheathing';
import { EnumSelect, Field, MeasureInput, Section, TextInput } from './fields';

/**
 * Seção "Sheathing" das configurações do projeto (S38): liga a chapa do projeto (e em quais paredes), chapa, face,
 * avanços e pregação. Desligado = sem `config.sheathing` (o projeto gera como antes); campos vazios = defaults do
 * motor (7/16", 48" x 96", face exterior, canto automático, 8d @ 6"/12").
 */
export function SheathingSettings({ config, onChange }: { config: DraftConfig; onChange: (sheathing: DraftConfig['sheathing']) => void }) {
  const s = config.sheathing;
  const set = (patch: SheathingPatch): void => onChange(patchSheathing(s, patch));
  const walls = s === undefined ? undefined : (s.walls ?? 'exterior');
  return (
    <Section title="Sheathing" collapsible defaultOpen={s !== undefined}>
      <div className="grid grid-cols-2 gap-3">
        <Field id="sh-walls" label="Project sheathing" hint="Walls and wall types can turn it on or off one by one" className="col-span-2">
          <EnumSelect
            id="sh-walls"
            value={walls}
            noneLabel="Off (default)"
            options={SHEATHING_WALLS_OPTIONS}
            onChange={(v) => (v === undefined ? onChange(undefined) : set({ walls: v === 'exterior' ? undefined : (v as SheathingPatch['walls']) }))}
          />
        </Field>
        {s !== undefined ? (
          <>
            <Field id="sh-thk" label="Thickness">
              <MeasureInput id="sh-thk" value={s.thickness} positive placeholder={`7/16"`} onCommit={(v) => set({ thickness: v })} />
            </Field>
            <Field id="sh-side" label="Faces">
              <EnumSelect id="sh-side" value={s.side} noneLabel="Exterior face (default)" options={SHEATHING_SIDE_OPTIONS} onChange={(v) => set({ side: v as SheathingPatch['side'] })} />
            </Field>
            <Field id="sh-w" label="Sheet width">
              <MeasureInput id="sh-w" value={s.sheet?.width} positive placeholder={`4'-0"`} onCommit={(v) => set({ sheetWidth: v })} />
            </Field>
            <Field id="sh-h" label="Sheet height" hint={`8'-0" or 9'-0"; a taller wall gets a blocking row at the joint`}>
              <MeasureInput id="sh-h" value={s.sheet?.height} positive placeholder={`8'-0"`} onCommit={(v) => set({ sheetHeight: v })} />
            </Field>
            <Field id="sh-corner" label="Corner overhang" hint="The butting wall covers the end of the through wall; empty = its thickness">
              <MeasureInput id="sh-corner" value={typeof s.overhang?.corner === 'number' ? s.overhang.corner : undefined} placeholder="auto" onCommit={(v) => set({ corner: v })} />
            </Field>
            <Field id="sh-ftop" label="Above the double top" hint="Floor line (exterior face); engineer to verify">
              <MeasureInput id="sh-ftop" value={s.overhang?.floorTop} placeholder={`0"`} onCommit={(v) => set({ floorTop: v })} />
            </Field>
            <Field id="sh-fbot" label="Below the bottom plate" hint="Over the rim (exterior face); engineer to verify">
              <MeasureInput id="sh-fbot" value={s.overhang?.floorBottom} placeholder={`0"`} onCommit={(v) => set({ floorBottom: v })} />
            </Field>
            <Field id="sh-nail" label="Nail">
              <TextInput id="sh-nail" value={s.nailing?.nail} placeholder="8d" onCommit={(v) => set({ nail: v })} />
            </Field>
            <Field id="sh-edge" label="Nailing at edges">
              <MeasureInput id="sh-edge" value={s.nailing?.edge} positive placeholder={`6"`} onCommit={(v) => set({ edge: v })} />
            </Field>
            <Field id="sh-field" label="Nailing in the field">
              <MeasureInput id="sh-field" value={s.nailing?.field} positive placeholder={`12"`} onCommit={(v) => set({ field: v })} />
            </Field>
          </>
        ) : null}
      </div>
      <p className="text-[12px] text-ink-3">
        Sheets stand from layout mark 0 and end at each panel. Overhangs and nailing are printed on the sheet for the engineer to verify.
      </p>
    </Section>
  );
}
