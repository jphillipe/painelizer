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

import { errorMessage } from '@/lib/errors';
import 'server-only';
import { drawingsOfProjectData, withProjectDrawings } from '@/lib/drawings';
import { copyName, encodeCursor, NAME_MAX, nameFromData, parseCursor, projectName, revisionCopyName, wallCountOf, withCurrentHeavyKeys, withProjectName } from '@/lib/projects';
import { supabaseServer } from '@/lib/supabase/server';
import { ProjectsTableError, supabaseProjectsTable, type ProjectsTable } from '@/lib/supabase/projects-table';
import type { Json } from '@/types/json';
import type { SessionUser } from './auth.service';
import { copyDrawings, defaultDeps as defaultDrawingsDeps, removeDrawings, type DrawingsDeps } from './drawings.service';

/** Reexportados da lib pura (S22.2): a tela e o service usam o mesmo limite e a mesma normalização. */
export { NAME_MAX, projectName };

export interface ProjectsDeps {
  table: () => Promise<ProjectsTable | undefined>;
  /** Os desenhos no Storage (S22.3): apagar projeto apaga a pasta, duplicar copia os objetos. */
  drawings?: DrawingsDeps;
}

export const defaultDeps: ProjectsDeps = {
  table: async () => {
    const client = await supabaseServer();
    return client === undefined ? undefined : supabaseProjectsTable(client);
  },
  drawings: defaultDrawingsDeps,
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
  /** S32: quem gravou por último. */
  updatedByEmail: string | null;
  /** S32: quando foi para a lixeira (só na lixeira). */
  deletedAt: string | null;
}

/** S32: o que a lista pede — busca no nome, só os meus, a lixeira e a página (cursor de `lib/projects.ts`). */
export interface ListOptions {
  search?: string | undefined;
  mine?: boolean | undefined;
  trash?: boolean | undefined;
  before?: string | undefined;
}

/** Projetos por página na lista (S32). */
export const PAGE_SIZE = 50;

/** Um retrato do histórico (S32). */
export interface RevisionSummary {
  revision: number;
  name: string;
  savedByEmail: string | null;
  createdAt: string;
}

export type CreateResult = { ok: true; id: string; revision: number; savedAt: string } | { ok: false; reason: 'unconfigured' | 'signed_out' | 'no_team' | 'invalid' | 'failed'; message: string };

export type LoadResult = { ok: true; project: SavedProject } | { ok: false; reason: 'unconfigured' | 'not_found' | 'failed'; message: string };

export type SaveResult =
  | { ok: true; revision: number; savedAt: string }
  | { ok: false; reason: 'conflict'; revision: number; updatedAt: string; message: string }
  | { ok: false; reason: 'unconfigured' | 'not_found' | 'invalid' | 'failed'; message: string };

/** `next`: o cursor da página seguinte, quando há mais. */
export type ListResult = { ok: true; projects: ProjectSummary[]; next?: string } | { ok: false; reason: 'unconfigured' | 'invalid' | 'failed'; message: string };

export type RenameResult = { ok: true; name: string; revision: number; savedAt: string } | { ok: false; reason: 'unconfigured' | 'not_found' | 'invalid' | 'failed'; message: string };

export type DuplicateResult = { ok: true; id: string; name: string } | { ok: false; reason: 'unconfigured' | 'signed_out' | 'no_team' | 'not_found' | 'failed'; message: string };

export type DeleteResult = { ok: true } | { ok: false; reason: 'unconfigured' | 'not_found' | 'failed'; message: string };

export type RevisionsResult = { ok: true; revisions: RevisionSummary[] } | { ok: false; reason: 'unconfigured' | 'failed'; message: string };

const UNCONFIGURED = 'Projects are not saved on this server.';
const NO_TEAM = 'Your account is not in a team yet, so projects can’t be saved. Ask a team admin to add you (Account › Team).';

