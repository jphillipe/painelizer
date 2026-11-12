'use client';

import { CheckIcon, CopyIcon, PlusIcon, RotateCcwIcon, ScissorsIcon, Trash2Icon } from 'lucide-react';
import { useState, type Dispatch } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { movedBreak, suggestBreak, withBreak, withoutBreak, type ShownBreaks } from '@/lib/editor/breaks';
import { blockingEntryText, blockingFromType, blockingPresetOptions, withoutBlockingEntry } from '@/lib/editor/blocking';
import { isIdFree, isPlanWall, wallLength, type DraftBlockingRow, type DraftWall, type ProjectDraft } from '@/lib/editor/draft';
import { LABELS } from '@/lib/editor/labels';
import { formatMeasure } from '@/lib/editor/measure';
import type { Issue } from '@/lib/editor/problems';
import { confidenceTone, type WallProvenance } from '@/lib/editor/provenance';
import { resolveDraftOpening } from '@/lib/editor/resolve';
import { isReviewed, type EditorAction, type Patch, type Selection } from '@/lib/editor/state';
import { cn } from '@/lib/utils';
import { splitWall, suggestSplit } from '@/lib/editor/wall-ops';
import { missingWallFields, typeOfWall, wallTypeHint, wallTypeOptions } from '@/lib/editor/wall-types';
import { POST_SECTION_OPTIONS, postHint } from '@/lib/editor/posts';
import { sheathingStatus, wallSheathingChoice } from '@/lib/editor/sheathing';
import { BoolSelect, EnumSelect, Field, MeasureInput, NumberInput, Section, TextInput, WallTypeInput } from './fields';
import { IssueCallout } from './issue-callout';

export interface WallPropertiesProps {
  draft: ProjectDraft;
  wall: DraftWall;
  /** Quebras de painel (S29): as mostradas na planta e os candidatos da checagem. */
  breaks?: ShownBreaks | undefined;
  provenance: WallProvenance | undefined;
  issues: readonly Issue[];
  dispatch: Dispatch<EditorAction>;
  onSelect: (s: Selection) => void;
}

