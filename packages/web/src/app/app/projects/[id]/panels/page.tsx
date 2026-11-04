import { NewProjectView } from '../../../_components/new-project-view';
import { projectPageProps } from '../load';

/** Passo 03 de um projeto salvo (S22.1): `/app/projects/<id>/panels` — a tela gera os painéis ao abrir. */
export const dynamic = 'force-dynamic';

export default async function ProjectPanelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const props = await projectPageProps(id);
  return <NewProjectView {...props} initialStep={3} />;
}
