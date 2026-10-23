import { LoginSkeleton } from './_components/login-skeleton';

/**
 * `/login` espera o Supabase dizer se já há sessão antes de decidir entre o palco e o redirect; enquanto isso
 * o esqueleto já abre no modo `stage`, para não piscar papel antes do navy.
 */
export default function Loading() {
  return <LoginSkeleton />;
}
