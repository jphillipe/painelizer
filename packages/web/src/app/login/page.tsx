import { OctagonXIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { safeNext } from '@/lib/auth/routes';
import { currentUser, isAuthConfigured } from '@/services/auth.service';
import { LoginForm } from './_components/login-form';

/**
 * `/login` (S22.0, docs/10-design.md §5): e-mail e senha. Já logado, volta ao app (o proxy também faz isso; aqui é
 * a segunda barreira). Sem Supabase configurado, explica em vez de mostrar um formulário que não funciona.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const to = safeNext(next);
  if (!isAuthConfigured()) return <NotConfigured />;
  if ((await currentUser()) !== undefined) redirect(to);
  return (
    <section className="step-enter mx-auto w-full max-w-sm space-y-6 py-8">
      <header className="space-y-3">
        <p className="eyebrow">Sign in</p>
        <h1>Welcome back.</h1>
        <p className="text-ink-2">Use the account the National Lumber team created for you.</p>
      </header>
      <LoginForm next={to} />
    </section>
  );
}

function NotConfigured() {
  return (
    <section className="mx-auto w-full max-w-lg space-y-6 py-8">
      <header className="space-y-3">
        <p className="eyebrow">Sign in</p>
        <h1>Sign-in isn’t set up.</h1>
      </header>
      <Alert variant="destructive">
        <OctagonXIcon />
        <AlertTitle>This server has no Supabase keys</AlertTitle>
        <AlertDescription>
          Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (see{' '}
          <code className="font-mono">supabase/README.md</code>) and restart. Until then the app only opens in development.
        </AlertDescription>
      </Alert>
    </section>
  );
}
