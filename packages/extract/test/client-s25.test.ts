/**
 * S25 (2026-11-04): seleção de folhas com nome de arquivo e duplicatas, fallback sem recortes, fontes casadas por
 * índice, todos os `stop_reason`, uso com cache, proveniência e cancelamento durante a preparação.
 */
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { buildRequest, ExtractError, extractWalls, MAX_RETRIES, previewExtraction, PROMPT_HASH, REQUEST_TIMEOUT_MS, selectPages, usageOf } from '../src/client';
import { DEFAULT_TILE_OPTIONS } from '../src/tiles';
import { noticeText } from '../src/notices';
import { makePdf } from './helpers/makePdf';

const ringgoldOutput = JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')) as unknown;

/** PDF com carimbo sem rótulo: número grande no canto e o título logo acima, na mesma coluna. */
async function stampedPdf(sheets: readonly { sheet: string; title?: string }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const s of sheets) {
    const page = doc.addPage([612, 792]);
    page.drawText(s.sheet, { x: 500, y: 40, size: 24, font });
    if (s.title !== undefined) page.drawText(s.title, { x: 480, y: 80, size: 12, font });
  }
  return doc.save();
}

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return doc.save();
}

function fakeMessage(overrides: Record<string, unknown>): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(ringgoldOutput), citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 800 },
    ...overrides,
  } as unknown as Anthropic.Message;
}

function fakeClient(message: Anthropic.Message) {
  const client = new Anthropic({ apiKey: 'test-key-never-used' });
  const stream = vi.fn((params: unknown, options: unknown) => {
    void params;
    void options;
    return { finalMessage: async () => message, on: () => undefined };
  });
  client.messages.stream = stream as unknown as typeof client.messages.stream;
  return { client, stream };
}

describe('seleção pelo carimbo num PDF multi-folha com nome enganoso (B1)', () => {
  it('"Bath"/"Schedule" no nome não mandam todas as páginas para skip/schedule', async () => {
    const data = await stampedPdf([
      { sheet: 'A-101', title: 'FIRST FLOOR PLAN' },
      { sheet: 'A-201', title: 'EXTERIOR ELEVATIONS' },
      { sheet: 'A-450', title: 'BATHROOM DETAILS' },
      { sheet: 'A-800', title: 'WALL TYPES' },
    ]);
    const sel = await selectPages([{ kind: 'pdf', name: 'Smith-Bath-Remodel-Schedule.pdf', data }]);
    expect(sel.pages[0]).toEqual([1, 2, 4]);
    expect([1, 2, 3, 4].map((p) => sel.categories.get(`0:${p}`))).toEqual(['plan', 'elevation', 'skip', 'schedule']);
  });

  it('PDF de uma página: o nome ainda classifica (conjunto do Horace)', async () => {
    const sel = await selectPages([
      { kind: 'pdf', name: 'A-452-ENLARGED-BATHROOM-PLANS-&-ELEVATIONS-Rev.2.pdf', data: await stampedPdf([{ sheet: 'A-452' }]) },
      { kind: 'pdf', name: 'A-101-1ST-FLOOR-PLAN.pdf', data: await stampedPdf([{ sheet: 'A-101' }]) },
    ]);
    expect(sel.categories.get('0:1')).toBe('skip');
    expect(sel.pages).toEqual([[], [1]]);
  });
});

describe('duplicata descartada vira aviso (B8)', () => {
  it('a cópia sem título sai, com FOLHA_DUPLICADA nos avisos da prévia', async () => {
    const titled = await stampedPdf([{ sheet: 'A-101', title: 'FIRST FLOOR PLAN' }]);
    const copy = await stampedPdf([{ sheet: 'A-101' }]);
    const preview = await previewExtraction({
      sources: [
        { kind: 'pdf', name: 'LS-copy.pdf', data: copy },
        { kind: 'pdf', name: 'arch.pdf', data: titled },
      ],
      tiles: false,
    });
    expect(preview.pagesSent).toEqual([{ name: 'arch.pdf', pages: [1] }]);
    expect(preview.duplicates).toEqual([{ source: 0, name: 'LS-copy.pdf', page: 1, sheet: 'A-101', kept: { source: 1, name: 'arch.pdf', page: 1 } }]);
    expect(preview.warnings.map(noticeText).some((w) => w.startsWith('extraction SHEET_DUPLICATE: 1 sheet cop(ies)') && w.includes('LS-copy.pdf p.1'))).toBe(true);
  });
});

describe('conjunto sem carimbo: as primeiras páginas vão, sem recortes (B8)', () => {
  it('automático não recorta e avisa NO_TITLE_BLOCK; páginas pedidas continuam recortando', async () => {
    const blank = await blankPdf(3);
    const auto = await previewExtraction({ sources: [{ kind: 'pdf', name: 'scan.pdf', data: blank }] });
    expect(auto.pagesSent).toEqual([{ name: 'scan.pdf', pages: [1, 2, 3] }]);
    expect(auto.tiles.count).toBe(0);
    expect(auto.warnings.map(noticeText).some((w) => w.startsWith('extraction NO_TITLE_BLOCK:'))).toBe(true);
    const asked = await previewExtraction({ sources: [{ kind: 'pdf', name: 'scan.pdf', data: blank, pages: [2] }] });
    expect(asked.tiles.count).toBe(1);
    expect(asked.warnings).toEqual([]);
  });
});

