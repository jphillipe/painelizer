'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, LogInIcon, OctagonXIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { signInSchema, type SignInInput } from '@/schemas/auth';
import { signInAction } from '../_actions/sign-in';

/**
 * Formulário de login (S22.0): e-mail e senha pela action; sucesso leva a `next` e recarrega os Server
 * Components (o header passa a mostrar o usuário). Credencial errada aparece no próprio card, com o foco mantido.
 */
export function LoginForm({ next }: { next: string }) {
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

  return (
    <Card className="gap-0 p-6">
      <Form {...form}>
        <form className="space-y-5" onSubmit={form.handleSubmit((v) => execute(v))} noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" autoFocus spellCheck={false} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
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
          <p className="text-sm text-ink-3">No account? Ask the National Lumber team for one — there is no self sign-up.</p>
        </form>
      </Form>
    </Card>
  );
}