/** Falha da tabela como resultado: conta sem time tem frase própria (S32), o resto é `failed` com o detalhe. */
function failure(e: unknown, what: string): { ok: false; reason: 'no_team' | 'failed'; message: string } {
  if (e instanceof ProjectsTableError && e.code === 'NO_TEAM') return { ok: false, reason: 'no_team', message: NO_TEAM };
  return { ok: false, reason: 'failed', message: `Could not ${what}: ${errorMessage(e)}` };
}

/** O texto do arquivo como JSON para o `jsonb`; texto que não é um objeto JSON é recusado antes de chegar ao banco. */
export function parseProjectData(text: string): { ok: true; data: Json } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: `The project is not valid JSON: ${errorMessage(e)}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, message: 'The project must be a JSON object.' };
  return { ok: true, data: parsed as Json };
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
    return failure(e, 'save the project');
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
    return { ok: false, reason: 'failed', message: `Could not load the project: ${errorMessage(e)}` };
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
    if (current === undefined) return { ok: false, reason: 'not_found', message: 'This project was moved to the trash or deleted on the server. Save your changes as a new project to keep them.' };
    return {
      ok: false,
      reason: 'conflict',
      revision: current.revision,
      updatedAt: current.updated_at,
      // S23 (A4): "Reload" troca as edições daqui pela versão do servidor — a mensagem não promete o contrário.
      message: `This project was edited elsewhere (revision ${current.revision}). Your changes here are not saved: save them as a copy, overwrite the other version, or reload to drop them.`,
    };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not save the project: ${errorMessage(e)}` };
  }
}

/**
 * Uma página dos projetos do time (S22.2; S32: busca no nome, "mine", lixeira e cursor), do mais recente para o
 * mais antigo — a lixeira pela data em que o projeto entrou nela. Pede uma linha a mais para saber se há próxima.
 */
export async function listProjects(options: ListOptions, user: SessionUser | undefined, deps: ProjectsDeps = defaultDeps): Promise<ListResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  const before = options.before === undefined || options.before === '' ? undefined : parseCursor(options.before);
  if (before === null) return { ok: false, reason: 'invalid', message: 'This page link is not valid any more. Go back to the first page.' };
  const search = options.search?.trim().slice(0, NAME_MAX);
  try {
    const rows = await table.list({
      ...(search === undefined || search === '' ? {} : { search }),
      ...(options.mine === true && user !== undefined ? { ownerId: user.id } : {}),
      trash: options.trash === true,
      ...(before === undefined ? {} : { before }),
      limit: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    const lastAt = last === undefined ? undefined : options.trash === true ? last.deleted_at : last.updated_at;
    return {
      ok: true,
      projects: page.map((r) => ({
        id: r.id,
        name: r.name,
        walls: wallCountOf(r.walls),
        revision: r.revision,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        ownerEmail: r.owner_email,
        updatedByEmail: r.updated_by_email ?? null,
        deletedAt: r.deleted_at ?? null,
      })),
      ...(rows.length > PAGE_SIZE && last !== undefined && lastAt !== undefined && lastAt !== null ? { next: encodeCursor({ at: lastAt, id: last.id }) } : {}),
    };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not list the projects: ${errorMessage(e)}` };
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
    return { ok: false, reason: 'failed', message: `Could not rename the project: ${errorMessage(e)}` };
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
    // S22.3: a cópia aponta para a sua própria pasta de desenhos (apagar o original não a deixa sem planta).
    const drawings = drawingsOfProjectData(row.data);
    const data = drawings.length === 0 ? row.data : withProjectDrawings(row.data, await copyDrawings(drawings, deps.drawings));
    const copy = await table.insert({ name, data: withProjectName(data, name), owner_id: user.id, owner_email: user.email });
    return { ok: true, id: copy.id, name };
  } catch (e) {
    return failure(e, 'duplicate the project');
  }
}

/**
 * Manda para a lixeira (S32; antes apagava de vez). Some da lista do time e não abre mais; um editor aberto nele vê
 * "Deleted on the server" na próxima gravação e pode salvar como projeto novo. Os desenhos ficam até sair da lixeira.
 */
export async function trashProject(id: string, deps: ProjectsDeps = defaultDeps): Promise<DeleteResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  try {
    if (!(await table.trash(id))) return { ok: false, reason: 'not_found', message: 'This project is already in the trash, or was deleted.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not move the project to the trash: ${errorMessage(e)}` };
  }
}