describe('fontes casadas por índice, não por nome (B7)', () => {
  it('dois arquivos com o mesmo nome: cada página da prévia aponta a sua fonte', async () => {
    const a = await stampedPdf([{ sheet: 'A-101', title: 'FIRST FLOOR PLAN' }]);
    const b = await stampedPdf([{ sheet: 'A-800', title: 'DOOR SCHEDULE' }]);
    const preview = await previewExtraction({
      sources: [
        { kind: 'pdf', name: 'sheet.pdf', data: a },
        { kind: 'pdf', name: 'sheet.pdf', data: b },
      ],
    });
    expect(preview.sheets).toEqual([
      { source: 0, name: 'sheet.pdf', page: 1, sheet: 'A-101', title: 'FIRST FLOOR PLAN', category: 'plan' },
      { source: 1, name: 'sheet.pdf', page: 1, sheet: 'A-800', title: 'DOOR SCHEDULE', category: 'schedule' },
    ]);
    expect(preview.tiles.pages).toEqual([{ name: 'sheet.pdf', page: 1, tiles: 1, dpi: expect.any(Number) }]);
  });

  it('a prévia mede os caracteres do texto posicionado enviado', async () => {
    const one = await previewExtraction({ pdf: await makePdf(), pages: [1] });
    const two = await previewExtraction({ pdf: await makePdf(), pages: [1, 2] });
    expect(one.textChars).toBeGreaterThan(50);
    expect(two.textChars).toBeGreaterThan(one.textChars);
  });
});

describe('stop_reason: todos tratados (B4)', () => {
  const run = async (overrides: Record<string, unknown>) => {
    const { client } = fakeClient(fakeMessage(overrides));
    return extractWalls({ pdf: await makePdf(), pages: [1], tiles: false }, { client }).catch((e: unknown) => e);
  };

  it('max_tokens no teto: não manda aumentar, manda menos folhas ou effort', async () => {
    const err = await run({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"proj', citations: null }] });
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as Error).message).toContain('128000 output tokens');
    expect((err as Error).message).toContain('already the maximum');
    expect((err as Error).message).toContain('send fewer sheets or lower the effort');
    expect((err as Error).message).not.toMatch(/increase/);
    expect((err as ExtractError).rawText).toBe('{"proj');
  });

  it.each([
    ['model_context_window_exceeded', /context window/],
    ['pause_turn', /pause_turn/],
    ['tool_use', /tool_use/],
    [null, /no stop reason/],
  ])('%s vira ExtractError com mensagem própria (não um JSON.parse genérico)', async (reason, re) => {
    const err = await run({ stop_reason: reason });
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as Error).message).toMatch(re);
  });

  it('stop_sequence segue para o JSON como end_turn', async () => {
    const r = await run({ stop_reason: 'stop_sequence' });
    expect(r).not.toBeInstanceOf(Error);
  });
});

describe('cliente: timeout, maxRetries, uso com cache e proveniência (B5, B6)', () => {
  it('stream recebe timeout e maxRetries explícitos; resultado traz cache e proveniência', async () => {
    const { client, stream } = fakeClient(
      fakeMessage({ usage: { input_tokens: 21_000, output_tokens: 70_000, cache_creation_input_tokens: 6_000, cache_read_input_tokens: 0 } }),
    );
    const r = await extractWalls({ pdf: await makePdf(), pages: [1, 2] }, { client, effort: 'medium' });
    expect(stream.mock.calls[0]?.[1]).toMatchObject({ timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    expect(r.usage).toEqual({ inputTokens: 21_000, outputTokens: 70_000, cacheCreationInputTokens: 6_000, cacheReadInputTokens: 0 });
    expect(r.provenance).toEqual({ promptHash: PROMPT_HASH, model: 'claude-opus-5-5', effort: 'medium', maxTokens: 128000, tiles: DEFAULT_TILE_OPTIONS });
    expect(PROMPT_HASH).toMatch(/^[0-9a-f]{16}$/);
  });

  it('sem recortes a proveniência grava tiles: false', async () => {
    const { provenance } = await buildRequest({ pdf: await makePdf(), pages: [1], tiles: false });
    expect(provenance.tiles).toBe(false);
  });

  it('usageOf omite os campos de cache que a API não trouxe', () => {
    expect(usageOf({ input_tokens: 1, output_tokens: 2 } as Anthropic.Usage)).toEqual({ inputTokens: 1, outputTokens: 2 });
  });
});

describe('signal cancela a preparação (B5)', () => {
  it('abortado antes: a prévia e a leitura param sem chamar a API', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(previewExtraction({ pdf: await makePdf() }, { signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const { client, stream } = fakeClient(fakeMessage({}));
    await expect(extractWalls({ pdf: await makePdf(), pages: [1] }, { client, signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(stream).not.toHaveBeenCalled();
  });

  it('abortado durante a preparação: para antes de chamar a API', async () => {
    const ctl = new AbortController();
    const { client, stream } = fakeClient(fakeMessage({}));
    const p = extractWalls(
      { pdf: await makePdf(), pages: [1, 2] },
      {
        client,
        signal: ctl.signal,
        onProgress: (e) => {
          if (e.phase === 'preparing') ctl.abort();
        },
      },
    );
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(stream).not.toHaveBeenCalled();
  });
});
