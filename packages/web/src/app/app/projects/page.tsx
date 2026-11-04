import { currentUser } from '@/services/auth.service';
import { listProjects } from '@/services/projects.service';
import { myRole } from '@/services/team.service';
import { ProjectsView, type ProjectsQuery } from './_components/projects-view';

/** Lista de projetos (S22.2): `/app/projects`. Sempre a request: a lista vem do banco e o autor da sessão. */
export const dynamic = 'force-dynamic';

type Params = { q?: string | string[]; mine?: string | string[]; trash?: string | string[]; before?: string | string[] };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** S32: `?q=` busca no nome, `?mine=1` só os meus, `?trash=1` a lixeira, `?before=` a página seguinte. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query: ProjectsQuery = { search: one(params.q)?.trim() ?? '', mine: one(params.mine) === '1', trash: one(params.trash) === '1' };
  const before = one(params.before);
  const user = await currentUser();
  const [list, role] = await Promise.all([listProjects({ ...query, before }, user), myRole(user)]);
  const me = user?.email;
  const common = { query, paged: before !== undefined && before !== '', now: Date.now(), isAdmin: role === 'admin', ...(me === undefined ? {} : { me }) };
  if (list.ok) return <ProjectsView {...common} projects={list.projects} state="ok" {...(list.next === undefined ? {} : { next: list.next })} />;
  return <ProjectsView {...common} projects={[]} state={list.reason === 'unconfigured' ? 'unconfigured' : 'failed'} message={list.message} />;
}
