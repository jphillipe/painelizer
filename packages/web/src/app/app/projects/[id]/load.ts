import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { hasKey } from '@/services/extract.service';
import { listExamples } from '@/services/panels.service';
import { loadProject } from '@/services/projects.service';
import type { NewProjectViewProps } from '../../_components/new-project-view';

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
  const devTools = process.env.NODE_ENV !== 'production' || process.env.PANELIZER_DEV_TOOLS === '1';
  return {
    examples: listExamples(),
    aiEnabled: hasKey(),
    devTools,
    project: { id: loaded.project.id, name: loaded.project.name, revision: loaded.project.revision, text: loaded.project.text, savedAt: loaded.project.updatedAt },
  };
}
