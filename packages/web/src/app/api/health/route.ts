import { healthReport } from '@/lib/health';
import { deepHealth } from '@/services/health.service';

/** Sempre a request: o relatório depende do ambiente do processo, não do build. Fica fora do guard de login. */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * Raso (sem login): o que o processo enxerga — o deploy confere isto. `?deep=1` (S32): com login, consulta o banco e
 * o Storage com a sessão de quem pede; sem login, 401. 503 quando alguma consulta falha.
 */
export async function GET(request: Request): Promise<Response> {
  const report = healthReport(process.env);
  if (new URL(request.url).searchParams.get('deep') !== '1') return Response.json(report, { headers: NO_STORE });
  const deep = await deepHealth();
  if (deep.kind === 'signed_out') return Response.json({ ok: false, error: 'Sign in to run the deep health check.' }, { status: 401, headers: NO_STORE });
  const { kind: _kind, ...body } = deep;
  return Response.json({ ...report, ok: deep.ok, deep: body }, { status: deep.ok ? 200 : 503, headers: NO_STORE });
}
