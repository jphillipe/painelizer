'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { Dispatch } from 'react';
import { headerSection, readField } from 'cli/schema';
import { Button } from '@/components/ui/button';
import type { PriceEntry } from 'core';
import type { DraftHeaderEntry, DraftOpeningType, DraftWallType, HeaderSectionDraft, ProjectDraft } from '@/lib/editor/draft';
import { duplicatePrices, newPrice, patchPrice, priceMode, priceValue, readPriceSection, withPrice } from '@/lib/editor/prices';
import { wallSheathingChoice } from '@/lib/editor/sheathing';
import type { EditorAction, Patch } from '@/lib/editor/state';
import { wallTypeUsage } from '@/lib/editor/wall-types';
import { BoolSelect, EnumSelect, Field, MeasureInput, NumberInput, Section, TextInput } from './fields';

/**
 * Catálogo editável (S29): tipos de abertura (`config.openingTypes`, por tag) e marcas de header
 * (`config.headerSchedule`). Renomear a tag/marca troca a referência em todas as aberturas que a usam (no
 * reducer); apagar só quando nenhuma abertura usa. O motor confere o resto (tamanho, seção, plies).
 *
 * S35: tipos de parede (`config.wallTypes`, por tag) — o que cada tipo dá à parede que não disser (seção, posição,
 * carga). Renomear a tag troca `wallType` das paredes; apagar só quando nenhuma parede usa (a parede que dependia do
 * tipo ficaria sem seção).
 *
 * S40: sheathing do tipo (liga/desliga; um spec do arquivo aparece como "Custom" e fica) e a tabela de preços
 * (`config.prices`) do orçamento.
 */
export function CatalogEditor({ draft, dispatch }: { draft: ProjectDraft; dispatch: Dispatch<EditorAction> }) {
  return (
    <>
      <WallTypes draft={draft} dispatch={dispatch} />
      <OpeningTypes draft={draft} dispatch={dispatch} />
      <HeaderSchedule draft={draft} dispatch={dispatch} />
      <Prices draft={draft} dispatch={dispatch} />
    </>
  );
}

/** Quantas aberturas usam a tag (`by: 'tag'`) ou a marca de header (`by: 'headerMark'`). */
export function usageCount(draft: ProjectDraft, by: 'tag' | 'headerMark', key: string): number {
  return draft.walls.reduce((n, w) => n + w.openings.filter((o) => o[by] === key).length, 0);
}

/** Primeira chave livre `prefix1`, `prefix2`… */
export function freeKey(catalog: Readonly<Record<string, unknown>> | undefined, prefix: string): string {
  for (let i = 1; ; i++) if (catalog?.[`${prefix}${i}`] === undefined) return `${prefix}${i}`;
}

