'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeftIcon, Loader2Icon, LogInIcon, MailIcon, OctagonXIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/schemas/account';
import { signInSchema, type SignInInput } from '@/schemas/auth';
import { requestPasswordResetAction } from '../_actions/request-password-reset';
import { signInAction } from '../_actions/sign-in';

export interface LoginFormProps {
  next: string;
  /** `dark` (V1B): dentro do card de vidro sobre navy — rótulos em papel, campos translúcidos, foco dourado. */
  tone?: 'light' | 'dark';
  className?: string;
  /** S32: aviso vindo da URL (link de e-mail vencido). */
  notice?: string;
}

/**
 * Formulário de login (S22.0): e-mail e senha pela action; sucesso leva a `next` e recarrega os Server
 * Components (o header passa a mostrar o usuário). Credencial errada aparece no próprio card, com o foco mantido.
 * Quem o envolve decide o card (claro ou de vidro); aqui só os campos.
 */
export function LoginForm({ next, tone = 'light', className, notice }: LoginFormProps) {
  const [mode, setMode] = useState<'sign-in' | 'forgot'>('sign-in');
  if (mode === 'forgot') return <ForgotPasswordForm tone={tone} className={className} onBack={() => setMode('sign-in')} />;
  return <SignInForm next={next} tone={tone} className={className} notice={notice} onForgot={() => setMode('forgot')} />;
}

function SignInForm({ next, tone, className, notice, onForgot }: { next: string; tone: 'light' | 'dark'; className: string | undefined; notice: string | undefined; onForgot: () => void }) {
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
        {notice !== undefined && rootError === undefined ? (
          <Alert variant="destructive">
            <OctagonXIcon />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
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
              <div className="flex items-baseline justify-between gap-3">
                <FormLabel className={label}>Password</FormLabel>
                <button type="button" className={cn('text-[13px] underline underline-offset-2', dark ? 'text-paper/70 hover:text-paper' : 'text-ink-3 hover:text-ink')} onClick={onForgot}>
                  Forgot password?
                </button>
              </div>
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

/**
 * "Esqueci a senha" (S32): manda o link por e-mail (`/auth/confirm` → `/app/account`, onde se escolhe a senha nova).
 * A resposta é a mesma com ou sem conta para o e-mail.
 */
function ForgotPasswordForm({ tone, className, onBack }: { tone: 'light' | 'dark'; className: string | undefined; onBack: () => void }) {
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);
  const { execute, isPending } = useAction(requestPasswordResetAction, {
    onSuccess: ({ data, input }) => {
      if (data === undefined) return;
      if (data.ok) setSentTo(input.email.trim());
      else form.setError('root', { message: data.message });
    },
    onError: ({ error }) => form.setError('root', { message: error.serverError ?? 'Could not send the link.' }),
  });
  const rootError = form.formState.errors.root?.message;
  const dark = tone === 'dark';
  const label = dark ? 'text-paper/90' : undefined;
  const input = dark ? 'border-paper/25 bg-paper/8 text-paper placeholder:text-paper/50 focus-visible:border-gold-300 aria-invalid:border-gold-300' : undefined;
  const back = (
    <button type="button" className={cn('inline-flex items-center gap-1 text-sm underline underline-offset-2', dark ? 'text-paper/70 hover:text-paper' : 'text-ink-3 hover:text-ink')} onClick={onBack}>
      <ArrowLeftIcon className="size-4" /> Back to sign in
    </button>
  );
  if (sentTo !== undefined) {
    return (
      <div className={cn('space-y-5', className)} role="status">
        <p className={cn('text-sm', dark ? 'text-paper/85' : 'text-ink-2')}>
          If there is an account for <strong>{sentTo}</strong>, an email with a link to choose a new password is on its way. The link works once and expires in an hour. No email? Ask a team admin for a password reset link.
        </p>
        {back}
      </div>
    );
  }
  return (
    <Form {...form}>
      <form className={cn('space-y-5', className)} onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
        <p className={cn('text-sm', dark ? 'text-paper/75' : 'text-ink-2')}>Enter the email you sign in with. We’ll send a link to choose a new password, or ask a team admin for a reset link.</p>
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
        {rootError !== undefined ? (
          <Alert variant="destructive">
            <OctagonXIcon />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" variant="accent" className="w-full" disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
          {isPending ? 'Sending…' : 'Send the link'}
        </Button>
        {back}
      </form>
    </Form>
  );
}
