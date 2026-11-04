/**
 * Seleção automática nos conjuntos reais de `docs/examples` (fora do git; pulado sem eles). A lista esperada é a
 * da seleção de antes da S25 (gravada em 2026-11-04 com o código da Matilda): a mudança do nome do arquivo (só em
 * PDF de 1 página ou página sem título) e o aviso de duplicata não podem mudar o que vai para a IA.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectPages, type ExtractSource } from '../src/client';

const EXAMPLES = fileURLToPath(new URL('../../../docs/examples/', import.meta.url));
const RINGGOLD_NAME = '26 Ringgold St  Providence RI Rev 5 Stamped (1) (1).pdf';
const RINGGOLD = join(EXAMPLES, RINGGOLD_NAME);
const HORACE = join(EXAMPLES, 'Horace Bid_Drawings-20261007T015547Z-1-001', 'Horace Bid_Drawings', 'Current');

describe.skipIf(!existsSync(RINGGOLD))('Ringgold: mesmas folhas de antes da S25', () => {
  it('9 páginas: plantas, elevações, cortes e schedules', async () => {
    const sel = await selectPages([{ kind: 'pdf', name: RINGGOLD_NAME, data: new Uint8Array(readFileSync(RINGGOLD)) }]);
    const chosen = sel.pages[0]!.map((p) => [p, sel.sheets.get(`0:${p}`)?.sheet, sel.categories.get(`0:${p}`)]);
    expect(chosen).toEqual([
      [3, 'A-100', 'plan'],
      [4, 'A-101', 'plan'],
      [6, 'A-200', 'elevation'],
      [7, 'A-201', 'elevation'],
      [9, 'A-400', 'section'],
      [11, 'A-500', 'section'],
      [12, 'A-501', 'section'],
      [13, 'A-503', 'schedule'],
      [15, 'A-800', 'schedule'],
    ]);
    expect(sel.dropped).toEqual([]);
    expect(sel.duplicates).toEqual([]);
  }, 120_000);
});

describe.skipIf(!existsSync(HORACE))('Horace (Architectural + Structural, 133 PDFs): mesmas folhas de antes da S25', () => {
  it('34 folhas escolhidas, 13 fora do orçamento', async () => {
    const sources: ExtractSource[] = [];
    for (const dir of ['Architectural', 'Structural']) {
      for (const f of readdirSync(join(HORACE, dir)).sort()) {
        if (f.toLowerCase().endsWith('.pdf')) sources.push({ kind: 'pdf', name: f, data: new Uint8Array(readFileSync(join(HORACE, dir, f))) });
      }
    }
    expect(sources).toHaveLength(133);
    const sel = await selectPages(sources);
    const label = (source: number, page: number) => `${sel.sheets.get(`${source}:${page}`)?.sheet}:${sel.categories.get(`${source}:${page}`)}`;
    const chosen = sel.pages.flatMap((pages, i) => (pages ?? []).map((p) => label(i, p)));
    expect(chosen).toEqual([
      'A-101:plan', 'A-102:plan', 'A-103:plan', 'A-104:plan', 'A-106:plan', 'A-107:plan', 'A-108:plan',
      'A-201:elevation', 'A-202:elevation', 'A-204:elevation', 'A-211:elevation',
      'A-401:enlarged', 'A-402:enlarged', 'A-403:enlarged', 'A-404:enlarged',
      'A-601:schedule', 'A-602:schedule', 'A-603:schedule', 'A-604:schedule', 'A-605A:schedule', 'A-606:schedule', 'A-607:schedule', 'A-610:schedule',
      'S-002:structural', 'S-003:structural', 'S-101:structural', 'S-103:structural', 'S-104:structural', 'S-105:structural',
      'S-106:structural', 'S-107:structural', 'S-108:structural', 'S-109:structural', 'S-310:structural',
    ]);
    expect(sel.dropped.map((d) => `${d.sheet}:${d.category}`)).toEqual([
      'A-203:elevation', 'A-212:elevation', 'A-213:elevation', 'A-301:section', 'A-302:section', 'A-303:section',
      'A-311:section', 'A-312:section', 'A-313:section', 'A-314:section', 'A-315:section', 'A-316:section', 'A-425:elevation',
    ]);
  }, 180_000);
});
