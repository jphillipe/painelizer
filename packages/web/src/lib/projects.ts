/**
 * Lista de projetos (S22.2), a parte pura: o que a tela e o service precisam saber de uma linha da tabela sem
 * abrir o projeto — quantas paredes o `.panelizer.json` tem, o nome da cópia, quem é o autor e há quanto tempo
 * foi gravado. Sem DOM, sem Supabase.
 */

import type { Json } from '@/types/json';
import { describeAge } from './editor/persist';
import { PROJECTS_HREF } from './site-nav';

export { PROJECTS_HREF };

/** Limite do nome na tabela (`check (char_length(name) between 1 and 200)`). */
export const NAME_MAX = 200;

/** Nome como a tabela aceita: 1 a 200 caracteres, sem espaços nas pontas; vazio vira "Untitled project". */
export function projectName(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  const base = trimmed === '' ? 'Untitled project' : trimmed;
  return base.length > NAME_MAX ? base.slice(0, NAME_MAX) : base;
}

/** O `name` da raiz do `.panelizer.json`, quando é um texto não vazio: o nome do projeto quando a tela não mandou outro. */
export function nameFromData(data: Json | undefined): string | undefined {
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const name = data['name'];
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
}

/** Paredes do projeto a partir de `data->walls`: uma lista conta, qualquer outra coisa é 0. */
export function wallCountOf(walls: Json | null | undefined): number {
  return Array.isArray(walls) ? walls.length : 0;
}

/**
 * O `.panelizer.json` com outro `name` na raiz: renomear e duplicar trocam o nome da linha E o do arquivo, senão o
 * próximo auto-save do editor (que manda `draft.name`) desfaria o rename. Dado que não é objeto volta como está.
 */
export function withProjectName(data: Json, name: string): Json {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  return { ...data, name };
}

/** Nome da cópia: "Copy of <nome>", cortado no limite da tabela. */
export function copyName(name: string): string {
  const base = `Copy of ${name.trim() === '' ? 'Untitled project' : name.trim()}`;
  return base.length > NAME_MAX ? base.slice(0, NAME_MAX) : base;
}

/** Autor na lista: "you" para quem está logado, o e-mail dos outros, um traço para linhas sem autor. */
export function ownerLabel(ownerEmail: string | null, me: string | undefined): string {
  if (ownerEmail === null || ownerEmail === '') return '—';
  return me !== undefined && ownerEmail.toLowerCase() === me.toLowerCase() ? 'you' : ownerEmail;
}

/** "just now", "3 min ago", "2 days ago"; data inválida vira um traço. */
export function describeUpdated(iso: string, now: number): string {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? '—' : describeAge(at, now);
}