/** Painel de propriedades da parede: identidade, geometria (planta ou solta), framing, aberturas, proveniência. */
export function WallProperties({ draft, wall, breaks, provenance, issues, dispatch, onSelect }: WallPropertiesProps) {
  const id = wall.id;
  const set = (patch: Extract<EditorAction, { type: 'updateWall' }>['patch']): void => dispatch({ type: 'updateWall', wallId: id, patch });
  const plan = isPlanWall(wall);
  const setEnds = (end: 'start' | 'end', v: string | undefined): void => {
    const ends = { ...(wall.ends ?? {}) };
    if (v === undefined) delete ends[end];
    else ends[end] = v as 'through' | 'butt';
    set({ ends: Object.keys(ends).length === 0 ? undefined : ends });
  };
  const length = wallLength(wall);
  const framingIssue = issues.some((i) => /section|exterior|bearing|floors|building|king|header|wind/i.test(i.kind ?? i.code ?? i.text));
  const reviewed = isReviewed(wall);
  // S35: o que o tipo de parede dá aparece no lugar de "Not set" (a parede só grava o que ela mesma diz).
  const type = typeOfWall(draft.config, wall);
  const fromType = (v: string | undefined): string => (v === undefined ? 'Not set' : `From type (${v})`);

  return (
    <div className="space-y-6">
      <IssueCallout issues={issues} onReview={(keys, reviewed) => dispatch({ type: 'setIssuesReviewed', keys, reviewed })} />
      <Section
        title="Wall"
        collapsible
        actions={
          <span className="flex items-center gap-2">
            {/* Marca de revisão humana (M5): fica no arquivo (`$reviewed`), conta na top bar e filtra a lista. */}
            <button
              type="button"
              role="checkbox"
              aria-checked={reviewed}
              aria-label={`Mark ${id} as reviewed`}
              onClick={() => dispatch({ type: 'setReviewed', wallId: id, reviewed: !reviewed })}
              className={cn('flex cursor-pointer items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[12px] font-semibold transition-colors duration-200', reviewed ? 'border-ok/30 bg-ok/10 text-ok-700' : 'border-line text-ink-2 hover:border-line-strong')}
            >
              <span className={cn('flex size-3.5 items-center justify-center rounded-[3px] border', reviewed ? 'border-ok-700 bg-ok-700 text-paper' : 'border-line-strong bg-card')} aria-hidden>
                {reviewed ? <CheckIcon className="size-3" /> : null}
              </span>
              Reviewed
            </button>
            <Button variant="ghost" size="icon-xs" aria-label={`Duplicate ${id}`} title="Duplicate (Ctrl+D)" onClick={() => dispatch({ type: 'duplicateWalls', wallIds: [id] })}>
              <CopyIcon />
            </Button>
            <Button variant="ghost" size="xs" className="text-destructive" onClick={() => dispatch({ type: 'removeWall', wallId: id })}>
              <Trash2Icon /> Remove wall
            </Button>
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field id={`w-${id}-id`} label="Id">
            <TextInput id={`w-${id}-id`} value={id} required mono validate={(v) => (v === id || isIdFree(draft, v, 'wall') ? undefined : 'Another wall has this id')} onCommit={(v) => v !== undefined && dispatch({ type: 'renameWall', wallId: id, newId: v })} />
          </Field>
          <Field id={`w-${id}-type`} label="Wall type" hint={wallTypeHint(draft.config, wall.wallType)}>
            <WallTypeInput id={`w-${id}-type`} value={wall.wallType} options={wallTypeOptions(draft.config)} onCommit={(v) => set({ wallType: v })} />
          </Field>
          <Field id={`w-${id}-level`} label="Level">
            <NumberInput id={`w-${id}-level`} value={wall.level} integer min={1} placeholder="1" onCommit={(v) => set({ level: v })} />
          </Field>
          <Field id={`w-${id}-height`} label="Height" hint={LABELS.wallHeightHint}>
            <MeasureInput id={`w-${id}-height`} value={wall.height} positive onCommit={(v) => set({ height: v })} />
          </Field>
        </div>
      </Section>

      <Section title={plan ? 'Geometry (axis, from the project origin)' : 'Geometry (by length)'} collapsible>
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
            <Field id={`w-${id}-lo`} label="Layout origin" hint="Where the building’s layout mark 0 falls along this wall; negative when the panel starts mid-wall">
              <MeasureInput id={`w-${id}-lo`} value={wall.layoutOrigin} signed placeholder="0" onCommit={(v) => set({ layoutOrigin: v })} />
            </Field>
          </div>
        )}
        <SplitControl draft={draft} wallId={id} dispatch={dispatch} />
      </Section>

      <Section title="Framing" collapsible defaultOpen={framingIssue || missingWallFields(draft.config, wall).length > 0}>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`w-${id}-section`} label="Section">
            <EnumSelect id={`w-${id}-section`} value={wall.section} noneLabel={fromType(type?.section)} options={SECTION_OPTIONS} onChange={(v) => set({ section: v as DraftWall['section'] })} />
          </Field>
          <Field id={`w-${id}-ext`} label="Position">
            <BoolSelect id={`w-${id}-ext`} value={wall.exterior} trueLabel="Exterior" falseLabel="Interior" noneLabel={fromType(type?.exterior === undefined ? undefined : type.exterior ? 'exterior' : 'interior')} onChange={(v) => set({ exterior: v })} />
          </Field>
          <Field id={`w-${id}-bearing`} label="Load">
            <BoolSelect id={`w-${id}-bearing`} value={wall.bearing} trueLabel="Bearing" falseLabel="Non-bearing" noneLabel={fromType(type?.bearing === undefined ? undefined : type.bearing ? 'bearing' : 'non-bearing')} onChange={(v) => set({ bearing: v })} />
          </Field>
          <Field id={`w-${id}-floors`} label={LABELS.floors} hint="Bearing walls: picks the row of the IRC header table">
            <NumberInput id={`w-${id}-floors`} value={wall.floorsSupported} integer min={0} placeholder="0" onCommit={(v) => set({ floorsSupported: v })} />
          </Field>
          <Field id={`w-${id}-span`} label={LABELS.floorSpan}>
            <EnumSelect id={`w-${id}-span`} value={wall.floorSpan} noneLabel={LABELS.floorSpanUnknown} options={SPAN_OPTIONS} onChange={(v) => set({ floorSpan: v as DraftWall['floorSpan'] })} />
          </Field>
          <Field id={`w-${id}-bw`} label={LABELS.width} hint="Only this wall (L-shaped house); empty = the project’s">
            <MeasureInput id={`w-${id}-bw`} value={wall.buildingWidth} positive placeholder="project" onCommit={(v) => set({ buildingWidth: v })} />
          </Field>
          <SheathingField id={id} draft={draft} wall={wall} onChange={(sheathing) => set({ sheathing })} />
        </div>
      </Section>

      <PanelBreaksSection id={id} length={length} breaks={breaks} issue={issues.some((i) => i.code === 'PANEL_BREAK_INVALID' || i.code === 'PANEL_TOO_LONG')} onChange={(list) => dispatch({ type: 'setPanelBreaks', wallId: id, breaks: list })} />

      <ExtraStudsSection id={id} length={length} studs={wall.extraStuds} onChange={(extraStuds) => set({ extraStuds })} />

      <PostsSection id={id} draft={draft} wall={wall} length={length} issue={issues.some((i) => (i.code ?? '').startsWith('POST_'))} onChange={(posts) => set({ posts })} />

      <BlockingSection id={id} draft={draft} wall={wall} issue={issues.some((i) => (i.code ?? '').startsWith('BLOCKING_'))} onChange={(blocking) => set({ blocking })} />

      <Section
        title={`Openings (${wall.openings.length})`}
        collapsible
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
        <Section title="From the AI reading" collapsible defaultOpen={confidenceTone(provenance.confidence) !== 'success'}>
          <div className="space-y-1 text-[13px]">
            <p>
              Confidence <Badge variant={TONE_VARIANT[confidenceTone(provenance.confidence)]} className="font-mono">{provenance.confidence.toFixed(2)}</Badge>
              {provenance.wallType !== null ? <span className="ml-2 text-ink-3">type {provenance.wallType}</span> : null}
            </p>
            {/* S26: a evidência é texto da IA, no idioma do prompt — sempre recolhida. */}
            <details className="text-ink-2">
              <summary className="cursor-pointer text-ink-3 select-none">Evidence (details)</summary>
              <p className="mt-1">{provenance.evidence}</p>
            </details>
          </div>
        </Section>
      ) : null}

    </div>
  );
}

