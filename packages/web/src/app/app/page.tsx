import { devToolsEnabled } from '@/lib/dev-tools';
import { supabaseEnv } from '@/lib/supabase/env';
import { hasKey } from '@/services/extract.service';
import { listExamples } from '@/services/panels.service';
import { NewProjectView } from './_components/new-project-view';

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
  const devTools = devToolsEnabled();
  // S22.3: a URL e a chave publicável vão por props (o build do Cloud Run não tem variáveis; NEXT_PUBLIC_* não entra no bundle).
  return <NewProjectView examples={listExamples()} aiEnabled={hasKey()} devTools={devTools} storage={supabaseEnv()} />;
}
