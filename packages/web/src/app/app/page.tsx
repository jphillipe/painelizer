import { NewProjectView } from './_components/new-project-view';
import { newProjectViewProps } from './_components/view-props';

/**
 * Sempre a request. A página depende do ambiente do processo (`hasKey`, usuário do header), não do build: na
 * imagem do Cloud Run o build roda sem `.env.local` nem variáveis, e sem isto o Next a pré-renderizava estática,
 * com "AI reading is off" e sem usuário gravados no HTML. `/api/health` tem a mesma marca.
 */
export const dynamic = 'force-dynamic';

/**
 * Nova obra: Server Component lê exemplos e a disponibilidade da IA pelos services.
 * Os exemplos aparecem sempre (quem testa precisa deles); "Advanced" (M5) só em desenvolvimento ou com `PANELIZER_DEV_TOOLS=1`.
 */
export default function NewProjectPage() {
  return <NewProjectView {...newProjectViewProps()} />;
}
