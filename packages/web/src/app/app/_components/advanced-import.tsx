'use client';

import { useAction } from 'next-safe-action/hooks';
import { toast } from 'sonner';
import { finishResponse } from '../_actions/finish-response';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseProjectFile, type ParsedProjectFile } from '@/lib/editor/project-file';
import type { ExtractOutcome } from '@/types/extract';

export interface AdvancedImportProps {
  /** Arquivo de projeto: o do app (`.panelizer.json`, com a leitura) ou o do CLI. */
  onProjectFile: (file: ParsedProjectFile) => void;
  onOutcome: (outcome: ExtractOutcome) => void;
}

/** Caminhos de desenvolvedor, recolhidos: arquivo de projeto e resposta gravada da IA. */
export function AdvancedImport({ onProjectFile, onOutcome }: AdvancedImportProps) {
  const { execute, isPending } = useAction(finishResponse, {
    onSuccess: ({ data }) => {
      if (data) {
        onOutcome(data);
        if (data.ok) toast.success('Recorded response loaded.');
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not load the recorded response.'),
  });

  const read = async (input: HTMLInputElement, use: (text: string) => void) => {
    const file = input.files?.[0];
    if (!file) return;
    use(await file.text());
    // Mesmo arquivo de novo (depois de "Start over") dispara `change` outra vez.
    input.value = '';
  };

  return (
    <details className="rounded-md border bg-paper-2 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink-2">Advanced</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="project-file">Project file (.json)</Label>
          <Input
            id="project-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) =>
              void read(e.target, (text) => {
                const parsed = parseProjectFile(text);
                onProjectFile(parsed);
                toast.success(parsed.reading === undefined ? 'Project file opened.' : 'Project file opened with its AI reading.');
              })
            }
          />
          <p className="text-ink-3">A file saved from the editor (with its AI reading) or the engine’s own input format. Opens in the editor.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="response-file">Recorded AI response (.json)</Label>
          <Input id="response-file" type="file" accept=".json,application/json" disabled={isPending} onChange={(e) => void read(e.target, (text) => execute({ responseJson: text }))} />
          <p className="text-ink-3">Replays a saved extraction without calling the API.</p>
        </div>
      </div>
    </details>
  );
}
