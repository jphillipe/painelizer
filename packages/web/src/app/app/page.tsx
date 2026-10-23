import { hasKey } from '@/services/extract.service';
import { listExamples } from '@/services/panels.service';
import { NewProjectView } from './_components/new-project-view';

/**
 * Teto de duração das actions desta rota na Vercel (a leitura da IA leva ~10 min; o padrão é 300 s). 300 é o
 * máximo do plano Hobby com Fluid compute; no Pro pode subir a 800. Acima do plano o deploy falha — ver
 * docs/04-decisoes.md (2026-10-23). Fora da Vercel não tem efeito.
 */
export const maxDuration = 300;

/**
 * Nova obra: Server Component lê exemplos e a disponibilidade da IA pelos services.
 * Os exemplos aparecem sempre (quem testa precisa deles); "Advanced" (M5) só em desenvolvimento ou com `PANELIZER_DEV_TOOLS=1`.
 */
export default function NewProjectPage() {
  const devTools = process.env.NODE_ENV !== 'production' || process.env.PANELIZER_DEV_TOOLS === '1';
  return <NewProjectView examples={listExamples()} aiEnabled={hasKey()} devTools={devTools} />;
}
