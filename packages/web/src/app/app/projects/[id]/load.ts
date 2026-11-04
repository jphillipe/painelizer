import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { loadProject } from '@/services/projects.service';
import type { NewProjectViewProps } from '../../_components/new-project-view';
import { newProjectViewProps } from '../../_components/view-props';

/**
 * Props da tela para um projeto salvo (S22.1): carrega a linha pelo id; inexistente → 404; servidor sem Supabase →
 * volta ao `/app` (não há projetos salvos ali); erro de banco → erro de servidor (error.tsx).
 */
export async function projectPageProps(id: string): Promise<Omit<NewProjectViewProps, 'initialStep'>> {
  const loaded = await loadProject(id);
  if (!loaded.ok) {
    if (loaded.reason === 'not_found') notFound();
    if (loaded.reason === 'unconfigured') redirect('/app');
    throw new Error(loaded.message);
  }
  return {
    ...newProjectViewProps(),
    project: { id: loaded.project.id, name: loaded.project.name, revision: loaded.project.revision, text: loaded.project.text, savedAt: loaded.project.updatedAt },
  };
}