/**
 * Dividir a parede (S30): um ponto do `start` (sugerido no meio, fora das aberturas) e o botão; o que impede o
 * corte (abertura ou studs extras no ponto) aparece abaixo. Os dois pedaços ficam selecionados (juntar desfaz).
 */
function SplitControl({ draft, wallId, dispatch }: { draft: ProjectDraft; wallId: string; dispatch: Dispatch<EditorAction> }) {
  const [at, setAt] = useState<number | undefined>(() => suggestSplit(draft, wallId));
  if (at === undefined && suggestSplit(draft, wallId) === undefined) return null;
  const check = at === undefined ? undefined : splitWall(draft, wallId, at);
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-end gap-2">
        <Field id={`w-${wallId}-split`} label="Split at (from start)" className="flex-1">
          <MeasureInput id={`w-${wallId}-split`} value={at} positive onCommit={setAt} />
        </Field>
        <Button variant="outline" size="sm" disabled={check?.ok !== true} onClick={() => at !== undefined && dispatch({ type: 'splitWall', wallId, at })}>
          <ScissorsIcon /> Split
        </Button>
      </div>
      {check !== undefined && !check.ok ? <p className="text-[12px] text-destructive">{check.reason}</p> : <p className="text-[12px] text-ink-3">Openings, extra studs and panel breaks go with their piece; select both pieces to join them back.</p>}
    </div>
  );
}

/**
 * Quebras de painel da parede (S29), em x do arquivo (do `start` na planta). Automáticas até a primeira edição;
 * daí a lista inteira vai para `panelBreaks` e o motor usa exatamente ela. "Automatic" apaga o campo.
 */
/** Liga/desliga a chapa nesta parede (S38); "segue" o tipo ou o projeto quando vazio. */
function SheathingField({ id, draft, wall, onChange }: { id: string; draft: ProjectDraft; wall: DraftWall; onChange: (s: DraftWall['sheathing']) => void }) {
  const choice = wallSheathingChoice(wall.sheathing);
  const follow = sheathingStatus(draft, { ...wall, sheathing: undefined });
  const options = [
    { value: 'on', label: 'Sheathed' },
    { value: 'off', label: 'No sheathing' },
    ...(choice === 'custom' ? [{ value: 'custom', label: 'Custom (from the project file)' }] : []),
  ];
  return (
    <Field id={`w-${id}-sheathing`} label="Sheathing" hint={sheathingStatus(draft, wall).text} className="col-span-2">
      <EnumSelect
        id={`w-${id}-sheathing`}
        value={choice}
        noneLabel={`${follow.source === 'type' ? 'From type' : 'From project'} (${follow.on ? 'sheathed' : 'none'})`}
        options={options}
        onChange={(v) => {
          if (v === 'custom') return;
          onChange(v === undefined ? undefined : v === 'on');
        }}
      />
    </Field>
  );
}

