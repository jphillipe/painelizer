import { hasKey } from '@/services/extract.service';

/**
 * Teto de duração das actions desta rota na Vercel (a leitura da IA leva ~10 min; o padrão é 300 s). 300 é o
 * máximo do plano Hobby com Fluid compute; no Pro pode subir a 800. Acima do plano o deploy falha — ver
 * docs/04-decisoes.md (2026-10-23). Fora da Vercel não tem efeito.
 */
export const maxDuration = 300;
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
