import { z } from 'zod';

/** S32: formulários da conta e do time (`/app/account`) e o "esqueci a senha" do `/login`, compartilhados cliente/servidor. */

/** Mínimo do app; o painel do Supabase pode exigir mais (o erro dele volta na tela). Igual a `PASSWORD_MIN` do auth.service. */
export const PASSWORD_MIN_LENGTH = 8;

export const changePasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`).max(72, 'At most 72 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords don’t match.' });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const teamRoleSchema = z.enum(['admin', 'editor']);

/** Nome de exibição (S41); o service colapsa espaços e limita a 80. */
export const NAME_MAX_LENGTH = 80;
const nameField = z.string().max(NAME_MAX_LENGTH, `At most ${NAME_MAX_LENGTH} characters.`);

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  name: nameField.optional(),
  role: teamRoleSchema,
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const memberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: teamRoleSchema,
});

export const memberSchema = z.object({
  userId: z.string().uuid(),
});

/** S41: o admin muda o nome de alguém do time. */
export const memberNameSchema = z.object({
  userId: z.string().uuid(),
  name: nameField,
});

/** S41: o próprio nome. */
export const myNameSchema = z.object({ name: nameField });

/** S41: desativar (true) ou reativar (false). */
export const memberDisabledSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
});

/** S41: um convite pendente. */
export const inviteIdSchema = z.object({ id: z.string().uuid() });

/** S41: quem abre o link do convite escolhe nome e senha. */
export const acceptInviteSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This invitation link is not valid.'),
    name: nameField.optional(),
    password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`).max(72, 'At most 72 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords don’t match.' });

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter your email address.'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
