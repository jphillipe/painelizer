'use client';

import { Loader2Icon, MailPlusIcon, MoreHorizontalIcon, OctagonXIcon, UsersIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NAME_MAX_LENGTH } from '@/schemas/account';
import type { MyTeamResult, PendingInvite, TeamMember } from '@/services/team.service';
import type { TeamRole } from '@/types/database';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { inviteMemberAction } from '../_actions/invite-member';
import { renewInviteAction, revokeInviteAction } from '../_actions/invites';
import { deleteMemberAccountAction, memberResetLinkAction, removeMemberAction, setMemberDisabledAction, setMemberNameAction, setMemberRoleAction } from '../_actions/team-members';
import { LinkDialog } from './link-dialog';

const ROLE_LABEL: Record<TeamRole, string> = { admin: 'Admin', editor: 'Editor' };

type Shown = { title: string; description: ReactNode; url: string };

/** Data curta em inglês dos EUA. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const NO_KEY = 'Needs SUPABASE_SECRET_KEY on the server.';

/** Resposta das actions: `{ ok }` ou `{ ok: false, message }`. */
type Reply = { ok: boolean; message?: string } | undefined;

/**
 * O time (S32; S41): membros com nome, papel e situação; o admin muda papel e nome, gera link de nova senha,
 * desativa/reativa, tira do time e apaga a conta, e convida por link. O que usa a chave secret fica desabilitado sem
 * ela (`accountsEnabled`). A autorização é a RLS e a guarda do service; a tela só esconde o que não pode.
 */
export function TeamCard({ me, team, accountsEnabled }: { me: string; team: MyTeamResult; accountsEnabled: boolean }) {
  const [link, setLink] = useState<Shown | undefined>(undefined);
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
  const { name, role, members, invites } = team.team;
  const admin = role === 'admin';
  return (
    <Card className="gap-5 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Team · {name}</h2>
        <p className="text-sm text-ink-2">
          You are {role === 'admin' ? 'an admin' : 'an editor'}. Everyone in the team opens, edits and trashes the team’s projects; admins also manage people and accounts, and empty the trash.
        </p>
      </div>
      <MembersTable me={me} members={members} admin={admin} accountsEnabled={accountsEnabled} onLink={setLink} />
      {admin ? <InviteForm accountsEnabled={accountsEnabled} onLink={setLink} /> : null}
      {admin && invites.length > 0 ? <PendingInvites invites={invites} accountsEnabled={accountsEnabled} onLink={setLink} /> : null}
      <LinkDialog key={link?.url ?? 'none'} link={link} onClose={() => setLink(undefined)} />
    </Card>
  );
}

function useDone() {
  const router = useRouter();
  return (reply: Reply, success: string, after?: () => void) => {
    after?.();
    if (reply?.ok === true) {
      if (success !== '') toast.success(success);
      router.refresh();
    } else toast.error(reply?.message ?? 'Could not change the team.');
  };
}

type Pending = { kind: 'remove' | 'disable' | 'delete' | 'rename'; member: TeamMember };

