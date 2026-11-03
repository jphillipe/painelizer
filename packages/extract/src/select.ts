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

/**
 * Ordem de importância. `enlarged` logo depois de `schedule` (2026-10-30): no Horace as portas dos apartamentos
 * só têm cota e regra de posicionamento nas plantas ampliadas (A-401–A-404); o schedule vem antes porque dá
 * os tipos de porta que a ampliada referencia.
 */
const RANK: Record<Exclude<SheetCategory, 'skip'>, number> = {
  plan: 0,
  schedule: 1,
  enlarged: 2,
  structural: 3,
  elevation: 4,
  section: 5,
  otherPlan: 6,
};

/** Categorias que recebem recortes em alta resolução (`tiles.ts`): planta do pavimento e plantas ampliadas. */
export function tiledCategory(c: SheetCategory): 'plan' | 'enlarged' | undefined {
  return c === 'plan' || c === 'enlarged' ? c : undefined;
}

/** Páginas por requisição quando o humano não escolhe (a API aceita 600; o custo cresce com cada folha). */
export const AUTO_PAGE_BUDGET = 40;
/**
 * PDF recortado somado: a requisição tem teto de 32 MB e o base64 incha um terço (19 MiB brutos ≈ 25 MiB
 * codificados), e o que sobra (~6 MiB) é dos recortes em alta resolução das plantas (2026-10-30; antes 22 MiB,
 * que no Horace não deixava lugar para recorte nenhum).
 */
export const AUTO_BYTE_BUDGET = 19 * 1024 * 1024;

const SCHEDULE = /\bSCHEDULES?\b|PARTITION TYPES?|WALL TYPES?|\bASSEMBLIES\b/;
const SKIP =
  /\bDEMO(LITION)?\b|\bRCPS?\b|REFLECTED|CEILING|LIFE SAFETY|\bEGRESS\b|VICINITY|COVER ?SHEET|\bCOVER\b|CODE (ANALYSIS|REVIEW|SUMMARY|COMPLIANCE)|SITE( SAFETY| LOGISTICS)? PLAN|SAFETY PLAN|SIGNAGE|FINISH|MOUNTING|ROOF( LEVEL)? PLAN|FOUNDATION|KITCHEN|BATH|STAIR|RAMP|ELEVATOR|SHAFT|SPECIAL INSPECTION|INTERIOR ELEVATION|INT\. ELEVATION|AIR SEALING|SHEATHING DETAIL|PERSPECTIVE|RENDERING|\b3D\b|AXONOMETRIC|FURNITURE|ELECTRICAL|POWER|LIGHTING|PLUMBING|MECHANICAL|HVAC|FIRE ALARM|SPRINKLER|SECURITY|\bDATA\b|TELECOM|LANDSCAPE|GRADING|UTILITY PLAN/;
const DETAILS_ONLY = /\bDETAILS?\b/;
const PLAN = /\bPLANS?\b/;
const ELEVATION = /\bELEVATIONS?\b/;
const SECTION = /\bSECTIONS?\b/;
const STRUCTURAL = /FRAMING PLAN|SHEAR WALL|GENERAL NOTES|STRUCTURAL NOTES|DESIGN CRITERIA|\bLOADS?\b|HEADER/;
/** Disciplinas que nunca vão (mecânica, elétrica, hidráulica, civil, paisagismo, geral, interiores, telecom, life safety). */
const SKIPPED_DISCIPLINES = new Set(['M', 'E', 'P', 'FP', 'C', 'L', 'G', 'ID', 'T', 'LS']);

/**
 * Disciplina e série do número da folha, em qualquer grafia: `A-101` → A/1, `A201` → A/2, `SA1.1` → SA/1,
 * `S-002` → S/0. A série é o primeiro dígito do número (a centena nos `A-1xx`, o inteiro nos `SA1.x`).
 * O estrutural é toda disciplina que começa com S (S, SA, SE…).
 */
export function sheetParts(sheet: string): { discipline: string; series: string } | undefined {
  const m = /^([A-Z]{1,2})-?(\d)/.exec(sheet.toUpperCase());
  return m === null ? undefined : { discipline: m[1]!, series: m[2]! };
}

/** Ordinais de pavimento no título: "1ST FLOOR", "FIRST FLOOR", "LEVEL 2"; porão e cellar são o nível 0. */
function levelsIn(title: string): number[] {
  const out = new Set<number>();
  const words: [RegExp, number][] = [
    [/\b(BASEMENT|CELLAR|LOWER LEVEL)\b/, 0],
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
  const parts = info.sheet === undefined ? undefined : sheetParts(info.sheet);
  const title = `${info.title ?? ''} ${fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')}`.toUpperCase();
  if (parts !== undefined && SKIPPED_DISCIPLINES.has(parts.discipline)) return 'skip';

  const isStructural = parts?.discipline.startsWith('S') === true;
  if (SCHEDULE.test(title) && !/SIGNAGE|FINISH/.test(title)) return 'schedule';
  if (SKIP.test(title)) return 'skip';
  if (isStructural) {
    // Série 0 (notas gerais, critérios) e 1 (plantas de estrutura) vão mesmo sem título reconhecível.
    if (STRUCTURAL.test(title) || parts?.series === '0' || parts?.series === '1') return 'structural';
    return 'skip';
  }
  // "Exterior plan details", "wall section details": detalhe, não a planta nem o corte.
  if (DETAILS_ONLY.test(title)) return 'skip';
  if (/ENLARGED/.test(title) && PLAN.test(title)) return 'enlarged';
  if (PLAN.test(title)) return planFor(title, level);
  if (ELEVATION.test(title)) return 'elevation';
  if (SECTION.test(title)) return 'section';

  // Sem título reconhecível: pela numeração mais comum (A-1xx plantas, A-2xx elevações, A-3xx cortes).
  if (parts?.discipline === 'A') {
    if (parts.series === '1') return planFor(title, level);
    if (parts.series === '2') return 'elevation';
    if (parts.series === '3') return 'section';
    // Schedules: A-6xx pelo padrão AIA, A-8xx em escritórios como o do Ringgold.
    if (parts.series === '6' || parts.series === '8') return 'schedule';
  }
  return 'skip';
}

/** Número da folha no começo do nome do arquivo (`A-101-1ST-FLOOR-PLAN…pdf` → `A-101`, `A201_plan.pdf` → `A201`), para PDF sem texto. */
export function sheetFromFileName(fileName: string): string | undefined {
  return /^([A-Z]{1,2}-?\d{3}[A-Z]?)(?![0-9])/i.exec(fileName)?.[1]?.toUpperCase();
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
