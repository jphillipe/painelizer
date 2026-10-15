import { redirect } from 'next/navigation';

/** `/` fica reservado para a landing (docs/10-design.md §5); por ora leva ao app. */
export default function Home() {
  redirect('/app');
}
