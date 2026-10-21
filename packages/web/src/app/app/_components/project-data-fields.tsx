'use client';

import type { Control, FieldValues, Path } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LABELS } from '@/lib/editor/labels';
import type { RequiredField } from '@/lib/editor/requirements';
import type { ProjectData } from '@/types/extract';
import { cn } from '@/lib/utils';

const AUTO = 'auto';
const SPAN_LABELS: Record<string, string> = { [AUTO]: LABELS.floorSpanUnknown, center: LABELS.floorSpanCenter, clear: LABELS.floorSpanClear };
const EXPOSURE_LABELS: Record<string, string> = { [AUTO]: LABELS.exposureUnknown, B: 'B', C: 'C', D: 'D' };

/**
 * `full`: upload (com descrições). `compact`: configurações do projeto (sem descrições). `setup`: card "Before you
 * review" (S21.4) — os campos que o motor exige deste projeto em destaque (`required`), o resto em "Optional".
 */
export type ProjectDataLayout = 'full' | 'compact' | 'setup';

type FieldKey = keyof ProjectData;
const REQUIRED_KEY: Record<RequiredField, FieldKey> = { wallHeight: 'wallHeight', snow: 'snow', width: 'width', floors: 'floors', floorSpan: 'floorSpan' };
/** Ordem dos campos no card de setup. */
const SETUP_ORDER: FieldKey[] = ['wallHeight', 'floors', 'floorSpan', 'snow', 'width', 'wind', 'exposure', 'headerHeight', 'sillHeight'];

interface FieldProps<T extends FieldValues & ProjectData> {
  control: Control<T>;
  describe: boolean;
  required?: boolean;
}

/**
 * Campos do que os desenhos não trazem (docs/04-decisoes 2026-10-15): altura da parede e dados do estrutural.
 * Usado no upload (antes da leitura) e na revisão (depois, sem nova chamada à IA). `T` é o formulário que os contém.
 */
export function ProjectDataFields<T extends FieldValues & ProjectData>({
  control,
  compact = false,
  layout,
  required = [],
  fields,
}: {
  control: Control<T>;
  compact?: boolean;
  layout?: ProjectDataLayout;
  /** `setup`: o que o motor exige deste projeto (lib/editor/requirements). */
  required?: readonly RequiredField[];
  /** Só estes campos (M5: nas configurações, só o que não tem campo próprio no projeto). */
  fields?: readonly FieldKey[] | undefined;
}) {
  const mode: ProjectDataLayout = layout ?? (compact ? 'compact' : 'full');
  const describe = mode === 'full';
  if (fields !== undefined) {
    return (
      <div className={cn('grid gap-4', fields.length > 1 && 'sm:grid-cols-2')}>
        {fields.map((k) => (
          <Field key={k} name={k} control={control} describe={describe} />
        ))}
      </div>
    );
  }
  if (mode === 'setup') {
    const req = new Set<FieldKey>(required.map((r) => REQUIRED_KEY[r]));
    const main = SETUP_ORDER.filter((k) => req.has(k));
    const rest = SETUP_ORDER.filter((k) => !main.includes(k));
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Required for this project</p>
          <div className={cn('grid gap-4', main.length > 1 && 'sm:grid-cols-2 lg:grid-cols-3')}>
            {main.map((k) => (
              <Field key={k} name={k} control={control} describe={false} required={req.has(k)} />
            ))}
          </div>
        </div>
        <details className="group rounded-md border bg-paper-2/60 p-3 open:bg-paper-2/60">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2 select-none">
            Optional <span className="font-normal text-ink-3">— the engine has a default or the drawings may answer; fill in if the structural notes say</span>
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((k) => (
              <Field key={k} name={k} control={control} describe={false} />
            ))}
          </div>
        </details>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="wallHeight" control={control} describe={describe} />
        <Field name="headerHeight" control={control} describe={describe} />
        <Field name="sillHeight" control={control} describe={describe} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="floors" control={control} describe={describe} />
        <Field name="floorSpan" control={control} describe={describe} />
        <Field name="snow" control={control} describe={describe} />
        <Field name="width" control={control} describe={describe} />
        <Field name="wind" control={control} describe={describe} />
        <Field name="exposure" control={control} describe={describe} />
      </div>
    </div>
  );
}

