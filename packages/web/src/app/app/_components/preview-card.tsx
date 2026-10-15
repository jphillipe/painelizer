import type { ExtractOutcome } from '@/types/extract';

export interface PreviewCardProps {
  /** Planta de painéis de exemplo (SVG do motor), ilustrativa, antes de haver resultado. */
  illustration: string | undefined;
  outcome: ExtractOutcome | undefined;
}

/** Coluna direita do passo 1: cabeçalho navy, ilustração, o que acontece a seguir; vira status quando há leitura. */
export function PreviewCard({ illustration, outcome }: PreviewCardProps) {
  const read = outcome?.ok ? outcome : undefined;
  return (
    <aside className="overflow-hidden rounded-md border bg-card shadow-1">
      <div className="bg-navy-900 px-6 py-4 text-lg font-semibold text-paper">{read ? 'Walls read from your set' : 'Your walls appear here'}</div>
      {read ? (
        <div className="space-y-3 px-6 py-5">
          <p className="font-display text-5xl text-navy-900">{read.walls.length}</p>
          <p className="eyebrow">walls · {read.openingTypes.length} opening types · level {read.level}</p>
          <p className="text-ink-2">
            {read.pagesSent.length > 0 ? `Read from ${read.pagesSent.map((p) => `${p.name} p.${p.pages.join(',')}`).join(', ')}.` : `Loaded from a recorded response.`}
          </p>
          <p className="text-ink-2">Check each wall below. Nothing is built until you generate.</p>
        </div>
      ) : (
        <>
          {illustration === undefined ? null : (
            <div className="plan border-b border-line-faint bg-paper p-3" aria-hidden dangerouslySetInnerHTML={{ __html: illustration }} />
          )}
          <p className="border-b border-line-faint bg-paper-2 px-6 py-2 text-[12px] text-ink-3">Illustrative panel plan. Your results use your own drawings.</p>
          <div className="space-y-2 px-6 py-5">
            <h2 className="text-navy-900">Read the set. Check every wall.</h2>
            <p className="text-ink-2">
              The AI reads plans and schedules into walls and openings, each with its confidence and the dimension it came from. You confirm.
              Then a deterministic engine frames every panel by the code tables.
            </p>
          </div>
          <div className="grid gap-4 border-t border-line-faint px-6 py-5 sm:grid-cols-3">
            <Feature n="01" title="Walls and openings" text="Axis geometry, section, bearing role, every door and window by its schedule tag." />
            <Feature n="02" title="Your review" text="Low-confidence reads are flagged. Problems the engine finds show before you build." />
            <Feature n="03" title="Fabrication sheets" text="One sheet per panel, panel plan, cut list and bill of materials." />
          </div>
        </>
      )}
      <div className="flex items-center justify-between bg-navy-900 px-6 py-2.5 text-[13px] text-paper/90">
        <span>Deterministic engine</span>
        <span>You review before anything is built</span>
      </div>
    </aside>
  );
}

function Feature({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div>
      <p className="eyebrow">{n}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-2">{text}</p>
    </div>
  );
}