function WallTypes({ draft, dispatch }: { draft: ProjectDraft; dispatch: Dispatch<EditorAction> }) {
  const types = draft.config.wallTypes ?? {};
  const entries = Object.entries(types);
  const put = (tag: string, t: DraftWallType, patch: Patch<DraftWallType>): void =>
    dispatch({ type: 'setWallType', tag, value: clean<DraftWallType>({ ...t, ...patch }) });
  return (
    <Section
      title={`Wall types (${entries.length})`}
      actions={
        <Button
          variant="outline"
          size="xs"
          onClick={() => dispatch({ type: 'setWallType', tag: freeKey(types, 'WT-'), value: { section: '2x4', exterior: false, bearing: false } })}
        >
          <PlusIcon /> Add wall type
        </Button>
      }
    >
      {entries.length === 0 ? (
        <p className="text-[13px] text-ink-3">No wall types: each wall carries its own section, position and load.</p>
      ) : (
        <p className="text-[12px] text-ink-3">A wall with a type takes from it whatever the wall itself leaves unset; what the wall sets wins, with a warning when it differs.</p>
      )}
      <ul className="space-y-3">
        {entries.map(([tag, t]) => {
          const used = wallTypeUsage(draft, tag);
          const p = `wt-${tag}`;
          return (
            <li key={tag} className="space-y-3 rounded-md border bg-card p-3" data-wall-type={tag}>
              <div className="flex items-end gap-2">
                <Field id={`${p}-tag`} label="Tag" className="flex-1">
                  <TextInput
                    id={`${p}-tag`}
                    value={tag}
                    required
                    mono
                    validate={(v) => (v === tag || types[v] === undefined ? undefined : 'Another wall type has this tag')}
                    onCommit={(v) => v !== undefined && dispatch({ type: 'renameWallType', tag, newTag: v })}
                  />
                </Field>
                <span className="pb-2 text-[12px] whitespace-nowrap text-ink-3">
                  {used === 0 ? 'not used' : `${used} wall${used === 1 ? '' : 's'}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mb-1.5"
                  aria-label={`Remove wall type ${tag}`}
                  disabled={used > 0}
                  title={used > 0 ? 'Used by walls: change them first' : undefined}
                  onClick={() => dispatch({ type: 'setWallType', tag, value: undefined })}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field id={`${p}-section`} label="Section">
                  <EnumSelect
                    id={`${p}-section`}
                    value={t.section}
                    noneLabel="Not set"
                    options={WALL_SECTION_OPTIONS}
                    onChange={(v) => put(tag, t, { section: v as DraftWallType['section'] })}
                  />
                </Field>
                <Field id={`${p}-ext`} label="Position">
                  <BoolSelect id={`${p}-ext`} value={t.exterior} trueLabel="Exterior" falseLabel="Interior" onChange={(v) => put(tag, t, { exterior: v })} />
                </Field>
                <Field id={`${p}-bearing`} label="Load">
                  <BoolSelect id={`${p}-bearing`} value={t.bearing} trueLabel="Bearing" falseLabel="Non-bearing" onChange={(v) => put(tag, t, { bearing: v })} />
                </Field>
                <Field id={`${p}-sheathing`} label="Sheathing">
                  <EnumSelect
                    id={`${p}-sheathing`}
                    value={wallSheathingChoice(t.sheathing)}
                    noneLabel="From project"
                    options={[
                      { value: 'on', label: 'Sheathed' },
                      { value: 'off', label: 'No sheathing' },
                      ...(wallSheathingChoice(t.sheathing) === 'custom' ? [{ value: 'custom', label: 'Custom (from the project file)' }] : []),
                    ]}
                    onChange={(v) => v !== 'custom' && put(tag, t, { sheathing: v === undefined ? undefined : v === 'on' })}
                  />
                </Field>
                <Field id={`${p}-desc`} label="Description" className="col-span-2 sm:col-span-3">
                  <TextInput id={`${p}-desc`} value={t.description} onCommit={(v) => put(tag, t, { description: v })} />
                </Field>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function OpeningTypes({ draft, dispatch }: { draft: ProjectDraft; dispatch: Dispatch<EditorAction> }) {
  const types = draft.config.openingTypes ?? {};
  const entries = Object.entries(types);
  const put = (tag: string, t: DraftOpeningType, patch: Patch<DraftOpeningType>): void =>
    dispatch({ type: 'setOpeningType', tag, value: clean<DraftOpeningType>({ ...t, ...patch }) });
  return (
    <Section
      title={`Opening schedule (${entries.length})`}
      actions={
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            dispatch({
              type: 'setOpeningType',
              tag: freeKey(types, 'T'),
              value: { kind: 'window', width: 36, height: 48 },
            })
          }
        >
          <PlusIcon /> Add type
        </Button>
      }
    >
      {entries.length === 0 ? (
        <p className="text-[13px] text-ink-3">No schedule: openings carry their own rough opening.</p>
      ) : null}
      <ul className="space-y-3">
        {entries.map(([tag, t]) => {
          const used = usageCount(draft, 'tag', tag);
          const p = `ot-${tag}`;
          return (
            <li key={tag} className="space-y-3 rounded-md border bg-card p-3" data-opening-type={tag}>
              <div className="flex items-end gap-2">
                <Field id={`${p}-tag`} label="Tag" className="flex-1">
                  <TextInput
                    id={`${p}-tag`}
                    value={tag}
                    required
                    mono
                    validate={(v) => (v === tag || types[v] === undefined ? undefined : 'Another type has this tag')}
                    onCommit={(v) => v !== undefined && dispatch({ type: 'renameOpeningType', tag, newTag: v })}
                  />
                </Field>
                <span className="pb-2 text-[12px] whitespace-nowrap text-ink-3">
                  {used === 0 ? 'not used' : `${used} opening${used === 1 ? '' : 's'}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mb-1.5"
                  aria-label={`Remove type ${tag}`}
                  disabled={used > 0}
                  title={used > 0 ? 'Used by openings: change them first' : undefined}
                  onClick={() => dispatch({ type: 'setOpeningType', tag, value: undefined })}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field id={`${p}-kind`} label="Kind">
                  <EnumSelect
                    id={`${p}-kind`}
                    value={t.kind}
                    noneLabel="Not set"
                    options={KIND_OPTIONS}
                    onChange={(v) => put(tag, t, { kind: v as DraftOpeningType['kind'] })}
                  />
                </Field>
                <Field id={`${p}-w`} label="Width">
                  <MeasureInput id={`${p}-w`} value={t.width} positive onCommit={(v) => put(tag, t, { width: v })} />
                </Field>
                <Field id={`${p}-h`} label="Height">
                  <MeasureInput id={`${p}-h`} value={t.height} positive onCommit={(v) => put(tag, t, { height: v })} />
                </Field>
                <Field id={`${p}-sill`} label="Sill">
                  <MeasureInput
                    id={`${p}-sill`}
                    value={t.sillHeight}
                    placeholder="default"
                    onCommit={(v) => put(tag, t, { sillHeight: v })}
                  />
                </Field>
                <Field id={`${p}-rw`} label="RO width">
                  <MeasureInput
                    id={`${p}-rw`}
                    value={t.roughWidth}
                    positive
                    placeholder="clearance"
                    onCommit={(v) => put(tag, t, { roughWidth: v })}
                  />
                </Field>
                <Field id={`${p}-rh`} label="RO height">
                  <MeasureInput
                    id={`${p}-rh`}
                    value={t.roughHeight}
                    positive
                    placeholder="clearance"
                    onCommit={(v) => put(tag, t, { roughHeight: v })}
                  />
                </Field>
                <Field id={`${p}-frame`} label="Door frame">
                  <EnumSelect
                    id={`${p}-frame`}
                    value={t.frame}
                    noneLabel={t.kind === 'door' ? 'Wood (default)' : '—'}
                    options={FRAME_OPTIONS}
                    onChange={(v) => put(tag, t, { frame: v as DraftOpeningType['frame'] })}
                  />
                </Field>
                <Field id={`${p}-desc`} label="Description">
                  <TextInput id={`${p}-desc`} value={t.description} onCommit={(v) => put(tag, t, { description: v })} />
                </Field>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function HeaderSchedule({ draft, dispatch }: { draft: ProjectDraft; dispatch: Dispatch<EditorAction> }) {
  const schedule = draft.config.headerSchedule ?? {};
  const entries = Object.entries(schedule);
  const put = (mark: string, h: DraftHeaderEntry, patch: Patch<DraftHeaderEntry>): void =>
    dispatch({ type: 'setHeaderEntry', mark, value: clean<DraftHeaderEntry>({ ...h, ...patch }) });
  return (
    <Section
      title={`Header schedule (${entries.length})`}
      actions={
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            dispatch({ type: 'setHeaderEntry', mark: freeKey(schedule, 'H'), value: { section: '2x10', plies: 2 } })
          }
        >
          <PlusIcon /> Add mark
        </Button>
      }
    >
      {entries.length === 0 ? (
        <p className="text-[13px] text-ink-3">No header schedule: headers come from the opening or the IRC table.</p>
      ) : null}
      <ul className="space-y-3">
        {entries.map(([mark, h]) => {
          const used = usageCount(draft, 'headerMark', mark);
          const p = `hs-${mark}`;
          return (
            <li key={mark} className="space-y-3 rounded-md border bg-card p-3" data-header-mark={mark}>
              <div className="flex items-end gap-2">
                <Field id={`${p}-mark`} label="Mark" className="flex-1">
                  <TextInput
                    id={`${p}-mark`}
                    value={mark}
                    required
                    mono
                    validate={(v) =>
                      v === mark || schedule[v] === undefined ? undefined : 'Another header has this mark'
                    }
                    onCommit={(v) => v !== undefined && dispatch({ type: 'renameHeaderEntry', mark, newMark: v })}
                  />
                </Field>
                <span className="pb-2 text-[12px] whitespace-nowrap text-ink-3">
                  {used === 0 ? 'not used' : `${used} opening${used === 1 ? '' : 's'}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mb-1.5"
                  aria-label={`Remove header ${mark}`}
                  disabled={used > 0}
                  title={used > 0 ? 'Used by openings: change them first' : undefined}
                  onClick={() => dispatch({ type: 'setHeaderEntry', mark, value: undefined })}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field id={`${p}-section`} label="Section" className="col-span-2">
                  <TextInput
                    id={`${p}-section`}
                    value={sectionText(h.section)}
                    mono
                    placeholder={`2x10 or LVL 1.75x9.25`}
                    validate={sectionError}
                    onCommit={(v) => put(mark, h, { section: v })}
                  />
                </Field>
                <Field id={`${p}-plies`} label="Plies">
                  <NumberInput
                    id={`${p}-plies`}
                    value={h.plies}
                    integer
                    min={1}
                    onCommit={(v) => put(mark, h, { plies: v })}
                  />
                </Field>
                <Field id={`${p}-jacks`} label="Jacks">
                  <NumberInput
                    id={`${p}-jacks`}
                    value={h.jackStuds}
                    integer
                    min={1}
                    placeholder="table"
                    onCommit={(v) => put(mark, h, { jackStuds: v })}
                  />
                </Field>
                <Field id={`${p}-kings`} label="Kings">
                  <NumberInput
                    id={`${p}-kings`}
                    value={h.kingStuds}
                    integer
                    min={1}
                    placeholder="table"
                    onCommit={(v) => put(mark, h, { kingStuds: v })}
                  />
                </Field>
                <Field id={`${p}-desc`} label="Description" className="col-span-3">
                  <TextInput
                    id={`${p}-desc`}
                    value={h.description}
                    onCommit={(v) => put(mark, h, { description: v })}
                  />
                </Field>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/**
 * Tabela de preços (S40): por peça de um comprimento de estoque ou por pé linear da seção (o que o LVL/PSL usa). Moeda
 * do projeto; a aba Materials e o `cost.csv` multiplicam pela lista de material. Lista vazia = sem orçamento.
 */
function Prices({ draft, dispatch }: { draft: ProjectDraft; dispatch: Dispatch<EditorAction> }) {
  const list = draft.config.prices ?? [];
  const dups = duplicatePrices(list);
  const set = (i: number, value: PriceEntry | undefined): void => dispatch({ type: 'updateConfig', patch: { prices: withPrice(list, i, value) } });
  return (
    <Section
      title={`Prices (${list.length})`}
      actions={
        <Button variant="outline" size="xs" onClick={() => set(list.length, newPrice(list))}>
          <PlusIcon /> Add price
        </Button>
      }
    >
      {list.length === 0 ? (
        <p className="text-[13px] text-ink-3">No prices: Materials shows quantities only. Add a price per stock piece or per linear foot to get a cost.</p>
      ) : (
        <p className="text-[12px] text-ink-3">A stock piece uses the price for its exact length; otherwise the per-foot price of its size. Lines without a price stay out of the total. Sheathing is not priced yet.</p>
      )}
      <ul className="space-y-3">
        {list.map((pr, i) => {
          const p = `pr-${i}`;
          const mode = priceMode(pr);
          return (
            <li key={i} className="space-y-2 rounded-md border bg-card p-3" data-price={i}>
              <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                <Field id={`${p}-section`} label="Size">
                  <TextInput
                    id={`${p}-section`}
                    value={pr.section}
                    required
                    mono
                    placeholder="2x6"
                    validate={(v) => (readPriceSection(v) === undefined ? 'Use 2x4…2x12, 4x4, 4x6, 6x6, or LVL / PSL <width>x<depth>' : undefined)}
                    onCommit={(v) => {
                      const section = v === undefined ? undefined : readPriceSection(v);
                      if (section !== undefined) set(i, patchPrice(pr, { section }));
                    }}
                  />
                </Field>
                <Field id={`${p}-mode`} label="Priced">
                  <EnumSelect id={`${p}-mode`} value={mode} options={PRICE_MODE_OPTIONS} onChange={(v) => v !== undefined && set(i, patchPrice(pr, { mode: v as 'each' | 'perFoot' }))} />
                </Field>
                <Field id={`${p}-length`} label="Stock length">
                  {mode === 'each' && 'length' in pr ? (
                    <MeasureInput id={`${p}-length`} value={pr.length} positive required onCommit={(v) => v !== undefined && set(i, patchPrice(pr, { length: v }))} />
                  ) : (
                    <span className="block py-1.5 text-[13px] text-ink-3">any</span>
                  )}
                </Field>
                <Field id={`${p}-value`} label={mode === 'each' ? 'Price per piece' : 'Price per foot'}>
                  <NumberInput id={`${p}-value`} value={priceValue(pr)} min={0} required onCommit={(v) => v !== undefined && set(i, patchPrice(pr, { value: v }))} />
                </Field>
                <Button variant="ghost" size="icon-xs" className="mt-7" aria-label={`Remove price ${i + 1}`} onClick={() => set(i, undefined)}>
                  <Trash2Icon />
                </Button>
              </div>
              {dups.has(i) ? <p className="text-[12px] text-destructive">Same size and length as an earlier line — the project will not build until one goes.</p> : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Seção de header como texto (`"LVL 1.75x9.25"`); o objeto do arquivo vira o mesmo texto ao editar. */
export function sectionText(s: HeaderSectionDraft | undefined): string | undefined {
  return s === undefined || typeof s === 'string' ? s : `${s.material} ${s.width}x${s.depth}`;
}

/** Mesma regra do schema do arquivo (S28.2): serrada da lista ou `LVL`/`PSL <esp>x<prof>`. */
export function sectionError(v: string): string | undefined {
  return readField(headerSection, v).ok ? undefined : 'Use 2x4…2x12, or LVL / PSL <width>x<depth>';
}

/** Tira as chaves `undefined` (patch que limpou o campo). */
function clean<T extends object>(o: Patch<T>): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const PRICE_MODE_OPTIONS = [
  { value: 'each', label: 'Per piece' },
  { value: 'perFoot', label: 'Per foot' },
] as const;
const WALL_SECTION_OPTIONS = [
  { value: '2x4', label: '2x4' },
  { value: '2x6', label: '2x6' },
] as const;
const KIND_OPTIONS = [
  { value: 'window', label: 'Window' },
  { value: 'door', label: 'Door' },
] as const;
const FRAME_OPTIONS = [
  { value: 'wood', label: 'Wood' },
  { value: 'hm', label: 'Hollow metal' },
  { value: 'al', label: 'Aluminum' },
] as const;
