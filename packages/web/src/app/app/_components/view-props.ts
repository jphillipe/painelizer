import 'server-only';
import { devToolsEnabled } from '@/lib/dev-tools';
import { supabaseEnv } from '@/lib/supabase/env';
import { hasKey } from '@/services/extract.service';
import { listExamples } from '@/services/panels.service';
import type { NewProjectViewProps } from './new-project-view';

/**
 * O que toda rota da nova obra passa à tela, lido no servidor a cada request (S30: era calculado em `/app` e em
 * `/app/projects/[id]`): exemplos, IA ligada, "Advanced" (M5) e a URL/chave publicável do Supabase (S22.3: vão por
 * props, o build do Cloud Run não tem variáveis e `NEXT_PUBLIC_*` não entra no bundle).
 */
export function newProjectViewProps(): Pick<NewProjectViewProps, 'examples' | 'aiEnabled' | 'devTools' | 'storage'> {
  return { examples: listExamples(), aiEnabled: hasKey(), devTools: devToolsEnabled(), storage: supabaseEnv() };
}
