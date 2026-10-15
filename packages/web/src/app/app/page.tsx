import { NewProjectView } from './_components/new-project-view';
import { hasKey } from '@/services/extract.service';
import { listExamples } from '@/services/panels.service';

/** Tela principal: Server Component lê exemplos e a disponibilidade da IA pelos services. */
export default function ViewerPage() {
  return <NewProjectView examples={listExamples()} aiEnabled={hasKey()} />;
}
