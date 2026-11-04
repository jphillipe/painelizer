'use client';

import { ArchiveRestoreIcon, CopyIcon, EllipsisIcon, FolderOpenIcon, HistoryIcon, LayoutPanelTopIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { projectPath } from '@/lib/editor/project-sync';
import { describeUpdated, NAME_MAX, ownerLabel, PROJECTS_HREF, projectsHref } from '@/lib/projects';
import { NEW_PROJECT_HREF } from '@/lib/site-nav';
import { cn } from '@/lib/utils';
import type { ProjectSummary, RevisionSummary } from '@/services/projects.service';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { deleteProjectAction } from '../../_actions/delete-project';
import { duplicateProjectAction } from '../../_actions/duplicate-project';
import { projectHistoryAction, restoreRevisionAction } from '../../_actions/project-history';
import { renameProjectAction } from '../../_actions/rename-project';
import { restoreProjectAction, trashProjectAction } from '../../_actions/trash-project';

/** O que a lista mostra (S32): busca no nome, só os meus, lixeira. */
export interface ProjectsQuery {
  search: string;
  mine: boolean;
  trash: boolean;
}

export interface ProjectsViewProps {
  projects: readonly ProjectSummary[];
  /** `ok` com a lista; `unconfigured` sem Supabase no servidor; `failed` com a mensagem do banco. */
  state: 'ok' | 'unconfigured' | 'failed';
  message?: string;
  /** E-mail de quem está logado: o autor vira "you". */
  me?: string;
  /** Relógio do servidor no render (ms): o cliente hidrata com o mesmo "now" e só depois passa a envelhecer sozinho. */
  now: number;
  /** S32: filtros da URL; ausente = a lista inteira, primeira página. */
  query?: ProjectsQuery;
  /** S32: cursor da página seguinte, quando há. */
  next?: string;
  /** S32: esta não é a primeira página. */
  paged?: boolean;
  /** S32: quem está logado é admin do time (apagar de vez da lixeira). */
  isAdmin?: boolean;
}

const ALL: ProjectsQuery = { search: '', mine: false, trash: false };

/**
 * Lista de projetos (S22.2; S32): os projetos do time, do mais recente para o mais antigo, 50 por página, com busca
 * no nome, "Mine" e a lixeira. O nome abre o editor; o menu `⋯` tem Open, Panels, Rename, Duplicate, History e Move
 * to trash. Na lixeira: Restore e, para admin, Delete forever. Depois de cada ação a lista é relida do servidor
 * (`revalidatePath` na action + `router.refresh()`).
 */
export function ProjectsView({ projects, state, message, me, now: serverNow, query = ALL, next, paged = false, isAdmin = false }: ProjectsViewProps) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<ProjectSummary | undefined>(undefined);
  const [trashing, setTrashing] = useState<ProjectSummary | undefined>(undefined);
  const [purging, setPurging] = useState<ProjectSummary | undefined>(undefined);
  const [history, setHistory] = useState<ProjectSummary | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const nameOf = (id: unknown) => projects.find((p) => p.id === id)?.name ?? 'project';

  /** Resposta de uma ação de linha: toast e releitura, ou o erro. */
  const settle = (ok: boolean | undefined, message: string | undefined, success: string, fallback: string) => {
    setBusyId(undefined);
    if (ok === true) {
      toast.success(success);
      router.refresh();
    } else toast.error(message ?? fallback);
  };
  const failMessage = (data: unknown): string | undefined => (data !== null && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : undefined);

  const duplicate = useAction(duplicateProjectAction, {
    onSuccess: ({ data }) => settle(data?.ok, failMessage(data), data?.ok ? `Duplicated as “${data.name}”.` : '', 'Could not duplicate the project.'),
    onError: ({ error }) => settle(false, error.serverError, '', 'Could not duplicate the project.'),
  });
  const trash = useAction(trashProjectAction, {
    onSuccess: ({ data, input }) => settle(data?.ok, failMessage(data), `Moved “${nameOf(input.id)}” to the trash.`, 'Could not move the project to the trash.'),
    onError: ({ error }) => settle(false, error.serverError, '', 'Could not move the project to the trash.'),
  });
  const restore = useAction(restoreProjectAction, {
    onSuccess: ({ data, input }) => settle(data?.ok, failMessage(data), `Restored “${nameOf(input.id)}”.`, 'Could not restore the project.'),
    onError: ({ error }) => settle(false, error.serverError, '', 'Could not restore the project.'),
  });
  const purge = useAction(deleteProjectAction, {
    onSuccess: ({ data, input }) => settle(data?.ok, failMessage(data), `Deleted “${nameOf(input.id)}” for good.`, 'Could not delete the project.'),
    onError: ({ error }) => settle(false, error.serverError, '', 'Could not delete the project.'),
  });

  // "now" vem do servidor para o HTML e a hidratação dizerem a mesma idade ("2 min ago" ≠ "1 min ago" dava
  // hydration mismatch); depois de montar, envelhece a cada meio minuto, como o chip do editor.
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <section className="step-enter space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="eyebrow">Projects</p>
          <h1>{query.trash ? 'Trash' : 'Saved projects'}</h1>
          <p className="max-w-xl text-ink-2">
            {query.trash
              ? 'Projects moved to the trash. Restore one to bring it back to the list; the trash is emptied after 30 days.'
              : 'Every project the team opens is saved here as it is edited. Open one to review its walls or to generate its panels again.'}
          </p>
        </div>
        <Button asChild variant="accent">
          <Link href={NEW_PROJECT_HREF}>
            <PlusIcon /> New project
          </Link>
        </Button>
      </header>

      {state === 'unconfigured' ? (
        <Alert>
          <AlertTitle>Projects are not saved on this server</AlertTitle>
          <AlertDescription>This server runs without Supabase, so projects live only in each browser. Set the Supabase keys to keep them here for the whole team.</AlertDescription>
        </Alert>
      ) : (
        <>
          <ListToolbar query={query} />
          {state === 'failed' ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load the projects</AlertTitle>
              <AlertDescription>{message ?? 'The server did not answer.'}</AlertDescription>
            </Alert>
          ) : projects.length === 0 ? (
            <EmptyList query={query} paged={paged} />
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-3" aria-live="polite">
                {projects.length}
                {' '}project{projects.length === 1 ? '' : 's'}
                {paged ? ' on this page' : ''} · {query.trash ? 'most recently trashed first' : 'most recently updated first'}
              </p>
              <Card className="gap-0 overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-full pl-4">Name</TableHead>
                      <TableHead className="text-right">Walls</TableHead>
                      <TableHead>{query.trash ? 'Trashed' : 'Updated'}</TableHead>
                      <TableHead className="hidden sm:table-cell">Author</TableHead>
                      <TableHead className="w-12 pr-3">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((p) => {
                      const busy = busyId === p.id;
                      const when = query.trash && p.deletedAt !== null ? p.deletedAt : p.updatedAt;
                      return (
                        <TableRow key={p.id} data-project-id={p.id} className={busy ? 'opacity-60' : undefined}>
                          <TableCell className="w-full max-w-0 pl-4">
                            {query.trash ? (
                              <span className="block truncate font-semibold text-ink-2" title={p.name}>
                                {p.name}
                              </span>
                            ) : (
                              <Link href={projectPath(p.id)} className="block truncate font-semibold text-ink hover:text-navy-700 hover:underline" title={p.name}>
                                {p.name}
                              </Link>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-[13px] tabular-nums">{p.walls}</TableCell>
                          <TableCell className="whitespace-nowrap text-ink-2" title={p.updatedByEmail === null ? when : `${when} · last saved by ${p.updatedByEmail}`}>
                            {describeUpdated(when, now)}
                          </TableCell>
                          <TableCell className="hidden max-w-0 truncate text-ink-2 sm:table-cell" title={p.ownerEmail ?? undefined}>
                            {ownerLabel(p.ownerEmail, me)}
                          </TableCell>
                          <TableCell className="pr-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`} disabled={busy}>
                                  <EllipsisIcon />
                                </Button>
                              </DropdownMenuTrigger>
                              {query.trash ? (
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setBusyId(p.id);
                                      restore.execute({ id: p.id });
                                    }}
                                  >
                                    <ArchiveRestoreIcon /> Restore
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" disabled={!isAdmin} onSelect={() => setPurging(p)}>
                                    <Trash2Icon /> {isAdmin ? 'Delete forever…' : 'Delete forever (admins)'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              ) : (
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => router.push(projectPath(p.id))}>
                                    <FolderOpenIcon /> Open
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => router.push(projectPath(p.id, 3))}>
                                    <LayoutPanelTopIcon /> Panels
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => setRenaming(p)}>
                                    <PencilIcon /> Rename…
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setBusyId(p.id);
                                      duplicate.execute({ id: p.id });
                                    }}
                                  >
                                    <CopyIcon /> Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => setHistory(p)}>
                                    <HistoryIcon /> History…
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => setTrashing(p)}>
                                    <Trash2Icon /> Move to trash…
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              )}
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
              {next !== undefined || paged ? (
                <nav className="flex items-center justify-between gap-3" aria-label="Pages">
                  {paged ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={projectsHref(query)}>Newest</Link>
                    </Button>
                  ) : (
                    <span />
                  )}
                  {next !== undefined ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={projectsHref(query, next)}>Older →</Link>
                    </Button>
                  ) : null}
                </nav>
              ) : null}
            </div>
          )}
        </>
      )}

      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(undefined)}
        onRenamed={(name) => {
          toast.success(`Renamed to “${name}”.`);
          router.refresh();
        }}
      />
      <HistoryDialog project={history} now={now} onClose={() => setHistory(undefined)} onRestored={(id) => router.push(projectPath(id))} />
      <ConfirmDialog
        open={trashing !== undefined}
        onOpenChange={(open) => {
          if (!open) setTrashing(undefined);
        }}
        title={`Move “${trashing?.name ?? ''}” to the trash?`}
        description="It leaves the list for everyone on the team. Anyone can restore it from the trash for 30 days; anyone with it open can still save their changes as a new project."
        confirmLabel="Move to trash"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (trashing === undefined) return;
          setBusyId(trashing.id);
          trash.execute({ id: trashing.id });
          setTrashing(undefined);
        }}
      />
      <ConfirmDialog
        open={purging !== undefined}
        onOpenChange={(open) => {
          if (!open) setPurging(undefined);
        }}
        title={`Delete “${purging?.name ?? ''}” forever?`}
        description="This removes the project, its history and its drawings for everyone. This cannot be undone."
        confirmLabel="Delete forever"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (purging === undefined) return;
          setBusyId(purging.id);
          purge.execute({ id: purging.id });
          setPurging(undefined);
        }}
      />
    </section>
  );
}

