'use client';

import { ArrowLeftIcon, OctagonXIcon, RotateCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ErrorPageProps } from '../error';

/**
 * Erro dentro de `/app` (S23, A9): antes caía no `app/error.tsx` da raiz, que troca a página inteira e oferece
 * "Try again" (re-render sem recarregar). No editor o certo é recarregar: o editor grava a sessão no navegador ao
 * desmontar (`use-saved-session`), o projeto salvo volta com as edições que não chegaram ao servidor, e a leitura
 * em voo volta à espera pelo `jobId`. Por isso a mensagem pode prometer que o trabalho está salvo.
 */
export default function AppErrorPage({ error }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="step-enter mx-auto max-w-2xl space-y-8 py-8">
      <header className="space-y-3">
        <p className="eyebrow">Something went wrong</p>
        <h1>The editor stopped.</h1>
        <p className="max-w-xl text-ink-2">Reload — your work is saved. Your edits are kept in this browser and go back to the server when the project reopens; an AI read in progress keeps running and is picked up again.</p>
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
          <Button variant="accent" onClick={() => window.location.reload()}>
            <RotateCwIcon /> Reload
          </Button>
          <Button asChild variant="ghost">
            <Link href="/app/projects">
              <ArrowLeftIcon /> All projects
            </Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}
