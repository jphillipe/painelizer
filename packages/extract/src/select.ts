/**
 * Quais folhas do conjunto vão para a IA quando o humano não diz (S20.3, 2026-10-15). Antes iam só uma planta
 * (A-1xx) e uma folha de schedule (A-8xx) por PDF; as alturas (peitoril, piso a piso, pé-direito) e os dados
 * estruturais ficavam nas elevações, cortes e folhas S-, que a IA nunca via.
 *
 * Regras:
 * - Cada página vira uma categoria pelo título do carimbo (`SheetInfo.title`) e pelo nome do arquivo; sem
 *   título reconhecível, pelo número da folha (A-1xx planta, A-2xx elevação, A-3xx corte, S-1xx estrutura).
 *   A numeração muda de escritório para escritório (schedules em A-6xx no Horace, em A-8xx no Ringgold), por
 *   isso o título vem antes do número.
 * - Ordem de importância: planta do pavimento pedido, schedules e tipos de parede, estrutural (notas gerais e
 *   plantas de estrutura), elevações externas, cortes, plantas ampliadas, plantas dos outros pavimentos.
 * - Fora: capa, código, site, demolição, forro (RCP), cobertura, fundação, detalhes, cozinha, banheiro,
 *   escada, elevador, acabamentos e as disciplinas M/E/P/C/L/G.
 * - Orçamento: no máximo `maxPages` páginas e `maxBytes` de PDF recortado no total; vai entrando por
 *   importância e, no empate, na ordem dos arquivos e das páginas. A ordem final é a dos arquivos e páginas.
 */

import type { SheetInfo } from './pdf';

/** Categorias, da mais importante para a menos. `skip` não vai. */
export type SheetCategory =
  | 'plan'
  | 'schedule'
  | 'structural'
  | 'elevation'
  | 'section'
  | 'enlarged'
  | 'otherPlan'
  | 'skip';

const RANK: Record<Exclude<SheetCategory, 'skip'>, number> = {
  plan: 0,
  schedule: 1,
  structural: 2,
  elevation: 3,
  section: 4,
  enlarged: 5,
  otherPlan: 6,
};

/** Páginas por requisição quando o humano não escolhe (a API aceita 600; o custo cresce com cada folha). */
export const AUTO_PAGE_BUDGET = 40;
/** PDF recortado somado: a requisição tem teto de 32 MB e o base64 incha um terço. */
export const AUTO_BYTE_BUDGET = 22 * 1024 * 1024;

const SCHEDULE = /\bSCHEDULES?\b|PARTITION TYPES?|WALL TYPES?|\bASSEMBLIES\b/;
const SKIP =
  /\bDEMO(LITION)?\b|\bRCPS?\b|REFLECTED|CEILING|LIFE SAFETY|VICINITY|COVER SHEET|\bCOVER\b|CODE (ANALYSIS|REVIEW|SUMMARY|COMPLIANCE)|SITE PLAN|SIGNAGE|FINISH|MOUNTING|ROOF PLAN|FOUNDATION|KITCHEN|BATH|STAIR|RAMP|ELEVATOR|SHAFT|SPECIAL INSPECTION|INTERIOR ELEVATION|INT\. ELEVATION|AIR SEALING|SHEATHING DETAIL|PERSPECTIVE|RENDERING|\b3D\b|AXONOMETRIC|FURNITURE|ELECTRICAL|POWER|LIGHTING|PLUMBING|MECHANICAL|HVAC|FIRE ALARM|SPRINKLER|SECURITY|\bDATA\b|TELECOM|LANDSCAPE|GRADING|UTILITY PLAN/;
const DETAILS_ONLY = /\bDETAILS?\b/;
const PLAN = /\bPLANS?\b/;
const ELEVATION = /\bELEVATIONS?\b/;
const SECTION = /\bSECTIONS?\b/;
const STRUCTURAL = /FRAMING PLAN|SHEAR WALL|GENERAL NOTES|STRUCTURAL NOTES|DESIGN CRITERIA|\bLOADS?\b|HEADER/;
const SKIPPED_DISCIPLINES = /^(M|E|P|FP|C|L|G|ID|T|LS)-/;

/** Ordinais de pavimento no título: "1ST FLOOR", "FIRST FLOOR", "LEVEL 2"… */
function levelsIn(title: string): number[] {
  const out = new Set<number>();
  const words: [RegExp, number][] = [
    [/\b(1ST|FIRST|GROUND)\b/, 1],
    [/\b(2ND|SECOND)\b/, 2],
    [/\b(3RD|THIRD)\b/, 3],
    [/\b(4TH|FOURTH)\b/, 4],
    [/\b(5TH|FIFTH)\b/, 5],
  ];
  for (const [re, n] of words) if (re.test(title)) out.add(n);
  for (const m of title.matchAll(/\bLEVEL (\d)\b/g)) out.add(Number(m[1]));
  return [...out];
}

