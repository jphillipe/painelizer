import { hasKey } from '@/services/extract.service';
import { illustrationPlan, listExamples } from '@/services/panels.service';
import { NewProjectView } from './_components/new-project-view';

/**
 * Nova obra: Server Component lê exemplos, a disponibilidade da IA e a planta ilustrativa pelos services.
 * Exemplos e "Advanced" (M5) só em desenvolvimento ou com `PANELIZER_DEV_TOOLS=1`: são caminhos nossos, não do usuário.
 */
export default function NewProjectPage() {
  const devTools = process.env.NODE_ENV !== 'production' || process.env.PANELIZER_DEV_TOOLS === '1';
  return <NewProjectView examples={devTools ? listExamples() : []} aiEnabled={hasKey()} illustration={illustrationPlan()} devTools={devTools} />;
}
