'use client';

import { ArrowLeftIcon, OctagonXIcon, RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Erro de renderização de uma rota (2026-10-23): o Next troca a página por isto e dá um `reset` que tenta
 * renderizar de novo. Mesma linguagem do 404; a mensagem do erro aparece (ferramenta interna atrás de login)
 * e o `digest` identifica o registro no servidor. Um erro no layout raiz não chega aqui: aí vale o
 * `global-error.tsx`, que não existe de propósito — o layout só monta o shell.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="step-enter mx-auto max-w-2xl space-y-8 py-8">
      <header className="space-y-3">
        <p className="eyebrow">Something went wrong</p>
        <h1>This page broke while loading.</h1>
        <p className="max-w-xl text-ink-2">Nothing you did caused it, and nothing was lost on the server. Try again; if it keeps happening, send the message below to whoever runs this server.</p>
      </header>
      <Card className="gap-6 p-6 sm:p-8">
        <Alert variant="destructive">
          <OctagonXIcon />
          <AlertTitle>{error.message === '' ? 'Unknown error' : error.message}</AlertTitle>
          {error.digest === undefined ? null : (
            <AlertDescription>
              Reference: <span className="font-mono">{error.digest}</span>
            </AlertDescription>
          )}
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button variant="accent" onClick={reset}>
            <RotateCcwIcon /> Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/app">
              <ArrowLeftIcon /> Back to the app
            </Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}
