import { NewProjectView } from '../../_components/new-project-view';
import { projectPageProps } from './load';

/** Passo 02 de um projeto salvo (S22.1): `/app/projects/<id>`. Sempre a request: o projeto vem do banco. */
export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const props = await projectPageProps(id);
  return <NewProjectView {...props} initialStep={2} />;
}
