'use client';

import { Loader2Icon, OctagonXIcon, UserPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptInviteSchema, PASSWORD_MIN_LENGTH } from '@/schemas/account';
import type { InvitePreview } from '@/services/team.service';
import { acceptInviteAction } from '../_actions/accept-invite';

const ROLE_TEXT = { admin: 'an admin', editor: 'an editor' } as const;

/** Data do vencimento, curta e em inglês dos EUA (a fábrica). */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Página do convite (S41). Aberto: o time, o e-mail (fixo — é o login) e o papel, e o formulário de nome e senha.
 * Fechado (usado, revogado, vencido, inválido) ou sem servidor de contas: a frase e o caminho para o login.
 */
export function InviteView({ token, preview, signedInAs }: { token: string; preview: InvitePreview; signedInAs?: string }) {
  return (
    <section className="step-enter mx-auto w-full max-w-lg space-y-6 py-8">
      <header className="space-y-3">
        <p className="eyebrow">Invitation</p>
        <h1>{preview.state === 'open' ? `Join ${preview.teamName}` : 'This invitation can’t be used'}</h1>
      </header>
      {preview.state === 'open' ? (
        <AcceptForm token={token} preview={preview} {...(signedInAs === undefined ? {} : { signedInAs })} />
      ) : (
        <>
          <Alert variant={preview.state === 'used' ? 'default' : 'destructive'}>
            <OctagonXIcon />
            <AlertTitle>{preview.state === 'used' ? 'Already used' : preview.state === 'expired' ? 'Expired' : preview.state === 'revoked' ? 'Withdrawn' : 'Not available'}</AlertTitle>
            <AlertDescription>{preview.message}</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </>
      )}
    </section>
  );
}

function AcceptForm({ token, preview, signedInAs }: { token: string; preview: Extract<InvitePreview, { state: 'open' }>; signedInAs?: string }) {
  const router = useRouter();
  const [name, setName] = useState(preview.name ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [created, setCreated] = useState(false);
  const accept = useAction(acceptInviteAction, {
    onSuccess: ({ data }) => {
      if (data === undefined) return setError('Could not accept the invitation.');
      if (!data.ok) return setError(data.message);
      setError(undefined);
      if ('signedIn' in data && data.signedIn) router.push('/app');
      else setCreated(true);
    },
    onError: ({ error }) => setError(error.serverError ?? error.validationErrors?.confirm?._errors?.[0] ?? error.validationErrors?.password?._errors?.[0] ?? 'Could not accept the invitation.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = acceptInviteSchema.safeParse({ token, name, password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setError(undefined);
    accept.execute(parsed.data);
  };
  if (created) {
    return (
      <Alert>
        <UserPlusIcon />
        <AlertTitle>Your account is ready</AlertTitle>
        <AlertDescription>
          Sign in with {preview.email} and the password you chose. <Link href="/login" className="underline">Go to sign in</Link>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Card className="gap-5 p-6">
      <p className="text-sm text-ink-2">
        You were invited to {preview.teamName} as {ROLE_TEXT[preview.role]}. Choose a password to create your account; you will sign in with this email. The invitation is valid until {shortDate(preview.expiresAt)}.
      </p>
      {signedInAs !== undefined ? (
        <p className="text-[13px] text-ink-3" role="note">
          You are signed in as {signedInAs}. Accepting signs you in with the new account instead.
        </p>
      ) : null}
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="invite-accept-email">Email</Label>
          <Input id="invite-accept-email" type="email" value={preview.email} readOnly aria-readonly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-accept-name">Your name</Label>
          <Input id="invite-accept-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="invite-accept-password">Password</Label>
            <Input id="invite-accept-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="invite-accept-password-hint" />
            <p id="invite-accept-password-hint" className="text-[13px] text-ink-3">
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-accept-confirm">Repeat it</Label>
            <Input id="invite-accept-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={error !== undefined} />
          </div>
        </div>
        {error !== undefined ? (
          <p className="text-[13px] text-err" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="accent" disabled={accept.isPending}>
            {accept.isPending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
            {accept.isPending ? 'Creating…' : 'Create my account'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
