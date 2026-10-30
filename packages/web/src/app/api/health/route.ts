import { healthReport } from '@/lib/health';

/** Sempre a request: o relatório depende do ambiente do processo, não do build. Fica fora do guard de login. */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(healthReport(process.env), { headers: { 'cache-control': 'no-store' } });
}