function PanelBreaksSection({ id, length, breaks, issue, onChange }: { id: string; length: number | undefined; breaks: ShownBreaks | undefined; issue: boolean; onChange: (list: number[] | undefined) => void }) {
  const list = breaks?.breaks ?? [];
  const manual = breaks?.manual === true;
  const suggestion = length === undefined || breaks === undefined ? undefined : suggestBreak(length, list, breaks.candidates);
  return (
    <Section
      title={`Panels (${list.length + 1})`}
      collapsible
      defaultOpen={manual || issue}
      actions={
        <span className="flex items-center gap-1">
          {manual ? (
            <Button variant="ghost" size="xs" onClick={() => onChange(undefined)}>
              <RotateCcwIcon /> Automatic
            </Button>
          ) : null}
          <Button variant="outline" size="xs" disabled={suggestion === undefined} onClick={() => suggestion !== undefined && onChange(withBreak(list, suggestion))}>
            <PlusIcon /> Add break
          </Button>
        </span>
      }
    >
      <p className="text-[12px] text-ink-3">
        {manual
          ? 'Set by you: the engine uses exactly these breaks. Each one must sit on a layout stud clear of openings, tees and corners.'
          : 'Automatic: fewest panels under the max length, balanced, preferring 4′ modules. Edit, add or drag one on the plan to take over.'}
      </p>
      {list.length === 0 ? null : (
        <ul className="space-y-2">
          {list.map((b, i) => (
            <li key={`${i}-${b}`} className="flex items-center gap-2">
              <span className="w-24 shrink-0 font-mono text-[12px] text-ink-3">
                P{i + 1} | P{i + 2}
              </span>
              <MeasureInput id={`w-${id}-break-${i}`} value={b} required aria-label={`Break ${i + 1}, from start`} onCommit={(v) => v !== undefined && onChange(movedBreak(list, i, v))} />
              <Button variant="ghost" size="icon-xs" aria-label={`Remove break ${i + 1}`} onClick={() => onChange(withoutBreak(list, i))}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Studs de altura inteira pedidos pelo projeto (`extraStuds`): x da borda esquerda do primeiro, quantos, rótulo. */
function ExtraStudsSection({ id, length, studs, onChange }: { id: string; length: number | undefined; studs: DraftWall['extraStuds']; onChange: (studs: DraftWall['extraStuds']) => void }) {
  const list = studs ?? [];
  const update = (i: number, patch: Patch<NonNullable<DraftWall['extraStuds']>[number]>): void =>
    onChange(list.map((s, n) => (n === i ? Object.fromEntries(Object.entries({ ...s, ...patch }).filter(([, v]) => v !== undefined)) : s)));
  const remove = (i: number): void => {
    const next = list.filter((_, n) => n !== i);
    onChange(next.length === 0 ? undefined : next);
  };
  const add = (): void => onChange([...list, { x: Math.round(((length ?? 0) / 2) * 16) / 16 }]);
  return (
    <Section
      title={`Extra studs (${list.length})`}
      collapsible
      defaultOpen={list.length > 0}
      actions={
        <Button variant="outline" size="xs" onClick={add}>
          <PlusIcon /> Add stud
        </Button>
      }
    >
      {list.length === 0 ? (
        <p className="text-[13px] text-ink-3">None. Use for hold-downs and point loads the drawings call out as (2) or (3) 2x studs (full-height studs beside the layout); solid 4x and 6x posts go under Posts.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((s, i) => (
            <li key={i} className="grid grid-cols-[1fr_4rem_1fr_auto] items-end gap-2">
              <Field id={`w-${id}-xs-${i}-x`} label={i === 0 ? 'Left edge (from start)' : ''}>
                <MeasureInput id={`w-${id}-xs-${i}-x`} value={s.x} required onCommit={(v) => v !== undefined && update(i, { x: v })} />
              </Field>
              <Field id={`w-${id}-xs-${i}-n`} label={i === 0 ? 'Count' : ''}>
                <NumberInput id={`w-${id}-xs-${i}-n`} value={s.count} integer min={1} placeholder="1" onCommit={(v) => update(i, { count: v })} />
              </Field>
              <Field id={`w-${id}-xs-${i}-l`} label={i === 0 ? 'Label' : ''}>
                <TextInput id={`w-${id}-xs-${i}-l`} value={s.label} placeholder="e.g. HDU2 post" onCommit={(v) => update(i, { label: v })} />
              </Field>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove extra stud ${i + 1}`} onClick={() => remove(i)}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Posts do projeto (S37, P45): borda esquerda (do `start`), seção 4x4/4x6/6x6, rótulo e os conectores de base e topo
 * (texto do projeto para a folha; a viga LVL apoiada vai no topo). A frase sob cada post diz quanto ele ocupa.
 */
function PostsSection({ id, draft, wall, length, issue, onChange }: { id: string; draft: ProjectDraft; wall: DraftWall; length: number | undefined; issue: boolean; onChange: (posts: DraftWall['posts']) => void }) {
  const list = wall.posts ?? [];
  const update = (i: number, patch: Patch<NonNullable<DraftWall['posts']>[number]>): void =>
    onChange(list.map((p, n) => (n === i ? Object.fromEntries(Object.entries({ ...p, ...patch }).filter(([, v]) => v !== undefined)) : p)));
  const remove = (i: number): void => {
    const next = list.filter((_, n) => n !== i);
    onChange(next.length === 0 ? undefined : next);
  };
  const add = (): void => onChange([...list, { x: Math.round(((length ?? 0) / 2) * 16) / 16, section: '4x4' }]);
  return (
    <Section
      title={`Posts (${list.length})`}
      collapsible
      defaultOpen={list.length > 0 || issue}
      actions={
        <Button variant="outline" size="xs" onClick={add}>
          <PlusIcon /> Add post
        </Button>
      }
    >
      {list.length === 0 ? (
        <p className="text-[13px] text-ink-3">None. Use for solid 4x4, 4x6 and 6x6 posts (stair corners, under a beam). Connectors are notes on the sheet, not pieces.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((p, i) => (
            <li key={i} className="space-y-2">
              <div className="grid grid-cols-[1fr_5rem_1fr_auto] items-end gap-2">
                <Field id={`w-${id}-post-${i}-x`} label={i === 0 ? 'Left edge (from start)' : ''} hint={postHint(draft.config, wall, p)}>
                  <MeasureInput id={`w-${id}-post-${i}-x`} value={p.x} required onCommit={(v) => v !== undefined && update(i, { x: v })} />
                </Field>
                <Field id={`w-${id}-post-${i}-s`} label={i === 0 ? 'Size' : ''}>
                  <EnumSelect id={`w-${id}-post-${i}-s`} value={p.section} noneLabel="Size" options={POST_SECTION_OPTIONS} onChange={(v) => update(i, { section: v as NonNullable<DraftWall['posts']>[number]['section'] })} />
                </Field>
                <Field id={`w-${id}-post-${i}-l`} label={i === 0 ? 'Label' : ''}>
                  <TextInput id={`w-${id}-post-${i}-l`} value={p.label} placeholder="e.g. P-01" onCommit={(v) => update(i, { label: v })} />
                </Field>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove post ${i + 1}`} onClick={() => remove(i)}>
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field id={`w-${id}-post-${i}-b`} label="Base connector">
                  <TextInput id={`w-${id}-post-${i}-b`} value={p.base} placeholder="e.g. HDU2 hold-down" onCommit={(v) => update(i, { base: v })} />
                </Field>
                <Field id={`w-${id}-post-${i}-t`} label="Top connector / beam">
                  <TextInput id={`w-${id}-post-${i}-t`} value={p.top} placeholder="e.g. LUS28, LVL above" onCommit={(v) => update(i, { top: v })} />
                </Field>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Fileiras de blocking por altura (S36, P44): presets (embutidos e do projeto) e fileiras com o centro do bloco ao
 * subfloor, trecho opcional (do `start`) e uso. Sem lista própria, a parede usa a do tipo; editar copia a do tipo.
 */
function BlockingSection({ id, draft, wall, issue, onChange }: { id: string; draft: ProjectDraft; wall: DraftWall; issue: boolean; onChange: (blocking: DraftWall['blocking']) => void }) {
  const config = draft.config;
  const fromType = blockingFromType(config, wall);
  const list = wall.blocking ?? [];
  const presets = blockingPresetOptions(config);
  const base = (): NonNullable<DraftWall['blocking']> => [...(wall.blocking ?? fromType ?? [])];
  const update = (i: number, patch: Patch<DraftBlockingRow>): void =>
    onChange(
      list.map((e, n) =>
        n === i && typeof e !== 'string' ? (Object.fromEntries(Object.entries({ ...e, ...patch }).filter(([, v]) => v !== undefined)) as DraftBlockingRow) : e,
      ),
    );
  const count = (wall.blocking ?? fromType ?? []).length;
  return (
    <Section
      title={`Blocking (${count})`}
      collapsible
      defaultOpen={count > 0 || issue}
      actions={
        <span className="flex items-center gap-2">
          <EnumSelect
            id={`w-${id}-bk-preset`}
            value={undefined}
            noneLabel="Add preset…"
            options={presets.map((p) => ({ value: p.id, label: `${p.label} · ${p.y === undefined ? '?' : formatMeasure(p.y)}` }))}
            onChange={(v) => v !== undefined && onChange([...base(), v])}
          />
          <Button variant="outline" size="xs" onClick={() => onChange([...base(), { y: 36 }])}>
            <PlusIcon /> Add row
          </Button>
        </span>
      }
    >
      {fromType !== undefined ? (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-3">
            From wall type {wall.wallType}: {fromType.map((e) => blockingEntryText(e, config)).join('; ')}.
          </p>
          <span className="flex gap-2">
            <Button variant="outline" size="xs" onClick={() => onChange(base())}>
              Edit for this wall
            </Button>
            <Button variant="ghost" size="xs" onClick={() => onChange([])}>
              None on this wall
            </Button>
          </span>
        </div>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          {wall.blocking === undefined
            ? 'None. Add backing for cabinets and bath accessories: blocks between the studs, centered at the height (hypothesis P44).'
            : 'None on this wall (its wall type has blocking).'}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((e, i) =>
            typeof e === 'string' ? (
              <li key={i} className="flex items-center justify-between gap-2 text-[13px]">
                <span>
                  <span className="font-mono text-ink-3">{e}</span> {blockingEntryText(e, config)}
                </span>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove blocking row ${i + 1}`} onClick={() => onChange(withoutBlockingEntry(config, wall, i))}>
                  <Trash2Icon />
                </Button>
              </li>
            ) : (
              <li key={i} className="grid grid-cols-[1fr_1fr_1fr_1.4fr_auto] items-end gap-2">
                <Field id={`w-${id}-bk-${i}-y`} label={i === 0 ? 'Center height' : ''}>
                  <MeasureInput id={`w-${id}-bk-${i}-y`} value={e.y} positive required onCommit={(v) => v !== undefined && update(i, { y: v })} />
                </Field>
                <Field id={`w-${id}-bk-${i}-from`} label={i === 0 ? 'From' : ''}>
                  <MeasureInput id={`w-${id}-bk-${i}-from`} value={e.from} placeholder="start" onCommit={(v) => update(i, { from: v })} />
                </Field>
                <Field id={`w-${id}-bk-${i}-to`} label={i === 0 ? 'To' : ''}>
                  <MeasureInput id={`w-${id}-bk-${i}-to`} value={e.to} placeholder="end" onCommit={(v) => update(i, { to: v })} />
                </Field>
                <Field id={`w-${id}-bk-${i}-l`} label={i === 0 ? 'Use' : ''}>
                  <TextInput id={`w-${id}-bk-${i}-l`} value={e.label} placeholder="e.g. Grab bar" onCommit={(v) => update(i, { label: v })} />
                </Field>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove blocking row ${i + 1}`} onClick={() => onChange(withoutBlockingEntry(config, wall, i))}>
                  <Trash2Icon />
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
    </Section>
  );
}

const END_OPTIONS = [
  { value: 'through', label: 'Through (plate runs to the outer face)' },
  { value: 'butt', label: 'Butt (plate stops at the inner face)' },
] as const;
export const SECTION_OPTIONS = [
  { value: '2x4', label: '2x4' },
  { value: '2x6', label: '2x6' },
] as const;
export const SPAN_OPTIONS = [
  { value: 'center', label: 'Center bearing' },
  { value: 'clear', label: 'Clear span' },
] as const;
/** Confiança da IA → variante do Badge (chip claro, docs/10-design.md §3). */
export const TONE_VARIANT = { success: 'success', warning: 'warning', destructive: 'destructive' } as const;
