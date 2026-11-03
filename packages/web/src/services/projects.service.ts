/**
 * Projetos salvos no servidor (S22.1): criar na primeira abertura, carregar pela URL, gravar a cada edição com
 * concorrência otimista. O conteúdo é o `.panelizer.json` inteiro (lib/editor/project-file.ts) em `data jsonb`,
 * o mesmo formato do arquivo e do CLI. A tabela entra por `deps` (`ProjectsTable`), como o Supabase nos outros
 * services: testes com um `Map`, sem rede. Sem Supabase configurado, tudo devolve `unconfigured` e o app segue só
 * com a sessão do navegador, como antes.
 *
 * Revisão: o cliente guarda a revisão que carregou e a manda em cada gravação; se outra pessoa gravou antes, a
 * linha já está em outra revisão, nada é escrito e a resposta é `conflict` com a revisão atual — a tela avisa
 * "edited elsewhere" em vez de sobrescrever (decisão de 2026-10-22).
 */

import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseProjectsTable, type ProjectsTable } from '@/lib/supabase/projects-table';
import type { Json } from '@/types/json';
import type { SessionUser } from './auth.service';

export interface ProjectsDeps {
  table: () => Promise<ProjectsTable | undefined>;
}

export const defaultDeps: ProjectsDeps = {
  table: async () => {
    const client = await supabaseServer();
    return client === undefined ? undefined : supabaseProjectsTable(client);
  },
};

/** O projeto como a tela o recebe: o texto do `.panelizer.json` e a revisão a mandar na próxima gravação. */
export interface SavedProject {
  id: string;
  name: string;
  revision: number;
  text: string;
  updatedAt: string;
  ownerEmail: string | null;
}

export type CreateResult = { ok: true; id: string; revision: number; savedAt: string } | { ok: false; reason: 'unconfigured' | 'signed_out' | 'invalid' | 'failed'; message: string };

export type LoadResult = { ok: true; project: SavedProject } | { ok: false; reason: 'unconfigured' | 'not_found' | 'failed'; message: string };

export type SaveResult =
  | { ok: true; revision: number; savedAt: string }
  | { ok: false; reason: 'conflict'; revision: number; updatedAt: string; message: string }
  | { ok: false; reason: 'unconfigured' | 'not_found' | 'invalid' | 'failed'; message: string };

export const NAME_MAX = 200;

/** Nome como a tabela aceita: 1 a 200 caracteres, sem espaços nas pontas; vazio vira "Untitled project". */
export function projectName(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  const base = trimmed === '' ? 'Untitled project' : trimmed;
  return base.length > NAME_MAX ? base.slice(0, NAME_MAX) : base;
}

/** O texto do arquivo como JSON para o `jsonb`; texto que não é um objeto JSON é recusado antes de chegar ao banco. */
export function parseProjectData(text: string): { ok: true; data: Json } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: `The project is not valid JSON: ${(e as Error).message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, message: 'The project must be a JSON object.' };
  return { ok: true, data: parsed as Json };
}

function failure(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function createProject(input: { name: string | undefined; text: string }, user: SessionUser | undefined, deps: ProjectsDeps = defaultDeps): Promise<CreateResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: 'Projects are not saved on this server.' };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to save projects.' };
  const data = parseProjectData(input.text);
  if (!data.ok) return { ok: false, reason: 'invalid', message: data.message };
  try {
    const row = await table.insert({ name: projectName(input.name), data: data.data, owner_id: user.id, owner_email: user.email });
    return { ok: true, id: row.id, revision: row.revision, savedAt: row.updated_at };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not save the project: ${failure(e)}` };
  }
}

export async function loadProject(id: string, deps: ProjectsDeps = defaultDeps): Promise<LoadResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: 'Projects are not saved on this server.' };
  try {
    const row = await table.get(id);
    if (row === undefined) return { ok: false, reason: 'not_found', message: 'This project does not exist, or was deleted.' };
    return {
      ok: true,
      project: { id: row.id, name: row.name, revision: row.revision, text: JSON.stringify(row.data, null, 2), updatedAt: row.updated_at, ownerEmail: row.owner_email },
    };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not load the project: ${failure(e)}` };
  }
}

export async function saveProject(input: { id: string; revision: number; name: string | undefined; text: string }, deps: ProjectsDeps = defaultDeps): Promise<SaveResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: 'Projects are not saved on this server.' };
  const data = parseProjectData(input.text);
  if (!data.ok) return { ok: false, reason: 'invalid', message: data.message };
  try {
    const saved = await table.updateIfRevision(input.id, input.revision, { name: projectName(input.name), data: data.data });
    if (saved !== undefined) return { ok: true, revision: saved.revision, savedAt: saved.updated_at };
    // Nada gravado: ou a revisão mudou (alguém gravou antes), ou o projeto sumiu.
    const current = await table.get(input.id);
    if (current === undefined) return { ok: false, reason: 'not_found', message: 'This project was deleted on the server.' };
    return {
      ok: false,
      reason: 'conflict',
      revision: current.revision,
      updatedAt: current.updated_at,
      message: `This project was edited elsewhere (revision ${current.revision}). Reload to see the latest version; your unsaved changes stay in this browser.`,
    };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not save the project: ${failure(e)}` };
  }
}
