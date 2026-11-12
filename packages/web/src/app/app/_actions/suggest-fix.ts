'use server';

import { authActionClient } from '@/lib/safe-action';
import { suggestFixSchema } from '@/schemas/suggest';
import { suggestFix as suggest } from '@/services/suggest.service';

/**
 * Editor (S51): "Suggest a fix" — a IA propõe edições para uma causa e o servidor mede o efeito com a checagem do
 * motor. Só devolve a proposta: nada é gravado; a edição entra no projeto com o clique do revisor.
 */
export const suggestFix = authActionClient.inputSchema(suggestFixSchema).action(async ({ parsedInput }) => {
  const { issue, notes, projectText } = parsedInput;
  return suggest({
    projectText,
    notes,
    issue: {
      family: issue.family,
      severity: issue.severity,
      title: issue.title,
      ...(issue.what === undefined ? {} : { what: issue.what }),
      ...(issue.fix === undefined ? {} : { fix: issue.fix }),
      ...(issue.summary === undefined ? {} : { summary: issue.summary }),
      total: issue.total,
      occurrences: issue.occurrences.map((o) => ({
        ...(o.wallId === undefined ? {} : { wallId: o.wallId }),
        ...(o.openingId === undefined ? {} : { openingId: o.openingId }),
        message: o.message,
        ...(o.params === undefined ? {} : { params: o.params }),
      })),
    },
  });
});
