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

/**
 * Cursor da lista (S32): onde a página anterior parou — a data da chave de ordenação e o id — num texto para a URL
 * (`?before=`). `null` quando o texto não é um cursor (link velho ou editado à mão).
 */
export function encodeCursor(cursor: { at: string; id: string }): string {
  return `${cursor.at}~${cursor.id}`;
}

export function parseCursor(text: string): { at: string; id: string } | null {
  const i = text.lastIndexOf('~');
  if (i <= 0) return null;
  const at = text.slice(0, i);
  const id = text.slice(i + 1);
  if (Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at, id };
}

/** Nome do projeto que sai de um retrato: "<nome> (revision N)", cortado no limite da tabela. */
export function revisionCopyName(name: string, revision: number): string {
  const suffix = ` (revision ${revision})`;
  const base = name.trim() === '' ? 'Untitled project' : name.trim();
  return `${base.slice(0, NAME_MAX - suffix.length)}${suffix}`;
}

/** Chaves que o retrato do histórico não guarda (migração 20261104000300): a leitura da IA e a planta de fundo. */
export const SNAPSHOT_SKIPPED_KEYS = ['$panelizer', '$underlay'] as const;

/** O retrato com a leitura e a planta de fundo da linha atual (o que o retrato deixou de fora volta de lá). */
export function withCurrentHeavyKeys(snapshot: Json, current: Json): Json {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
  const out: { [key: string]: Json | undefined } = { ...snapshot };
  for (const key of SNAPSHOT_SKIPPED_KEYS) delete out[key];
  if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
    for (const key of SNAPSHOT_SKIPPED_KEYS) {
      const value = current[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

/** URL da lista com os filtros (S32): só o que difere do padrão vai na query. */
export function projectsHref(query: { search: string; mine: boolean; trash: boolean }, before?: string): string {
  const params = new URLSearchParams();
  if (query.search !== '') params.set('q', query.search);
  if (query.mine) params.set('mine', '1');
  if (query.trash) params.set('trash', '1');
  if (before !== undefined) params.set('before', before);
  const qs = params.toString();
  return qs === '' ? PROJECTS_HREF : `${PROJECTS_HREF}?${qs}`;
}
