'use client';

import type { Dispatch } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ProjectDraft } from '@/lib/editor/draft';
import type { EditorAction } from '@/lib/editor/state';
import type { ExtractOutcome } from '@/types/extract';
import { ProjectProperties } from './project-properties';

export interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ProjectDraft;
  dispatch: Dispatch<EditorAction>;
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  dirty: boolean;
  onOutcome: (outcome: ExtractOutcome) => void;
}

/**
 * Configurações do projeto num dialog rolável (S21.4): o inspetor fica só com parede e abertura. Os campos
 * confirmam no blur/Enter como no inspetor; fechar não desfaz nada (undo continua valendo).
 */
export function ProjectSettingsDialog({ open, onOpenChange, draft, dispatch, outcome, dirty, onOutcome }: ProjectSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>Framing, panels, building data and the schedules the reading found. Changes apply as you leave each field.</DialogDescription>
        </DialogHeader>
        <ProjectProperties draft={draft} dispatch={dispatch} outcome={outcome} dirty={dirty} onOutcome={onOutcome} showProjectData />
      </DialogContent>
    </Dialog>
  );
}
