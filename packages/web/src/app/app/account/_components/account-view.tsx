'use client';

import { KeyRoundIcon, Loader2Icon, MailPlusIcon, OctagonXIcon, UserMinusIcon, UsersIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { changePasswordSchema, PASSWORD_MIN_LENGTH } from '@/schemas/account';
import type { MyTeamResult, TeamMember } from '@/services/team.service';
import type { TeamRole } from '@/types/database';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { changePasswordAction } from '../_actions/change-password';
import { inviteMemberAction } from '../_actions/invite-member';
import { removeMemberAction, setMemberRoleAction } from '../_actions/team-members';

export type AccountViewProps =
  | { state: 'unconfigured' }
  | {
      state: 'ok';
      email: string;
      userId: string;
      team: MyTeamResult;
      /** Há chave secret no servidor: e-mail sem conta recebe convite. */
      invitesEnabled: boolean;
      /** Chegou pelo link do convite (`welcome`) ou do "esqueci a senha" (`reset`): escolher a senha. */
      notice?: 'welcome' | 'reset';
    };

const ROLE_LABEL: Record<TeamRole, string> = { admin: 'Admin', editor: 'Editor' };

/**
 * Conta e time (S32): senha de quem está logado e, abaixo, o time — membros com papel; admins convidam, trocam
 * papel e tiram pessoas. A autorização é a RLS do banco; a tela só esconde o que a pessoa não pode fazer.
 */
export function AccountView(props: AccountViewProps) {
  return (
    <section className="step-enter mx-auto w-full max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Account</p>
        <h1>Account and team</h1>
        {props.state === 'ok' ? <p className="text-ink-2">Signed in as {props.email}.</p> : null}
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
              <AlertDescription>{props.notice === 'welcome' ? 'Choose a password below to finish setting up your account. You will use it with your email to sign in.' : 'You opened the reset link. Choose a new password below; you stay signed in.'}</AlertDescription>
            </Alert>
          ) : null}
          <PasswordCard />
          <TeamCard me={props.userId} team={props.team} invitesEnabled={props.invitesEnabled} />
        </>
      )}
    </section>
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

function TeamCard({ me, team, invitesEnabled }: { me: string; team: MyTeamResult; invitesEnabled: boolean }) {
  if (!team.ok) {
    return (
      <Alert variant={team.reason === 'missing' ? 'default' : 'destructive'}>
        <OctagonXIcon />
        <AlertTitle>Team</AlertTitle>
        <AlertDescription>{team.message}</AlertDescription>
      </Alert>
    );
  }
  if (team.team === undefined) {
    return (
      <Alert>
        <UsersIcon />
        <AlertTitle>You are not in a team yet</AlertTitle>
        <AlertDescription>Projects belong to a team. Ask a team admin to add your email ({'Account › Team'}); until then you can’t open or save projects.</AlertDescription>
      </Alert>
    );
  }
  const { name, role, members } = team.team;
  const admin = role === 'admin';
  return (
    <Card className="gap-5 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Team · {name}</h2>
        <p className="text-sm text-ink-2">
          You are {role === 'admin' ? 'an admin' : 'an editor'}. Everyone in the team opens, edits and trashes the team’s projects; admins also manage people and empty the trash.
        </p>
      </div>
      <MembersTable me={me} members={members} admin={admin} />
      {admin ? <InviteForm invitesEnabled={invitesEnabled} /> : null}
    </Card>
  );
}

function MembersTable({ me, members, admin }: { me: string; members: readonly TeamMember[]; admin: boolean }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<TeamMember | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const done = (ok: boolean | undefined, message: string | undefined, success: string) => {
    setBusy(undefined);
    if (ok === true) {
      toast.success(success);
      router.refresh();
    } else toast.error(message ?? 'Could not change the team.');
  };
  const setRole = useAction(setMemberRoleAction, {
    onSuccess: ({ data }) => done(data?.ok, data?.ok === false ? data.message : undefined, 'Role changed.'),
    onError: ({ error }) => done(false, error.serverError, ''),
  });
  const remove = useAction(removeMemberAction, {
    onSuccess: ({ data }) => done(data?.ok, data?.ok === false ? data.message : undefined, 'Removed from the team.'),
    onError: ({ error }) => done(false, error.serverError, ''),
  });
  return (
    <>
      <div className="overflow-hidden rounded-md border border-line">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full pl-4">Email</TableHead>
              <TableHead>Role</TableHead>
              {admin ? (
                <TableHead className="w-12 pr-3">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId} data-member-id={m.userId} className={busy === m.userId ? 'opacity-60' : undefined}>
                <TableCell className="w-full max-w-0 truncate pl-4" title={m.email}>
                  {m.email}
                  {m.userId === me ? <span className="ml-2 text-[13px] text-ink-3">(you)</span> : null}
                </TableCell>
                <TableCell>
                  {admin ? (
                    <select
                      aria-label={`Role of ${m.email}`}
                      className="rounded-sm border border-line bg-paper px-2 py-1 text-sm"
                      value={m.role}
                      disabled={busy === m.userId}
                      onChange={(e) => {
                        setBusy(m.userId);
                        setRole.execute({ userId: m.userId, role: e.target.value as TeamRole });
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                    </select>
                  ) : (
                    ROLE_LABEL[m.role]
                  )}
                </TableCell>
                {admin ? (
                  <TableCell className="pr-3 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.email} from the team`} disabled={busy === m.userId} onClick={() => setRemoving(m)}>
                      <UserMinusIcon />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title={`Remove ${removing?.email ?? ''} from the team?`}
        description={removing?.userId === me ? 'You will lose access to the team’s projects right away.' : 'They lose access to the team’s projects. Their account stays in Supabase; add the email again to bring them back.'}
        confirmLabel="Remove"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (removing === undefined) return;
          setBusy(removing.userId);
          remove.execute({ userId: removing.userId });
          setRemoving(undefined);
        }}
      />
    </>
  );
}

function InviteForm({ invitesEnabled }: { invitesEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('editor');
  const [error, setError] = useState<string | undefined>(undefined);
  const invite = useAction(inviteMemberAction, {
    onSuccess: ({ data }) => {
      if (data?.ok) {
        setEmail('');
        setError(undefined);
        toast.success(data.status === 'invited' ? `Invitation sent to ${data.email}.` : data.status === 'added' ? `${data.email} is now in the team.` : `${data.email} was already in the team.`);
        router.refresh();
      } else setError(data?.message ?? 'Could not invite.');
    },
    onError: ({ error }) => setError(error.serverError ?? error.validationErrors?.email?._errors?.[0] ?? 'Could not invite.'),
  });
  return (
    <form
      className="space-y-3 border-t border-line pt-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim() === '') {
          setError('Enter an email address.');
          return;
        }
        invite.execute({ email, role });
      }}
    >
      <h3 className="font-semibold">Add someone</h3>
      <p className="text-sm text-ink-2">
        {invitesEnabled
          ? 'An existing account joins right away; a new email gets an invitation to choose a password.'
          : 'Existing accounts join right away. This server can’t send invitations (no SUPABASE_SECRET_KEY): create the account in Supabase first.'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" autoComplete="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error !== undefined} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" className="h-9 rounded-sm border border-line bg-paper px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" variant="accent" disabled={invite.isPending}>
          {invite.isPending ? <Loader2Icon className="animate-spin" /> : <MailPlusIcon />}
          {invite.isPending ? 'Adding…' : invitesEnabled ? 'Add or invite' : 'Add'}
        </Button>
      </div>
      {error !== undefined ? (
        <p className="text-[13px] text-err" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