function MembersTable({ me, members, admin, accountsEnabled, onLink }: { me: string; members: readonly TeamMember[]; admin: boolean; accountsEnabled: boolean; onLink: (l: Shown) => void }) {
  const done = useDone();
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const idle = () => setBusy(undefined);
  const fail = (message: string | undefined) => {
    idle();
    toast.error(message ?? 'Could not change the team.');
  };
  const setRole = useAction(setMemberRoleAction, { onSuccess: ({ data }) => done(data, 'Role changed.', idle), onError: ({ error }) => fail(error.serverError) });
  const remove = useAction(removeMemberAction, { onSuccess: ({ data }) => done(data, 'Removed from the team.', idle), onError: ({ error }) => fail(error.serverError) });
  const rename = useAction(setMemberNameAction, { onSuccess: ({ data }) => done(data, 'Name changed.', idle), onError: ({ error }) => fail(error.serverError ?? error.validationErrors?.name?._errors?.[0]) });
  const disable = useAction(setMemberDisabledAction, {
    onSuccess: ({ data, input }) => done(data, input.disabled ? 'Account disabled.' : 'Account enabled.', idle),
    onError: ({ error }) => fail(error.serverError),
  });
  const erase = useAction(deleteMemberAccountAction, { onSuccess: ({ data }) => done(data, 'Account deleted.', idle), onError: ({ error }) => fail(error.serverError) });
  const reset = useAction(memberResetLinkAction, {
    onSuccess: ({ data }) => {
      idle();
      if (data?.ok) onLink({ title: `Password reset link for ${data.email}`, description: 'Send it to them. It opens their account to choose a new password and works once, for about an hour.', url: data.url });
      else toast.error(data?.message ?? 'Could not make the link.');
    },
    onError: ({ error }) => fail(error.serverError),
  });

  return (
    <>
      <div className="overflow-hidden rounded-md border border-line">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full pl-4">Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              {admin ? (
                <TableHead className="w-12 pr-3">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const self = m.userId === me;
              const label = m.name ?? m.email;
              return (
                <TableRow key={m.userId} data-member-id={m.userId} className={busy === m.userId ? 'opacity-60' : undefined}>
                  <TableCell className="w-full max-w-0 pl-4">
                    <div className="truncate font-medium" title={label}>
                      {label}
                      {self ? <span className="ml-2 text-[13px] font-normal text-ink-3">(you)</span> : null}
                    </div>
                    {m.name !== undefined ? (
                      <div className="truncate text-[13px] text-ink-3" title={m.email}>
                        {m.email}
                      </div>
                    ) : null}
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
                  <TableCell>{m.disabled ? <Badge variant="destructive">Disabled</Badge> : <span className="text-sm text-ink-2">Active</span>}</TableCell>
                  {admin ? (
                    <TableCell className="pr-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.email}`} disabled={busy === m.userId}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setPending({ kind: 'rename', member: m })}>Edit name…</DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!accountsEnabled || self || m.disabled}
                            title={!accountsEnabled ? NO_KEY : undefined}
                            onSelect={() => {
                              setBusy(m.userId);
                              reset.execute({ userId: m.userId });
                            }}
                          >
                            Password reset link
                          </DropdownMenuItem>
                          {m.disabled ? (
                            <DropdownMenuItem
                              disabled={!accountsEnabled || self}
                              onSelect={() => {
                                setBusy(m.userId);
                                disable.execute({ userId: m.userId, disabled: false });
                              }}
                            >
                              Enable account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled={!accountsEnabled || self} onSelect={() => setPending({ kind: 'disable', member: m })}>
                              Disable account…
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: 'remove', member: m })}>
                            Remove from team…
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" disabled={!accountsEnabled || self} onSelect={() => setPending({ kind: 'delete', member: m })}>
                            Delete account…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {admin && !accountsEnabled ? <p className="text-[13px] text-ink-3">Password links, disabling and deleting accounts need SUPABASE_SECRET_KEY on the server.</p> : null}
      <ConfirmDialog
        open={pending?.kind === 'remove'}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
        title={`Remove ${pending?.member.email ?? ''} from the team?`}
        description={pending?.member.userId === me ? 'You will lose access to the team’s projects right away.' : 'They lose access to the team’s projects. Their account stays; add the email again to bring them back.'}
        confirmLabel="Remove"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (pending === undefined) return;
          setBusy(pending.member.userId);
          remove.execute({ userId: pending.member.userId });
          setPending(undefined);
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'disable'}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
        title={`Disable ${pending?.member.email ?? ''}?`}
        description="They can’t sign in or open the team’s projects until an admin enables the account again. Nothing is deleted."
        confirmLabel="Disable"
        cancelLabel="Keep active"
        destructive
        onConfirm={() => {
          if (pending === undefined) return;
          setBusy(pending.member.userId);
          disable.execute({ userId: pending.member.userId, disabled: true });
          setPending(undefined);
        }}
      />
      <DeleteAccountDialog
        member={pending?.kind === 'delete' ? pending.member : undefined}
        onClose={() => setPending(undefined)}
        onConfirm={(m) => {
          setBusy(m.userId);
          erase.execute({ userId: m.userId });
          setPending(undefined);
        }}
      />
      <RenameDialog
        key={pending?.kind === 'rename' ? pending.member.userId : 'none'}
        member={pending?.kind === 'rename' ? pending.member : undefined}
        onClose={() => setPending(undefined)}
        onSave={(m, name) => {
          setBusy(m.userId);
          rename.execute({ userId: m.userId, name });
          setPending(undefined);
        }}
      />
    </>
  );
}

function RenameDialog({ member, onClose, onSave }: { member: TeamMember | undefined; onClose: () => void; onSave: (m: TeamMember, name: string) => void }) {
  const [name, setName] = useState(member?.name ?? '');
  return (
    <Dialog
      open={member !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (member !== undefined) onSave(member, name);
          }}
        >
          <DialogHeader>
            <DialogTitle>Name of {member?.email}</DialogTitle>
            <DialogDescription>Shown in the team list. Leave it empty to show the email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="member-name">Name</Label>
            <Input id="member-name" value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="submit" variant="accent">
              Save
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ member, onClose, onConfirm }: { member: TeamMember | undefined; onClose: () => void; onConfirm: (m: TeamMember) => void }) {
  const [typed, setTyped] = useState('');
  const matches = member !== undefined && typed.trim().toLowerCase() === member.email.toLowerCase();
  return (
    <Dialog
      open={member !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setTyped('');
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete the account of {member?.email}?</DialogTitle>
          <DialogDescription>This can’t be undone. The account and its sign-in are deleted; the team’s projects stay. To confirm, type the email.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Type the email to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!matches}
            onClick={() => {
              if (member === undefined || !matches) return;
              setTyped('');
              onConfirm(member);
            }}
          >
            Delete account
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTyped('');
              onClose();
            }}
            autoFocus
          >
            Keep
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ accountsEnabled, onLink }: { accountsEnabled: boolean; onLink: (l: Shown) => void }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>('editor');
  const [error, setError] = useState<string | undefined>(undefined);
  const invite = useAction(inviteMemberAction, {
    onSuccess: ({ data }) => {
      if (data === undefined) return setError('Could not invite.');
      if (!data.ok) return setError(data.message);
      setEmail('');
      setName('');
      setError(undefined);
      if (data.status === 'invite_link') {
        onLink({ title: `Invitation for ${data.email}`, description: <>Send this link to them (WhatsApp, text or email). It works once, until {shortDate(data.expiresAt)}. It is shown only now; if it gets lost, make a new one under Pending invitations.</>, url: data.url });
      } else toast.success(data.status === 'added' ? `${data.email} is now in the team.` : `${data.email} was already in the team.`);
      router.refresh();
    },
    onError: ({ error }) => setError(error.serverError ?? error.validationErrors?.email?._errors?.[0] ?? error.validationErrors?.name?._errors?.[0] ?? 'Could not invite.'),
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
        invite.execute({ email, role, ...(name.trim() === '' ? {} : { name }) });
      }}
    >
      <h3 className="font-semibold">Add someone</h3>
      <p className="text-sm text-ink-2">
        {accountsEnabled
          ? 'An existing account joins right away. For a new email you get an invitation link to send them; they choose a password and join.'
          : 'Existing accounts join right away. This server can’t make invitation links (no SUPABASE_SECRET_KEY): create the account in Supabase first.'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" autoComplete="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error !== undefined} />
        </div>
        <div className="min-w-40 flex-1 space-y-2">
          <Label htmlFor="invite-name">Name (optional)</Label>
          <Input id="invite-name" autoComplete="off" maxLength={NAME_MAX_LENGTH} value={name} onChange={(e) => setName(e.target.value)} />
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
          {invite.isPending ? 'Adding…' : accountsEnabled ? 'Add or invite' : 'Add'}
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

