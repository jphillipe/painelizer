import { OctagonXIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { noticeText } from '@/lib/notices';
import type { Notice } from '@/types/panels';

/**
 * Erros do parser ou do motor: o projeto não gera nada até serem resolvidos. A frase é a do código (inglês); a
 * mensagem original do motor fica em "Details".
 */
export function Problems({ problems }: { problems: readonly Notice[] }) {
  return (
    <Alert variant="destructive">
      <OctagonXIcon />
      <AlertTitle>The project can’t be built ({problems.length})</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px]">
          {problems.map((p, n) => (
            <li key={`${n}-${p.code}`}>{noticeText(p)}</li>
          ))}
        </ul>
        <details className="mt-2 text-[12px]">
          <summary className="cursor-pointer select-none">Details</summary>
          <ul className="mt-1 space-y-1 font-mono">
            {problems.map((p, n) => (
              <li key={`${n}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        </details>
      </AlertDescription>
    </Alert>
  );
}