/** Busca no nome (Enter manda) e as abas All / Mine / Trash, tudo na URL (link compartilhável, F5 mantém). */
function ListToolbar({ query }: { query: ProjectsQuery }) {
  const router = useRouter();
  const [text, setText] = useState(query.search);
  useEffect(() => setText(query.search), [query.search]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(projectsHref({ ...query, search: text.trim() }));
  };
  const tab = (label: string, target: ProjectsQuery, active: boolean) => (
    <Link
      href={projectsHref(target)}
      aria-current={active ? 'page' : undefined}
      className={cn('rounded-pill px-3 py-1.5 text-sm transition-colors', active ? 'bg-navy-700 text-paper' : 'text-ink-2 hover:bg-line/60 hover:text-ink')}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex items-center gap-1" aria-label="Filter projects">
        {tab('All', { ...query, mine: false, trash: false }, !query.mine && !query.trash)}
        {tab('Mine', { ...query, mine: true, trash: false }, query.mine && !query.trash)}
        {tab('Trash', { ...query, mine: false, trash: true }, query.trash)}
      </nav>
      <form role="search" onSubmit={submit} className="flex min-w-60 flex-1 items-center gap-2 sm:max-w-sm">
        <Label htmlFor="projects-search" className="sr-only">
          Search projects by name
        </Label>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
          <Input id="projects-search" type="search" placeholder="Search by name" className="pl-8" value={text} maxLength={NAME_MAX} onChange={(e) => setText(e.target.value)} />
        </div>
        {query.search !== '' ? (
          <Button asChild variant="ghost" size="icon-sm" aria-label="Clear the search">
            <Link href={projectsHref({ ...query, search: '' })}>
              <XIcon />
            </Link>
          </Button>
        ) : null}
      </form>
    </div>
  );
}

