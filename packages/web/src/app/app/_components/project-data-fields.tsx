'use client';

import type { Control, FieldValues, Path } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectData } from '@/types/extract';

const AUTO = 'auto';
const SPAN_LABELS: Record<string, string> = { [AUTO]: 'Not known', center: 'Center bearing', clear: 'Clear span' };
const EXPOSURE_LABELS: Record<string, string> = { [AUTO]: 'Not known', B: 'B', C: 'C', D: 'D' };

/**
 * Campos do que os desenhos não trazem (docs/04-decisoes 2026-10-15): altura da parede e dados do estrutural.
 * Usado no upload (antes da leitura) e na revisão (depois, sem nova chamada à IA). `T` é o formulário que os contém.
 */
export function ProjectDataFields<T extends FieldValues & ProjectData>({ control, compact = false }: { control: Control<T>; compact?: boolean }) {
  const name = (k: keyof ProjectData) => k as Path<T>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          control={control}
          name={name('wallHeight')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Wall height <span className="font-normal text-ink-3">(if no sections)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder={`e.g. 9'-1 1/8"`} className="font-mono" />
              </FormControl>
              {compact ? null : <FormDescription>Subfloor to top of the double top plate.</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name('headerHeight')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Header height <span className="font-normal text-ink-3">(top of RO)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder={`6'-10 1/2"`} className="font-mono" />
              </FormControl>
              {compact ? null : <FormDescription>From the subfloor. Empty: the drawings, else the factory standard.</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name('sillHeight')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Window sill height <span className="font-normal text-ink-3">(if no elevations)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder={`e.g. 2'-0"`} className="font-mono" />
              </FormControl>
              {compact ? null : <FormDescription>From the subfloor, for window types the drawings leave blank.</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          control={control}
          name={name('floors')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Floors above this level</FormLabel>
              <FormControl>
                <Input {...field} placeholder="2" inputMode="numeric" className="font-mono" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name('floorSpan')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Floor span</FormLabel>
              <Select value={(field.value as string) || AUTO} onValueChange={(v) => field.onChange(v === AUTO ? '' : v)}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue>{SPAN_LABELS[(field.value as string) || AUTO]}</SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={AUTO}>Not known</SelectItem>
                  <SelectItem value="center">Center bearing</SelectItem>
                  <SelectItem value="clear">Clear span</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name('snow')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Snow load (psf)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="30" inputMode="decimal" className="font-mono" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name('width')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Building width</FormLabel>
              <FormControl>
                <Input {...field} placeholder={`29'`} className="font-mono" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name('wind')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Wind (mph)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="130" inputMode="numeric" className="font-mono" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name('exposure')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Exposure</FormLabel>
              <Select value={(field.value as string) || AUTO} onValueChange={(v) => field.onChange(v === AUTO ? '' : v)}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue>{EXPOSURE_LABELS[(field.value as string) || AUTO]}</SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={AUTO}>Not known</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="D">D</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