/** Tira da lixeira (S32): volta à lista com a mesma revisão. */
export async function restoreProject(id: string, deps: ProjectsDeps = defaultDeps): Promise<DeleteResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  try {
    if (!(await table.restore(id))) return { ok: false, reason: 'not_found', message: 'This project is not in the trash any more.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not restore the project: ${errorMessage(e)}` };
  }
}

/**
 * Apaga de vez, da lixeira (S22.2; S32: só da lixeira e só admin — a RLS recusa o resto, e aí nenhuma linha sai).
 * A pasta de desenhos vai junto.
 */
export async function deleteProject(id: string, deps: ProjectsDeps = defaultDeps): Promise<DeleteResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  try {
    const row = await table.get(id, { trashed: true });
    if (row !== undefined && row.deleted_at === null) return { ok: false, reason: 'not_found', message: 'Move the project to the trash first.' };
    const deleted = await table.delete(id);
    if (!deleted) return { ok: false, reason: 'not_found', message: row === undefined ? 'This project was already deleted.' : 'Only a team admin can delete projects for good.' };
    // S22.3: a pasta de desenhos vai junto (best effort: a linha já se foi; sobra vira lixo no bucket, não erro).
    if (row !== undefined) await removeDrawings(drawingsOfProjectData(row.data), deps.drawings);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not delete the project: ${errorMessage(e)}` };
  }
}

/** Os retratos de um projeto (S32), do mais novo para o mais velho: um na criação e um a cada 20 gravações. */
export async function listRevisions(projectId: string, deps: ProjectsDeps = defaultDeps): Promise<RevisionsResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  try {
    const rows = await table.revisions(projectId);
    return { ok: true, revisions: rows.map((r) => ({ revision: r.revision, name: r.name, savedByEmail: r.saved_by_email, createdAt: r.created_at })) };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Could not load the history: ${errorMessage(e)}` };
  }
}

/**
 * Um retrato vira projeto novo (S32), "<nome> (revision N)": restaurar por cima brigaria com quem está com o
 * projeto aberto. O retrato não guarda a leitura da IA nem a planta de fundo (migração 20261104000300): vêm da linha
 * atual. Desenhos copiados para uma pasta nova, como no duplicar.
 */
export async function restoreRevision(input: { id: string; revision: number }, user: SessionUser | undefined, deps: ProjectsDeps = defaultDeps): Promise<DuplicateResult> {
  const table = await deps.table();
  if (table === undefined) return { ok: false, reason: 'unconfigured', message: UNCONFIGURED };
  if (user === undefined) return { ok: false, reason: 'signed_out', message: 'Sign in to restore a version.' };
  try {
    const row = await table.get(input.id);
    const snap = await table.revision(input.id, input.revision);
    if (row === undefined || snap === undefined) return { ok: false, reason: 'not_found', message: 'This version does not exist any more.' };
    const name = revisionCopyName(row.name, input.revision);
    const merged = withCurrentHeavyKeys(snap.data, row.data);
    const drawings = drawingsOfProjectData(merged);
    const data = drawings.length === 0 ? merged : withProjectDrawings(merged, await copyDrawings(drawings, deps.drawings));
    const copy = await table.insert({ name, data: withProjectName(data, name), owner_id: user.id, owner_email: user.email });
    return { ok: true, id: copy.id, name };
  } catch (e) {
    return failure(e, 'restore this version');
  }
}
