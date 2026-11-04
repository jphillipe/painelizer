/**
 * Erro do core que o navegador pega (geometria da planta, resolução de abertura no inspetor) → `Notice` com código
 * (S26). `EngineError` traz código, parede, abertura e parâmetros; outro `RangeError` vira `ENGINE_INTERNAL` com a
 * frase original. Puro; roda no cliente e no servidor.
 */

import { EngineError, noticeOf } from 'core';
import { englishMessage } from '@/lib/messages.en';
import type { Notice } from '@/types/panels';

export function noticeOfError(e: unknown): Notice {
  if (e instanceof EngineError) return { source: 'engine', ...noticeOf(e) };
  return { source: 'engine', code: 'ENGINE_INTERNAL', message: e instanceof Error ? e.message : String(e) };
}

/** A frase em inglês do aviso; código desconhecido = "the engine says…" (o original vai para "Details"). */
export function noticeText(n: Notice): string {
  return englishMessage(n) ?? 'The engine rejected this. See Details for the engine message.';
}
