import { hasOriginal, issueMessage, type Issue } from '@/lib/editor/problems';
import { cn } from '@/lib/utils';

/**
 * Frase de uma issue (S26): a do código, em inglês; a mensagem original do motor/da leitura só dentro de
 * "Details", quando difere.
 */
export function IssueText({ issue, className }: { issue: Issue; className?: string }) {
  return (
    <>
      <span className={cn('block', className)}>{issueMessage(issue)}</span>
      {hasOriginal(issue) ? <OriginalText text={issue.text} /> : null}
    </>
  );
}

/** A mensagem original (português, do motor ou da leitura), recolhida em "Details". */
export function OriginalText({ text }: { text: string }) {
  return (
    <details className="mt-0.5 text-[11px] text-ink-3">
      <summary className="cursor-pointer select-none">Details</summary>
      <span className="block font-mono">{text}</span>
    </details>
  );
}
