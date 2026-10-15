import { hasKey } from '@/services/extract.service';
import { illustrationPlan, listExamples } from '@/services/panels.service';
import { NewProjectView } from './_components/new-project-view';

/** Nova obra: Server Component lê exemplos, a disponibilidade da IA e a planta ilustrativa pelos services. */
export default function NewProjectPage() {
  return <NewProjectView examples={listExamples()} aiEnabled={hasKey()} illustration={illustrationPlan()} />;
}
