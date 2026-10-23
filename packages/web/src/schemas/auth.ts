import { z } from 'zod';

/** Formulário de login (S22.0), compartilhado cliente/servidor. */
export const signInSchema = z.object({
  email: z.string().trim().email('Enter your email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export type SignInInput = z.infer<typeof signInSchema>;