/**
 * Categoria de uma folha.
 *
 * @param fileName nome do arquivo (o conjunto do Horace vem com uma folha por arquivo, título no nome)
 * @param level    pavimento pedido; planta de outro pavimento vira `otherPlan`
 */
export function classifySheet(info: Pick<SheetInfo, 'sheet' | 'title'>, fileName = '', level?: number): SheetCategory {
  const sheet = info.sheet ?? '';
  const title = `${info.title ?? ''} ${fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')}`.toUpperCase();
  if (SKIPPED_DISCIPLINES.test(sheet)) return 'skip';

  const isStructural = sheet.startsWith('S-');
  if (SCHEDULE.test(title) && !/SIGNAGE|FINISH/.test(title)) return 'schedule';
  if (SKIP.test(title)) return 'skip';
  if (isStructural) {
    if (STRUCTURAL.test(title) || /^S-[01]\d\d/.test(sheet)) return 'structural';
    return 'skip';
  }
  // "Exterior plan details", "wall section details": detalhe, não a planta nem o corte.
  if (DETAILS_ONLY.test(title)) return 'skip';
  if (/ENLARGED/.test(title) && PLAN.test(title)) return 'enlarged';
  if (PLAN.test(title)) return planFor(title, level);
  if (ELEVATION.test(title)) return 'elevation';
  if (SECTION.test(title)) return 'section';

  // Sem título reconhecível: pela numeração mais comum.
  if (/^A-1\d\d/.test(sheet)) return planFor(title, level);
  if (/^A-2\d\d/.test(sheet)) return 'elevation';
  if (/^A-3\d\d/.test(sheet)) return 'section';
  // Schedules: A-6xx pelo padrão AIA, A-8xx em escritórios como o do Ringgold.
  if (/^A-[68]\d\d/.test(sheet)) return 'schedule';
  return 'skip';
}

/** Número da folha no começo do nome do arquivo (`A-101-1ST-FLOOR-PLAN…pdf` → `A-101`), para PDF sem texto. */
export function sheetFromFileName(fileName: string): string | undefined {
  return /^([A-Z]{1,2}-\d{3}[A-Z]?)(?![0-9])/i.exec(fileName)?.[1]?.toUpperCase();
}

function planFor(title: string, level: number | undefined): SheetCategory {
  if (level === undefined) return 'plan';
  const levels = levelsIn(title);
  return levels.length === 0 || levels.includes(level) ? 'plan' : 'otherPlan';
}

export interface Candidate {
  /** Índice do arquivo em `sources`. */
  source: number;
  page: number;
  category: SheetCategory;
  /** Bytes da página recortada sozinha (estimativa do que ela soma à requisição). */
  bytes: number;
  /** Número da folha, para não mandar a mesma folha duas vezes (cópias de outra disciplina, revisões). */
  sheet?: string;
  /** O carimbo trouxe título: entre duas cópias da mesma folha, fica a que tem. */
  titled?: boolean;
}

/**
 * Escolhe as páginas dentro do orçamento. Devolve as escolhidas (ordem de arquivo e página) e as que ficaram
 * de fora por orçamento (para avisar).
 */
export function choosePages(
  candidates: readonly Candidate[],
  budget: { maxPages: number; maxBytes: number } = { maxPages: AUTO_PAGE_BUDGET, maxBytes: AUTO_BYTE_BUDGET },
): { chosen: Candidate[]; dropped: Candidate[] } {
  // Mesma folha em dois arquivos (a planta de segurança reusa "A-101"): fica uma, a com título no carimbo.
  const bySheet = new Map<string, Candidate>();
  for (const c of candidates) {
    if (c.category === 'skip' || c.sheet === undefined) continue;
    const seen = bySheet.get(c.sheet);
    if (seen === undefined || (!seen.titled && c.titled === true)) bySheet.set(c.sheet, c);
  }
  const duplicate = (c: Candidate) => c.sheet !== undefined && bySheet.get(c.sheet) !== c;
  const wanted = candidates
    .filter((c) => c.category !== 'skip' && !duplicate(c))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => RANK[a.c.category as Exclude<SheetCategory, 'skip'>] - RANK[b.c.category as Exclude<SheetCategory, 'skip'>] || a.i - b.i);
  const chosen: Candidate[] = [];
  const dropped: Candidate[] = [];
  let bytes = 0;
  for (const { c } of wanted) {
    if (chosen.length < budget.maxPages && bytes + c.bytes <= budget.maxBytes) {
      chosen.push(c);
      bytes += c.bytes;
    } else {
      dropped.push(c);
    }
  }
  const order = (a: Candidate, b: Candidate) => a.source - b.source || a.page - b.page;
  return { chosen: chosen.sort(order), dropped: dropped.sort(order) };
}
