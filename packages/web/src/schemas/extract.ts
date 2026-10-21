import { z } from 'zod';
import type { ProjectData } from '@/types/extract';

/** Dados do projeto que os desenhos não trazem (altura, estrutural). Aplicáveis antes ou depois da leitura. */
export const projectDataSchema = z.object({
  /** Altura da parede quando o conjunto não tem cortes; texto em pés-pol, validado pelo parser do CLI. */
  wallHeight: z.string().trim().max(32, 'Use feet and inches, e.g. 9\'-1 1/8"'),
  /** Topo do RO e peitoril quando o projeto não dá (a leitura vence). */
  headerHeight: z.string().trim().max(32, 'Use feet and inches, e.g. 6\'-10 1/2"'),
  sillHeight: z.string().trim().max(32, 'Use feet and inches, e.g. 2\'-0"'),
  floors: z.string().trim().regex(/^$|^\d+$/, 'Whole number of floors above, e.g. 2'),
  floorSpan: z.enum(['', 'center', 'clear']),
  snow: z.string().trim().regex(/^$|^\d+(\.\d+)?$/, 'Snow load in psf, e.g. 30'),
  width: z.string().trim().max(32, 'Use feet and inches, e.g. 29\''),
  wind: z.string().trim().regex(/^$|^\d+$/, 'Wind speed in mph, e.g. 130'),
  exposure: z.enum(['', 'B', 'C', 'D']),
});

/** Campos do formulário de upload (a lista de arquivos vai no FormData; aqui só o que é texto). */
export const uploadFieldsSchema = projectDataSchema.extend({
  /** '' = identificar pelos desenhos. */
  level: z.string().trim().regex(/^$|^[1-9]\d*$/, 'Level must be a whole number'),
  projectName: z.string().trim().max(120, 'Keep the name under 120 characters'),
  pages: z.string().trim().regex(/^$|^\d+(\s*,\s*\d+)*$/, 'Use page numbers separated by commas, e.g. 3,15'),
  notes: z.string().trim().max(2000, 'Keep notes under 2000 characters'),
});

export type UploadFields = z.infer<typeof uploadFieldsSchema>;

/** Opções de conversão do extract a partir dos dados do projeto; campo vazio não entra. */
export function toConvertOptions(d: ProjectData): {
  wallHeight?: string;
  headerHeight?: string;
  sillHeight?: string;
  floorsSupported?: number;
  floorSpan?: 'center' | 'clear';
  building?: { groundSnowLoad?: number; buildingWidth?: string; windSpeed?: number; exposure?: 'B' | 'C' | 'D' };
} {
  const building = {
    ...(d.snow === '' ? {} : { groundSnowLoad: Number(d.snow) }),
    ...(d.width === '' ? {} : { buildingWidth: d.width }),
    ...(d.wind === '' ? {} : { windSpeed: Number(d.wind) }),
    ...(d.exposure === '' ? {} : { exposure: d.exposure }),
  };
  return {
    ...(d.wallHeight === '' ? {} : { wallHeight: d.wallHeight }),
    ...(d.headerHeight === '' ? {} : { headerHeight: d.headerHeight }),
    ...(d.sillHeight === '' ? {} : { sillHeight: d.sillHeight }),
    ...(d.floors === '' ? {} : { floorsSupported: Number(d.floors) }),
    ...(d.floorSpan === '' ? {} : { floorSpan: d.floorSpan }),
    ...(Object.keys(building).length === 0 ? {} : { building }),
  };
}

export function pickProjectData(f: UploadFields): ProjectData {
  return { wallHeight: f.wallHeight, headerHeight: f.headerHeight, sillHeight: f.sillHeight, floors: f.floors, floorSpan: f.floorSpan, snow: f.snow, width: f.width, wind: f.wind, exposure: f.exposure };
}

/** Reaplicar dados do projeto à leitura já feita (sem nova chamada à IA). */
export const applyProjectDataSchema = z.object({
  output: z.unknown(),
  meta: z.object({ model: z.string(), pagesSent: z.array(z.object({ name: z.string(), pages: z.array(z.number()) })) }),
  data: projectDataSchema,
});

export function parsePages(s: string): number[] | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  return t.split(',').map((p) => Number(p.trim()));
}

/** Páginas por arquivo (M7), como JSON no FormData: `{ "A-100.pdf": [3, 15] }`. Lixo vira vazio. */
export const pagesByFileSchema = z.record(z.string(), z.array(z.number().int().positive()));

export function parsePagesByFile(s: string): Record<string, number[]> {
  if (s.trim() === '') return {};
  try {
    const r = pagesByFileSchema.safeParse(JSON.parse(s));
    return r.success ? r.data : {};
  } catch {
    return {};
  }
}

/** Consultas ao job de extração (M7). */
export const jobIdSchema = z.object({ jobId: z.string().min(8).max(64) });

/** Resposta gravada do modelo, como texto JSON (Advanced). */
export const finishResponseSchema = z.object({
  responseJson: z.string().min(2, 'Paste or open the recorded response JSON.'),
});
