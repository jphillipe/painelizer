import { OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Erros do parser ou do motor: o projeto não gera nada até serem resolvidos. */
export function Problems({ problems }: { problems: readonly string[] }) {
  return (
    <Alert variant="destructive">
      <OctagonXIcon />
      <AlertTitle>The project can’t be built ({problems.length})</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc space-y-1 pl-4 font-mono text-[13px]">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Avisos do motor: os painéis saíram, mas o revisor precisa ver. */
export function Warnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>
        {warnings.length} warning{warnings.length === 1 ? '' : 's'}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc space-y-1 pl-4 font-mono text-[13px]">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