function EmptyList({ query, paged }: { query: ProjectsQuery; paged: boolean }) {
  if (query.trash) {
    return (
      <Card className="items-start gap-3 p-6 sm:p-8">
        <p className="text-lg font-semibold">{query.search === '' ? 'The trash is empty' : `Nothing in the trash matches “${query.search}”`}</p>
        <Button asChild variant="outline">
          <Link href={PROJECTS_HREF}>Back to the projects</Link>
        </Button>
      </Card>
    );
  }
  if (query.search !== '' || query.mine || paged) {
    return (
      <Card className="items-start gap-3 p-6 sm:p-8">
        <p className="text-lg font-semibold">{query.search !== '' ? `No projects match “${query.search}”` : paged ? 'No more projects' : 'You haven’t started a project yet'}</p>
        <Button asChild variant="outline">
          <Link href={PROJECTS_HREF}>Show all projects</Link>
        </Button>
      </Card>
    );
  }
  return (
    <Card className="items-start gap-3 p-6 sm:p-8">
      <p className="text-lg font-semibold">No projects yet</p>
      <p className="max-w-xl text-ink-2">The first project you open — from drawings, a sample or a project file — is saved here the moment it opens in the editor.</p>
      <Button asChild variant="outline">
        <Link href={NEW_PROJECT_HREF}>
          <PlusIcon /> Start a project
        </Link>
      </Button>
    </Card>
  );
}