function PendingInvites({ invites, accountsEnabled, onLink }: { invites: readonly PendingInvite[]; accountsEnabled: boolean; onLink: (l: Shown) => void }) {
  const done = useDone();
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [revoking, setRevoking] = useState<PendingInvite | undefined>(undefined);
  const renew = useAction(renewInviteAction, {
    onSuccess: ({ data }) => {
      setBusy(undefined);
      if (data?.ok) {
        onLink({ title: `New invitation for ${data.email}`, description: <>The previous link no longer works. Send this one; it works once, until {shortDate(data.expiresAt)}.</>, url: data.url });
        done({ ok: true }, '');
      } else toast.error(data?.message ?? 'Could not make a new link.');
    },
    onError: ({ error }) => {
      setBusy(undefined);
      toast.error(error.serverError ?? 'Could not make a new link.');
    },
  });
  const revoke = useAction(revokeInviteAction, {
    onSuccess: ({ data }) => done(data, 'Invitation withdrawn.', () => setBusy(undefined)),
    onError: ({ error }) => {
      setBusy(undefined);
      toast.error(error.serverError ?? 'Could not withdraw the invitation.');
    },
  });
  return (
    <div className="space-y-3 border-t border-line pt-5">
      <h3 className="font-semibold">Pending invitations</h3>
      <ul className="divide-y divide-line rounded-md border border-line">
        {invites.map((i) => (
          <li key={i.id} data-invite-id={i.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${busy === i.id ? 'opacity-60' : ''}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{i.name === undefined ? i.email : `${i.name} · ${i.email}`}</div>
              <div className="text-[13px] text-ink-3">
                {ROLE_LABEL[i.role]} · {i.expired ? <span className="text-err">expired {shortDate(i.expiresAt)}</span> : `valid until ${shortDate(i.expiresAt)}`}
                {i.invitedBy === undefined ? null : ` · by ${i.invitedBy}`}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!accountsEnabled || busy === i.id}
              title={accountsEnabled ? undefined : NO_KEY}
              onClick={() => {
                setBusy(i.id);
                renew.execute({ id: i.id });
              }}
            >
              New link
            </Button>
            <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => setRevoking(i)} aria-label={`Withdraw the invitation for ${i.email}`}>
              Withdraw
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={revoking !== undefined}
        onOpenChange={(open) => {
          if (!open) setRevoking(undefined);
        }}
        title={`Withdraw the invitation for ${revoking?.email ?? ''}?`}
        description="The link stops working. You can invite the email again later."
        confirmLabel="Withdraw"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (revoking === undefined) return;
          setBusy(revoking.id);
          revoke.execute({ id: revoking.id });
          setRevoking(undefined);
        }}
      />
    </div>
  );
}
