'use client';

import { CopyIcon, MergeIcon, Trash2Icon } from 'lucide-react';
import type { Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import type { DraftWall, ProjectDraft } from '@/lib/editor/draft';
import { LABELS } from '@/lib/editor/labels';
import type { EditorAction, Selection } from '@/lib/editor/state';
import { joinBlocker } from '@/lib/editor/wall-ops';
import { BoolSelect, EnumSelect, Field, MeasureInput, NumberInput, Section, TextInput } from './fields';
import { SECTION_OPTIONS, SPAN_OPTIONS } from './wall-properties';

export interface WallsPropertiesProps {
  draft: ProjectDraft;
  wallIds: readonly string[];
  dispatch: Dispatch<EditorAction>;
  onSelect: (s: Selection) => void;
}

type CommonKey = 'height' | 'section' | 'exterior' | 'bearing' | 'level' | 'floorsSupported' | 'floorSpan' | 'wallType';

/** O valor comum a todas, ou `mixed` quando diferem. */
function common<K extends CommonKey>(
  walls: readonly DraftWall[],
  key: K,
): { value: DraftWall[K] | undefined; mixed: boolean } {
  const first = walls[0]?.[key];
  const mixed = walls.some((w) => w[key] !== first);
  return { value: mixed ? undefined : first, mixed };
}

/**
 * Várias paredes selecionadas (S30): as ações em lote (duplicar, juntar duas, remover) e os campos comuns — mostram
 * o valor quando todas concordam, "Mixed" quando não; mudar um campo grava em todas, num undo só.
 */
export function WallsProperties({ draft, wallIds, dispatch, onSelect }: WallsPropertiesProps) {
  const walls = draft.walls.filter((w) => wallIds.includes(w.id));
  const ids = walls.map((w) => w.id);
  const set = (patch: Extract<EditorAction, { type: 'updateWalls' }>['patch']): void =>
    dispatch({ type: 'updateWalls', wallIds: ids, patch });
  const pair = ids.length === 2 ? ([ids[0]!, ids[1]!] as const) : undefined;
  const blocker = pair === undefined ? undefined : joinBlocker(draft, pair[0], pair[1]);
  const level = common(walls, 'level');
  const height = common(walls, 'height');
  const section = common(walls, 'section');
  const exterior = common(walls, 'exterior');
  const bearing = common(walls, 'bearing');
  const floors = common(walls, 'floorsSupported');
  const span = common(walls, 'floorSpan');
  const wallType = common(walls, 'wallType');
  const mixed = (m: boolean, fallback: string): string => (m ? 'Mixed' : fallback);
  const key = ids.join('-');

  return (
    <div className="space-y-6">
      <Section
        title={`${ids.length} walls`}
        actions={
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => dispatch({ type: 'duplicateWalls', wallIds: ids })}>
              <CopyIcon /> Duplicate
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-destructive"
              onClick={() => dispatch({ type: 'removeWalls', wallIds: ids })}
            >
              <Trash2Icon /> Remove
            </Button>
          </span>
        }
      >
        <ul className="flex flex-wrap gap-1" aria-label="Selected walls">
          {ids.map((id) => (
            <li key={id}>
              <Button
                variant="outline"
                size="xs"
                className="font-mono"
                title={`Edit ${id} alone`}
                onClick={() => onSelect({ kind: 'wall', wallId: id })}
              >
                {id}
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-3">
          Drag any of them on the plan, or use the arrows, to move them together. Shift+click a wall to add or drop it.
        </p>
        {pair !== undefined ? (
          <div className="space-y-1">
            <Button
              variant="outline"
              size="sm"
              disabled={blocker !== undefined}
              onClick={() => dispatch({ type: 'joinWalls', wallIds: pair })}
            >
              <MergeIcon /> Join into {pair[0]}
            </Button>
            <p className={blocker === undefined ? 'text-[12px] text-ink-3' : 'text-[12px] text-destructive'}>
              {blocker ??
                'One wall from end to end; openings and extra studs keep their place, panel breaks go back to automatic.'}
            </p>
          </div>
        ) : null}
      </Section>

      <Section title="Common fields">
        <div className="grid grid-cols-2 gap-3">
          <Field id={`ws-${key}-level`} label="Level">
            <NumberInput
              id={`ws-${key}-level`}
              value={level.value}
              integer
              min={1}
              placeholder={mixed(level.mixed, '1')}
              onCommit={(v) => set({ level: v })}
            />
          </Field>
          <Field id={`ws-${key}-height`} label="Height" hint={LABELS.wallHeightHint}>
            <MeasureInput
              id={`ws-${key}-height`}
              value={height.value}
              positive
              placeholder={mixed(height.mixed, `e.g. 8'-1 1/8"`)}
              onCommit={(v) => set({ height: v })}
            />
          </Field>
          <Field id={`ws-${key}-section`} label="Section">
            <EnumSelect
              id={`ws-${key}-section`}
              value={section.value}
              noneLabel={mixed(section.mixed, 'Not set')}
              options={SECTION_OPTIONS}
              onChange={(v) => set({ section: v as DraftWall['section'] })}
            />
          </Field>
          <Field id={`ws-${key}-ext`} label="Position">
            <BoolSelect
              id={`ws-${key}-ext`}
              value={exterior.value}
              trueLabel="Exterior"
              falseLabel="Interior"
              noneLabel={mixed(exterior.mixed, 'Not set')}
              onChange={(v) => set({ exterior: v })}
            />
          </Field>
          <Field id={`ws-${key}-bearing`} label="Load">
            <BoolSelect
              id={`ws-${key}-bearing`}
              value={bearing.value}
              trueLabel="Bearing"
              falseLabel="Non-bearing"
              noneLabel={mixed(bearing.mixed, 'Not set')}
              onChange={(v) => set({ bearing: v })}
            />
          </Field>
          <Field id={`ws-${key}-floors`} label={LABELS.floors}>
            <NumberInput
              id={`ws-${key}-floors`}
              value={floors.value}
              integer
              min={0}
              placeholder={mixed(floors.mixed, '0')}
              onCommit={(v) => set({ floorsSupported: v })}
            />
          </Field>
          <Field id={`ws-${key}-span`} label={LABELS.floorSpan}>
            <EnumSelect
              id={`ws-${key}-span`}
              value={span.value}
              noneLabel={mixed(span.mixed, LABELS.floorSpanUnknown)}
              options={SPAN_OPTIONS}
              onChange={(v) => set({ floorSpan: v as DraftWall['floorSpan'] })}
            />
          </Field>
          <Field id={`ws-${key}-type`} label="Wall type" hint="Architect's tag; not used by the engine">
            <TextInput
              id={`ws-${key}-type`}
              value={wallType.value}
              mono
              placeholder={mixed(wallType.mixed, '')}
              onCommit={(v) => set({ wallType: v })}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}
