'use client';

import { useAction } from 'next-safe-action/hooks';
import { toast } from 'sonner';
import { finishResponse } from '../_actions/finish-response';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ExtractOutcome } from '@/types/extract';

export interface AdvancedImportProps {
  onProjectText: (text: string) => void;
  onOutcome: (outcome: ExtractOutcome) => void;
}

/** Caminhos de desenvolvedor, recolhidos: arquivo de projeto do CLI e resposta gravada da IA. */
export function AdvancedImport({ onProjectText, onOutcome }: AdvancedImportProps) {
  const { execute, isPending } = useAction(finishResponse, {
    onSuccess: ({ data }) => {
      if (data) onOutcome(data);
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not load the recorded response.'),
  });

  const read = async (file: File | undefined, use: (text: string) => void) => {
    if (!file) return;
    use(await file.text());
    toast.success(`Loaded ${file.name}`);
  };

  return (
    <details className="rounded-md border bg-paper-2 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink-2">Advanced</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="project-file">Project file (.json)</Label>
          <Input id="project-file" type="file" accept=".json,application/json" onChange={(e) => void read(e.target.files?.[0], onProjectText)} />
          <p className="text-ink-3">The engine’s own input format. Generates panels directly.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="response-file">Recorded AI response (.json)</Label>
          <Input
            id="response-file"
            type="file"
            accept=".json,application/json"
            disabled={isPending}
            onChange={(e) => void read(e.target.files?.[0], (text) => execute({ responseJson: text }))}
          />
          <p className="text-ink-3">Replays a saved extraction without calling the API.</p>
        </div>
      </div>
    </details>
  );
}
