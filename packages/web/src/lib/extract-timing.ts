/**
 * Tempo de espera da extração com IA: as durações das últimas leituras ficam no `localStorage` deste navegador
 * (conveniência por usuário, não dado do projeto). Sem histórico, vale a medida da primeira extração real
 * (Opus 5.5, effort high, planta + schedule: ~12 min em 2026-10-15).
 */

export const DEFAULT_EXTRACT_MS = 12 * 60_000;
export const DURATIONS_KEY = 'panelizer.extract-durations';
/** Quantas leituras entram na média. */
export const KEEP_DURATIONS = 10;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

function browserStore(): KeyValueStore | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Durações gravadas (ms), da mais antiga à mais nova; lixo e storage bloqueado viram lista vazia. */
export function readDurations(store: KeyValueStore | undefined = browserStore()): number[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(DURATIONS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0) : [];
  } catch {
    return [];
  }
}

/** Guarda uma leitura bem-sucedida, mantendo só as `KEEP_DURATIONS` mais novas. */
export function recordDuration(ms: number, store: KeyValueStore | undefined = browserStore()): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  try {
    store?.setItem(DURATIONS_KEY, JSON.stringify([...readDurations(store), Math.round(ms)].slice(-KEEP_DURATIONS)));
  } catch {
    // storage cheio ou bloqueado: a média volta ao default, nada quebra
  }
}

/** Espera esperada: média do histórico, ou o default. `samples` = quantas leituras sustentam o número. */
export function expectedWait(durations: readonly number[]): { ms: number; samples: number } {
  if (durations.length === 0) return { ms: DEFAULT_EXTRACT_MS, samples: 0 };
  return { ms: durations.reduce((a, b) => a + b, 0) / durations.length, samples: durations.length };
}

/** Relógio corrido: `0:07`, `12:05`, `1:02:03`. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Minutos arredondados para o texto: `under 1 min`, `12 min`. */
export function formatMinutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? 'under 1 min' : `${m} min`;
}

/** Fração da barra: anda com o tempo até 95% da média e para ali; nunca chega a 100% antes da resposta. */
export function waitFraction(elapsedMs: number, expectedMs: number): number {
  if (expectedMs <= 0) return 0.95;
  return Math.min(0.95, Math.max(0, elapsedMs / expectedMs) * 0.95);
}
