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

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
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

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter your email address.'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
