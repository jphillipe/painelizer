/**
 * Auto-save no servidor (S22.1), a parte pura: o que o cliente sabe do projeto salvo, a máquina de estados do
 * chip "Saved · just now" e a URL de cada passo. O hook `use-project-sync.ts` liga isto à action e ao debounce.
 */

import type { SaveResult } from '@/services/projects.service';
import { describeAge } from './persist';

/** O que o cliente guarda do projeto no servidor: id, a revisão a mandar na próxima gravação e quando gravou. */
export interface ServerProject {
  id: string;
  revision: number;
  /** ISO, do `updated_at` do servidor. */
  savedAt: string;
}

export type SaveStatus =
  /** Sem projeto no servidor (Supabase desligado ou ainda não criado): só a sessão do navegador. */
  | { kind: 'local' }
  | { kind: 'saved'; at: number }
  | { kind: 'saving' }
  /** Falhou (rede, servidor): tenta de novo na próxima edição ou pelo botão. */
  | { kind: 'error'; message: string }
  /** Outra pessoa gravou antes: nada mais é gravado até recarregar. */
  | { kind: 'conflict'; message: string; revision: number }
  | { kind: 'deleted'; message: string };

export function projectPath(id: string, step: 2 | 3 = 2): string {
  return step === 3 ? `/app/projects/${id}/panels` : `/app/projects/${id}`;
}

/** Id de projeto numa URL `/app/projects/<id>[/panels]`, ou `undefined`. */
export function projectIdFromPath(pathname: string): string | undefined {
  return /^\/app\/projects\/([^/]+)(?:\/panels)?\/?$/.exec(pathname)?.[1];
}

/** Resultado da action → próximo estado do chip. `serverError` (sem `data`) é erro de rede/servidor. */
export function statusAfterSave(result: SaveResult | undefined, serverError: string | undefined, now: number): SaveStatus {
  if (result === undefined) return { kind: 'error', message: serverError ?? 'Could not reach the server.' };
  if (result.ok) return { kind: 'saved', at: Date.parse(result.savedAt) || now };
  switch (result.reason) {
    case 'conflict':
      return { kind: 'conflict', message: result.message, revision: result.revision };
    case 'not_found':
      return { kind: 'deleted', message: result.message };
    case 'unconfigured':
      return { kind: 'local' };
    default:
      return { kind: 'error', message: result.message };
  }
}

/** Com conflito ou projeto apagado não adianta gravar de novo: o humano precisa recarregar ou salvar como novo. */
export function canSave(status: SaveStatus): boolean {
  return status.kind !== 'conflict' && status.kind !== 'deleted' && status.kind !== 'local';
}

export interface SaveLabel {
  text: string;
  tone: 'muted' | 'ok' | 'busy' | 'warning' | 'error';
}

export function describeSave(status: SaveStatus, now: number): SaveLabel {
  switch (status.kind) {
    case 'local':
      return { text: 'Saved in this browser', tone: 'muted' };
    case 'saved':
      return { text: `Saved · ${describeAge(status.at, now)}`, tone: 'ok' };
    case 'saving':
      return { text: 'Saving…', tone: 'busy' };
    case 'error':
      return { text: 'Not saved', tone: 'error' };
    case 'conflict':
      return { text: 'Edited elsewhere', tone: 'warning' };
    case 'deleted':
      return { text: 'Deleted on the server', tone: 'error' };
  }
}
