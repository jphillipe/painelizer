import { currentUser } from '@/services/auth.service';
import { listProjects } from '@/services/projects.service';
import { ProjectsView } from './_components/projects-view';

/** Lista de projetos (S22.2): `/app/projects`. Sempre a request: a lista vem do banco e o autor da sessão. */
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const [list, user] = await Promise.all([listProjects(), currentUser()]);
  const me = user?.email;
  const now = Date.now();
  if (list.ok) return <ProjectsView projects={list.projects} state="ok" now={now} {...(me === undefined ? {} : { me })} />;
  return <ProjectsView projects={[]} state={list.reason} message={list.message} now={now} {...(me === undefined ? {} : { me })} />;
}