/**
 * Histórico (S32): os retratos do projeto (na criação e a cada 20 gravações); um vira projeto novo — restaurar por
 * cima brigaria com quem está editando.
 */
function HistoryDialog({ project, now, onClose, onRestored }: { project: ProjectSummary | undefined; now: number; onClose: () => void; onRestored: (id: string) => void }) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const load = useAction(projectHistoryAction, {
    onSuccess: ({ data }) => {
      if (data?.ok) setRevisions(data.revisions);
      else setError(data?.message ?? 'Could not load the history.');
    },
    onError: ({ error }) => setError(error.serverError ?? 'Could not load the history.'),
  });
  const restore = useAction(restoreRevisionAction, {
    onSuccess: ({ data }) => {
      if (data?.ok) {
        toast.success(`Restored as “${data.name}”.`);
        onClose();
        onRestored(data.id);
      } else setError(data?.message ?? 'Could not restore this version.');
    },
    onError: ({ error }) => setError(error.serverError ?? 'Could not restore this version.'),
  });
  const { execute } = load;
  const id = project?.id;
  useEffect(() => {
    setRevisions(undefined);
    setError(undefined);
    if (id !== undefined) execute({ id });
    // Uma carga por projeto aberto no dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <Dialog
      open={project !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>History of “{project?.name ?? ''}”</DialogTitle>
          <DialogDescription>A snapshot is kept when the project is created and every 20 saves (the last 20). Restoring one opens it as a new project; the current one stays as it is.</DialogDescription>
        </DialogHeader>
        {error !== undefined ? (
          <p className="text-[13px] text-err" role="alert">
            {error}
          </p>
        ) : revisions === undefined ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-ink-2">No snapshots yet.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {revisions.map((r) => (
              <li key={r.revision} className="flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 hover:bg-line/40">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">Revision {r.revision}</span>
                  <span className="text-ink-3">
                    {' '}
                    · {describeUpdated(r.createdAt, now)}
                    {r.savedByEmail === null ? '' : ` · ${r.savedByEmail}`}
                  </span>
                </span>
                <Button variant="outline" size="sm" disabled={restore.isPending || project === undefined} onClick={() => project !== undefined && restore.execute({ id: project.id, revision: r.revision })}>
                  Restore as new
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Renomear num dialog: o campo começa com o nome atual; Enter ou "Save" manda; vazio não sai daqui. */
function RenameDialog({ project, onClose, onRenamed }: { project: ProjectSummary | undefined; onClose: () => void; onRenamed: (name: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    setName(project?.name ?? '');
    setError(undefined);
  }, [project]);
  const rename = useAction(renameProjectAction, {
    onSuccess: ({ data }) => {
      if (data?.ok) {
        onClose();
        onRenamed(data.name);
      } else setError(data?.message ?? 'Could not rename the project.');
    },
    onError: ({ error }) => setError(error.serverError ?? error.validationErrors?.name?._errors?.[0] ?? 'Could not rename the project.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (project === undefined) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Give the project a name.');
      return;
    }
    if (trimmed === project.name) {
      onClose();
      return;
    }
    setError(undefined);
    rename.execute({ id: project.id, name: trimmed });
  };
  return (
    <Dialog
      open={project !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>The new name goes into the project file too, so the editor and the fabrication sheets use it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-project-name">Name</Label>
            <Input id="rename-project-name" value={name} maxLength={NAME_MAX} autoFocus onChange={(e) => setName(e.target.value)} aria-invalid={error !== undefined} aria-describedby={error === undefined ? undefined : 'rename-project-error'} />
            {error !== undefined ? (
              <p id="rename-project-error" className="text-[13px] text-err" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" variant="accent" disabled={rename.isPending}>
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
