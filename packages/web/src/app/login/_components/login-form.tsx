'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, LogInIcon, OctagonXIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { signInSchema, type SignInInput } from '@/schemas/auth';
import { signInAction } from '../_actions/sign-in';

export interface LoginFormProps {
  next: string;
  /** `dark` (V1B): dentro do card de vidro sobre navy — rótulos em papel, campos translúcidos, foco dourado. */
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * Formulário de login (S22.0): e-mail e senha pela action; sucesso leva a `next` e recarrega os Server
 * Components (o header passa a mostrar o usuário). Credencial errada aparece no próprio card, com o foco mantido.
 * Quem o envolve decide o card (claro ou de vidro); aqui só os campos.
 */
export function LoginForm({ next, tone = 'light', className }: LoginFormProps) {
  const router = useRouter();
  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  const { execute, isPending } = useAction(signInAction, {
    onSuccess: ({ data }) => {
      if (data === undefined) return;
      if (data.ok) {
        router.push(next);
        router.refresh();
      } else {
        form.setError('root', { message: data.message });
        form.setFocus('password');
      }
    },
    onError: ({ error }) => form.setError('root', { message: error.serverError ?? 'Could not sign in.' }),
  });
  const rootError = form.formState.errors.root?.message;
  const dark = tone === 'dark';
  const label = dark ? 'text-paper/90' : undefined;
  const input = dark ? 'border-paper/25 bg-paper/8 text-paper placeholder:text-paper/50 focus-visible:border-gold-300 aria-invalid:border-gold-300' : undefined;

  return (
    <Form {...form}>
      <form className={cn('space-y-5', className)} onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={label}>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" autoFocus spellCheck={false} className={input} {...field} />
              </FormControl>
              <FormMessage className={dark ? 'text-gold-300' : undefined} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={label}>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" className={input} {...field} />
              </FormControl>
              <FormMessage className={dark ? 'text-gold-300' : undefined} />
            </FormItem>
          )}
        />
        {rootError !== undefined ? (
          <Alert variant="destructive">
            <OctagonXIcon />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" variant="accent" className="w-full" disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <LogInIcon />}
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className={cn('text-sm', dark ? 'text-paper/60' : 'text-ink-3')}>No account? Ask the National Lumber team for one — there is no self sign-up.</p>
      </form>
    </Form>
  );
}
