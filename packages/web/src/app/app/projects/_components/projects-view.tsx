'use client';

import { CopyIcon, EllipsisIcon, FolderOpenIcon, LayoutPanelTopIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { describeUpdated, NAME_MAX, ownerLabel } from '@/lib/projects';
import { NEW_PROJECT_HREF } from '@/lib/site-nav';
import type { ProjectSummary } from '@/services/projects.service';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { deleteProjectAction } from '../../_actions/delete-project';
import { duplicateProjectAction } from '../../_actions/duplicate-project';
import { renameProjectAction } from '../../_actions/rename-project';

export interface ProjectsViewProps {
  projects: readonly ProjectSummary[];
  /** `ok` com a lista; `unconfigured` sem Supabase no servidor; `failed` com a mensagem do banco. */
  state: 'ok' | 'unconfigured' | 'failed';
  message?: string;
  /** E-mail de quem está logado: o autor vira "you". */
  me?: string;
  /** Relógio do servidor no render (ms): o cliente hidrata com o mesmo "now" e só depois passa a envelhecer sozinho. */
  now: number;
}

/**
 * Lista de projetos (S22.2): tudo o que o time abriu, do mais recente para o mais antigo, com paredes, última
 * gravação e autor. O nome abre o editor; o menu `⋯` tem Open, Panels, Rename, Duplicate e Delete (com
 * confirmação). Renomear e duplicar passam pelo service, que também troca o nome dentro do arquivo; depois de
 * cada ação a lista é relida do servidor (`revalidatePath` na action + `router.refresh()`).
 */
export function ProjectsView({ projects, state, message, me, now: serverNow }: ProjectsViewProps) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<ProjectSummary | undefined>(undefined);
  const [deleting, setDeleting] = useState<ProjectSummary | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);

  const duplicate = useAction(duplicateProjectAction, {
    onSuccess: ({ data }) => {
      setBusyId(undefined);
      if (data?.ok) {
        toast.success(`Duplicated as “${data.name}”.`);
        router.refresh();
      } else toast.error(data?.message ?? 'Could not duplicate the project.');
    },
    onError: ({ error }) => {
      setBusyId(undefined);
      toast.error(error.serverError ?? 'Could not duplicate the project.');
    },
  });
  const remove = useAction(deleteProjectAction, {
    onSuccess: ({ data, input }) => {
      setBusyId(undefined);
      if (data?.ok) {
        const name = projects.find((p) => p.id === input.id)?.name ?? 'project';
        toast.success(`Deleted “${name}”.`);
        router.refresh();
      } else toast.error(data?.message ?? 'Could not delete the project.');
    },
    onError: ({ error }) => {
      setBusyId(undefined);
      toast.error(error.serverError ?? 'Could not delete the project.');
    },
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
          <h1>Saved projects</h1>
          <p className="max-w-xl text-ink-2">Every project the team opens is saved here as it is edited. Open one to review its walls or to generate its panels again.</p>
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
      ) : state === 'failed' ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the projects</AlertTitle>
          <AlertDescription>{message ?? 'The server did not answer.'}</AlertDescription>
        </Alert>
      ) : projects.length === 0 ? (
        <Card className="items-start gap-3 p-6 sm:p-8">
          <p className="text-lg font-semibold">No projects yet</p>
          <p className="max-w-xl text-ink-2">The first project you open — from drawings, a sample or a project file — is saved here the moment it opens in the editor.</p>
          <Button asChild variant="outline">
            <Link href={NEW_PROJECT_HREF}>
              <PlusIcon /> Start a project
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-3" aria-live="polite">
            {projects.length} project{projects.length === 1 ? '' : 's'} · most recently updated first
          </p>
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full pl-4">Name</TableHead>
                  <TableHead className="text-right">Walls</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="hidden sm:table-cell">Author</TableHead>
                  <TableHead className="w-12 pr-3">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => {
                  const busy = busyId === p.id;
                  return (
                    <TableRow key={p.id} data-project-id={p.id} className={busy ? 'opacity-60' : undefined}>
                      <TableCell className="w-full max-w-0 pl-4">
                        <Link href={projectPath(p.id)} className="block truncate font-semibold text-ink hover:text-navy-700 hover:underline" title={p.name}>
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] tabular-nums">{p.walls}</TableCell>
                      <TableCell className="whitespace-nowrap text-ink-2" title={p.updatedAt}>
                        {describeUpdated(p.updatedAt, now)}
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
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                              <Trash2Icon /> Delete…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(undefined)}
        onRenamed={(name) => {
          toast.success(`Renamed to “${name}”.`);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="This removes the project for everyone on the team. Anyone with it open keeps their copy in their browser until they reload. This cannot be undone."
        confirmLabel="Delete project"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (deleting === undefined) return;
          setBusyId(deleting.id);
          remove.execute({ id: deleting.id });
          setDeleting(undefined);
        }}
      />
    </section>
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
