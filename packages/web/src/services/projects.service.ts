/**
 * Projetos salvos no servidor (S22.1): criar na primeira abertura, carregar pela URL, gravar a cada edição com
 * concorrência otimista; (S22.2) listar, renomear, duplicar e apagar. O conteúdo é o `.panelizer.json` inteiro
 * (lib/editor/project-file.ts) em `data jsonb`, o mesmo formato do arquivo e do CLI. A tabela entra por `deps`
 * (`ProjectsTable`), como o Supabase nos outros services: testes com um `Map`, sem rede. Sem Supabase
 * configurado, tudo devolve `unconfigured` e o app segue só com a sessão do navegador, como antes.
 *
 * Revisão: o cliente guarda a revisão que carregou e a manda em cada gravação; se outra pessoa gravou antes, a
 * linha já está em outra revisão, nada é escrito e a resposta é `conflict` com a revisão atual — a tela avisa
 * "edited elsewhere" em vez de sobrescrever (decisão de 2026-10-22).
 */

import 'server-only';
import { copyName, NAME_MAX, nameFromData, projectName, wallCountOf, withProjectName } from '@/lib/projects';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseProjectsTable, type ProjectsTable } from '@/lib/supabase/projects-table';
import type { Json } from '@/types/json';
import type { SessionUser } from './auth.service';

/** Reexportados da lib pura (S22.2): a tela e o service usam o mesmo limite e a mesma normalização. */
export { NAME_MAX, projectName };

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

/** Uma linha da lista (S22.2): o que dá para mostrar sem abrir o projeto. */
export interface ProjectSummary {
  id: string;
  name: string;
  walls: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  ownerEmail: string | null;
}

export type CreateResult = { ok: true; id: string; revision: number; savedAt: string } | { ok: false; reason: 'unconfigured' | 'signed_out' | 'invalid' | 'failed'; message: string };

export type LoadResult = { ok: true; project: SavedProject } | { ok: false; reason: 'unconfigured' | 'not_found' | 'failed'; message: string };

export type SaveResult =
  | { ok: true; revision: number; savedAt: string }
  | { ok: false; reason: 'conflict'; revision: number; updatedAt: string; message: string }
  | { ok: false; reason: 'unconfigured' | 'not_found' | 'invalid' | 'failed'; message: string };

export type ListResult = { ok: true; projects: ProjectSummary[] } | { ok: false; reason: 'unconfigured' | 'failed'; message: string };

export type RenameResult = { ok: true; name: string; revision: number; savedAt: string } | { ok: false; reason: 'unconfigured' | 'not_found' | 'invalid' | 'failed'; message: string };

export type DuplicateResult = { ok: true; id: string; name: string } | { ok: false; reason: 'unconfigured' | 'signed_out' | 'not_found' | 'failed'; message: string };

export type DeleteResult = { ok: true } | { ok: false; reason: 'unconfigured' | 'not_found' | 'failed'; message: string };

const UNCONFIGURED = 'Projects are not saved on this server.';

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
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to save projects.' };
  const data = parseProjectData(input.text);
  if (!data.ok) return { ok: false, reason: 'invalid', message: data.message };
  try {
    // Sem nome da tela (um sample ou arquivo sem leitura), o nome é o do arquivo — senão a lista mostraria "Untitled project" até a primeira edição (S22.2).
    const row = await table.insert({ name: projectName(input.name ?? nameFromData(data.data)), data: data.data, owner_id: user.id, owner_email: user.email });
    return { ok: true, id: row.id, revision: row.revision, savedAt: row.updated_at };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not save the project: ${failure(e)}` };
  }
}

export async function loadProject(id: string, deps: ProjectsDeps = defaultDeps): Promise<LoadResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
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
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
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

/** Todos os projetos do time, do mais recente para o mais antigo (S22.2). */
export async function listProjects(deps: ProjectsDeps = defaultDeps): Promise<ListResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  try {
    const rows = await table.list();
    return {
      ok: true,
      projects: rows.map((r) => ({ id: r.id, name: r.name, walls: wallCountOf(r.walls), revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at, ownerEmail: r.owner_email })),
    };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not list the projects: ${failure(e)}` };
  }
}

/** Tentativas de uma gravação condicional quando alguém grava no meio (auto-save do editor aberto, por exemplo). */
const RENAME_ATTEMPTS = 3;

/**
 * Renomear (S22.2) troca o nome da linha E o `name` dentro do `.panelizer.json` — senão o próximo auto-save do
 * editor devolveria o nome antigo. Passa pela gravação condicional: a revisão sobe, e um editor aberto no projeto
 * vê "Edited elsewhere" em vez de sobrescrever o nome novo. Nome vazio é recusado (não vira "Untitled project":
 * quem renomeia quis dar um nome).
 */
export async function renameProject(input: { id: string; name: string }, deps: ProjectsDeps = defaultDeps): Promise<RenameResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  const name = input.name.trim();
  if (name === '') return { ok: false, reason: 'invalid', message: 'Give the project a name.' };
  if (name.length > NAME_MAX) return { ok: false, reason: 'invalid', message: `The name can have at most ${NAME_MAX} characters.` };
  try {
    for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt++) {
      const row = await table.get(input.id);
      if (row === undefined) return { ok: false, reason: 'not_found', message: 'This project does not exist, or was deleted.' };
      const saved = await table.updateIfRevision(row.id, row.revision, { name, data: withProjectName(row.data, name) });
      if (saved !== undefined) return { ok: true, name, revision: saved.revision, savedAt: saved.updated_at };
    }
    return { ok: false, reason: 'failed', message: 'The project is being edited right now. Try again in a moment.' };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not rename the project: ${failure(e)}` };
  }
}

/** Cópia com o mesmo conteúdo, "Copy of <nome>" (também dentro do arquivo), autor = quem duplicou (S22.2). */
export async function duplicateProject(id: string, user: SessionUser | undefined, deps: ProjectsDeps = defaultDeps): Promise<DuplicateResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to duplicate projects.' };
  try {
    const row = await table.get(id);
    if (row === undefined) return { ok: false, reason: 'not_found', message: 'This project does not exist, or was deleted.' };
    const name = copyName(row.name);
    const copy = await table.insert({ name, data: withProjectName(row.data, name), owner_id: user.id, owner_email: user.email });
    return { ok: true, id: copy.id, name };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not duplicate the project: ${failure(e)}` };
  }
}

/** Apaga a linha (S22.2). Um editor aberto nela vê "Deleted on the server" na próxima gravação; a sessão local dele continua como buffer. */
export async function deleteProject(id: string, deps: ProjectsDeps = defaultDeps): Promise<DeleteResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  try {
    const deleted = await table.delete(id);
    if (!deleted) return { ok: false, reason: 'not_found', message: 'This project was already deleted.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not delete the project: ${failure(e)}` };
  }
}
