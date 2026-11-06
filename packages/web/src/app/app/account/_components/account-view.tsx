'use client';

import { KeyRoundIcon, Loader2Icon, SaveIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePasswordSchema, NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/schemas/account';
import type { MyTeamResult } from '@/services/team.service';
import { changePasswordAction } from '../_actions/change-password';
import { setMyNameAction } from '../_actions/profile';
import { TeamCard } from './team-card';

export type AccountViewProps =
  | { state: 'unconfigured' }
  | {
      state: 'ok';
      email: string;
      userId: string;
      team: MyTeamResult;
      /** Há chave secret no servidor: convite por link, link de senha, desativar e apagar contas. */
      accountsEnabled: boolean;
      /** Chegou pelo link do convite antigo (`welcome`) ou do "esqueci a senha"/link do admin (`reset`): escolher a senha. */
      notice?: 'welcome' | 'reset';
    };

/**
 * Conta e time (S32; S41): nome e senha de quem está logado e, abaixo, o time — membros com papel e situação; admins
 * convidam por link, trocam papel e nome, geram link de senha, desativam, tiram e apagam contas. A autorização é a
 * RLS do banco e a guarda do service; a tela só esconde o que a pessoa não pode fazer.
 */
export function AccountView(props: AccountViewProps) {
  const myName = props.state === 'ok' && props.team.ok ? props.team.team?.myName : undefined;
  const inTeam = props.state === 'ok' && props.team.ok && props.team.team !== undefined;
  return (
    <section className="step-enter mx-auto w-full max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Account</p>
        <h1>Account and team</h1>
        {props.state === 'ok' ? <p className="text-ink-2">Signed in as {myName === undefined ? props.email : `${myName} (${props.email})`}.</p> : null}
      </header>
      {props.state === 'unconfigured' ? (
        <Alert>
          <AlertTitle>Accounts are not set up on this server</AlertTitle>
          <AlertDescription>This server runs without Supabase, so there is no sign-in, team or password to manage. Set the Supabase keys (supabase/README.md) to turn them on.</AlertDescription>
        </Alert>
      ) : (
        <>
          {props.notice !== undefined ? (
            <Alert>
              <KeyRoundIcon />
              <AlertTitle>{props.notice === 'welcome' ? 'Welcome to the team' : 'Choose a new password'}</AlertTitle>
              <AlertDescription>{props.notice === 'welcome' ? 'Choose a password below to finish setting up your account. You will use it with your email to sign in.' : 'You opened a password reset link. Choose a new password below; you stay signed in.'}</AlertDescription>
            </Alert>
          ) : null}
          {inTeam ? <NameCard key={myName ?? ''} name={myName} /> : null}
          <PasswordCard />
          <TeamCard me={props.userId} team={props.team} accountsEnabled={props.accountsEnabled} />
        </>
      )}
    </section>
  );
}

function NameCard({ name: initial }: { name: string | undefined }) {
  const router = useRouter();
  const [name, setName] = useState(initial ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const save = useAction(setMyNameAction, {
    onSuccess: ({ data }) => {
      if (data?.ok) {
        setError(undefined);
        toast.success('Name saved.');
        router.refresh();
      } else setError(data?.message ?? 'Could not save the name.');
    },
    onError: ({ error }) => setError(error.serverError ?? error.validationErrors?.name?._errors?.[0] ?? 'Could not save the name.'),
  });
  return (
    <Card className="gap-4 p-6">
      <h2 className="text-lg font-semibold">Your name</h2>
      <form
        className="flex flex-wrap items-end gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.execute({ name });
        }}
      >
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="account-name">Name</Label>
          <Input id="account-name" autoComplete="name" maxLength={NAME_MAX_LENGTH} value={name} onChange={(e) => setName(e.target.value)} aria-describedby="account-name-hint" />
          <p id="account-name-hint" className="text-[13px] text-ink-3">
            Shown to your team instead of the email.
          </p>
        </div>
        <Button type="submit" variant="outline" disabled={save.isPending || name.trim() === (initial ?? '')}>
          {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Save name
        </Button>
        {error !== undefined ? (
          <p className="w-full text-[13px] text-err" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const change = useAction(changePasswordAction, {
    onSuccess: ({ data }) => {
      if (data?.ok) {
        setPassword('');
        setConfirm('');
        setError(undefined);
        toast.success('Password changed.');
      } else setError(data?.message ?? 'Could not change the password.');
    },
    onError: ({ error }) => setError(error.serverError ?? error.validationErrors?.confirm?._errors?.[0] ?? error.validationErrors?.password?._errors?.[0] ?? 'Could not change the password.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the password.');
      return;
    }
    setError(undefined);
    change.execute(parsed.data);
  };
  return (
    <Card className="gap-4 p-6">
      <h2 className="text-lg font-semibold">Password</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="space-y-2">
          <Label htmlFor="account-password">New password</Label>
          <Input id="account-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="account-password-hint" />
          <p id="account-password-hint" className="text-[13px] text-ink-3">
            At least {PASSWORD_MIN_LENGTH} characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-password-confirm">Repeat it</Label>
          <Input id="account-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={error !== undefined} />
        </div>
        {error !== undefined ? (
          <p className="text-[13px] text-err sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" variant="accent" disabled={change.isPending}>
            {change.isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
            {change.isPending ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
