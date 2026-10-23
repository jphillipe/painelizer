import { ArrowLeftIcon, LogInIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * 404 do app (2026-10-23): mesma linguagem do passo 01 (eyebrow + h1 + parágrafo) e o símbolo de uma parede
 * com um vão sem header — "nada foi emoldurado aqui". Server Component, dentro do shell; o Next o usa para
 * qualquer rota desconhecida e para `notFound()`.
 */
export default function NotFound() {
  return (
    <section className="step-enter mx-auto max-w-2xl space-y-8 py-8">
      <header className="space-y-3">
        <p className="eyebrow">404 · Not found</p>
        <h1>Nothing was framed here.</h1>
        <p className="max-w-xl text-ink-2">The address may be wrong, or the page moved. Every project starts from the drawings, so that is the best place to go back to.</p>
      </header>
      <Card className="gap-6 p-6 sm:p-8">
        <svg viewBox="0 0 400 100" role="img" aria-label="A wall frame with an empty opening" className="h-auto w-full max-w-sm text-navy-900">
          <rect x="0" y="94" width="400" height="6" fill="currentColor" />
          <rect x="0" y="0" width="400" height="6" fill="currentColor" />
          {[0, 48, 96, 144, 256, 304, 352, 394].map((x) => (
            <rect key={x} x={x} y="6" width="6" height="88" fill="currentColor" fillOpacity={0.8} />
          ))}
          <rect x="150" y="6" width="6" height="88" fill="currentColor" />
          <rect x="250" y="6" width="6" height="88" fill="currentColor" />
          <rect x="156" y="12" width="94" height="4" fill="none" stroke="#BA8B37" strokeWidth="2" strokeDasharray="5 4" />
          <text x="203" y="60" textAnchor="middle" className="fill-ink-3 font-mono text-[14px]">
            no header
          </text>
        </svg>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="accent">
            <Link href="/app">
              <ArrowLeftIcon /> Back to the app
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">
              <LogInIcon /> Sign in
            </Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}