function Field<T extends FieldValues & ProjectData>({ name, control, describe, required = false }: FieldProps<T> & { name: FieldKey }) {
  switch (name) {
    case 'wallHeight':
      return (
        <TextField control={control} name={name} required={required} label={LABELS.wallHeight} hint={required ? undefined : "(if no sections)"} placeholder={`e.g. ${LABELS.wallHeightPlaceholder}`} description={describe || required ? `${LABELS.wallHeightHint}.` : undefined} />
      );
    case 'headerHeight':
      return <TextField control={control} name={name} required={required} label={LABELS.headerHeight} hint="(top of RO)" placeholder={LABELS.headerHeightPlaceholder} description={describe ? `${LABELS.headerHeightHint}. Empty: the drawings, else the factory standard.` : undefined} />;
    case 'sillHeight':
      return <TextField control={control} name={name} required={required} label={LABELS.sillHeight} hint="(if no elevations)" placeholder={`e.g. ${LABELS.sillHeightPlaceholder}`} description={describe ? 'From the subfloor, for window types the drawings leave blank.' : undefined} />;
    case 'floors':
      return <TextField control={control} name={name} required={required} label={LABELS.floors} placeholder="2" inputMode="numeric" description={required ? 'Bearing walls: picks the row of the IRC header table.' : undefined} />;
    case 'snow':
      return <TextField control={control} name={name} required={required} label={LABELS.snow} placeholder={LABELS.snowPlaceholder} inputMode="decimal" description={required ? 'Ground snow load from the structural notes.' : undefined} />;
    case 'width':
      return <TextField control={control} name={name} required={required} label={LABELS.width} placeholder={LABELS.widthPlaceholder} description={required ? 'Depth of the building the floor joists span.' : undefined} />;
    case 'wind':
      return <TextField control={control} name={name} required={required} label={LABELS.wind} placeholder={LABELS.windPlaceholder} inputMode="numeric" description={describe ? "Empty: 1 king stud per side, with a warning." : undefined} />;
    case 'floorSpan':
      return (
        <SelectField control={control} name={name} required={required} label={LABELS.floorSpan} labels={SPAN_LABELS} options={['center', 'clear']} description={required ? 'Do the floor joists rest on a center bearing wall or beam, or span the whole width? Not known = worst case, and the header falls outside the table.' : 'Not known = worst case; headers may fall outside the table.'} />
      );
    case 'exposure':
      return <SelectField control={control} name={name} required={required} label={LABELS.exposure} labels={EXPOSURE_LABELS} options={['B', 'C', 'D']} />;
  }
}

function TextField<T extends FieldValues & ProjectData>({
  control,
  name,
  label,
  hint,
  placeholder,
  inputMode,
  description,
  required,
}: {
  control: Control<T>;
  name: FieldKey;
  label: string;
  hint?: string | undefined;
  placeholder: string;
  inputMode?: 'numeric' | 'decimal' | undefined;
  description?: string | undefined;
  required: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name as Path<T>}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={required ? 'font-semibold' : undefined}>
            {label} {hint !== undefined ? <span className="font-normal text-ink-3">{hint}</span> : null}
            {required ? <span className="font-normal text-gold-700"> · required</span> : null}
          </FormLabel>
          <FormControl>
            <Input {...field} placeholder={placeholder} inputMode={inputMode} className={cn('font-mono', required && 'border-line-strong bg-card')} aria-required={required || undefined} />
          </FormControl>
          {description !== undefined ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SelectField<T extends FieldValues & ProjectData>({
  control,
  name,
  label,
  labels,
  options,
  description,
  required = false,
}: {
  control: Control<T>;
  name: FieldKey;
  label: string;
  labels: Record<string, string>;
  options: readonly string[];
  description?: string | undefined;
  required?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name as Path<T>}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={required ? 'font-semibold' : undefined}>
            {label}
            {required ? <span className="font-normal text-gold-700"> · required</span> : null}
          </FormLabel>
          <Select value={(field.value as string) || AUTO} onValueChange={(v) => field.onChange(v === AUTO ? '' : v)}>
            <FormControl>
              <SelectTrigger className={cn('w-full', required && 'border-line-strong bg-card')} aria-required={required || undefined}>
                <SelectValue>{labels[(field.value as string) || AUTO]}</SelectValue>
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={AUTO}>{labels[AUTO]}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {labels[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description !== undefined ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

