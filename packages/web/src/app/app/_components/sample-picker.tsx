'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Example } from '@/types/panels';

/** "Try with a sample": escolher um exemplo abre o projeto no editor (S21). */
export function SamplePicker({ examples, onPick, disabled }: { examples: readonly Example[]; onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="sample">Try with a sample</Label>
      <Select disabled={disabled} onValueChange={(id) => onPick(examples.find((e) => e.id === id)?.text ?? '')}>
        <SelectTrigger id="sample" className="w-full sm:w-80">
          <SelectValue placeholder="Pick a sample project…" />
        </SelectTrigger>
        <SelectContent>
          {examples.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
