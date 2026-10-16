import { existsSync, readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { buildRequest, DEFAULT_MODEL, ExtractError, extractWalls, finish, stripFences } from '../src/client';
import { subsetPdf } from '../src/pdf';
import { FULL_SYSTEM_PROMPT } from '../src/prompt';
import { makePdf } from './helpers/makePdf';

const ringgoldOutput = JSON.parse(readFileSync(new URL('./fixtures/ringgold-output.json', import.meta.url), 'utf8')) as unknown;
const RINGGOLD = 'C:/Users/Phillipe/Desktop/painelizer/docs/examples/26 Ringgold St  Providence RI Rev 5 Stamped (1) (1).pdf';

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

/** Cliente sem rede: `messages.stream(...).finalMessage()` devolve a mensagem dada; `create` guarda os parâmetros. */
function fakeClient(message: Anthropic.Message) {
  const client = new Anthropic({ apiKey: 'test-key-never-used' });
  const create = vi.fn((params: unknown) => {
    void params;
    return { finalMessage: async () => message };
  });
  client.messages.stream = create as unknown as typeof client.messages.stream;
  return { client, create };
}

describe('buildRequest', () => {
  it('modelo padrão, system cacheável com o JSON Schema, PDF recortado, sem structured outputs', async () => {
    const pdf = await makePdf();
    const { params, pagesSent } = await buildRequest({ pdf, pages: [1, 2] });
    expect(pagesSent).toEqual([{ name: 'planta.pdf', pages: [1, 2] }]);
    expect(params.model).toBe(DEFAULT_MODEL);
    expect(params.max_tokens).toBe(96000);
    expect(params.system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(params.output_config).toEqual({ effort: 'high' });
    const system = params.system[0]?.text ?? '';
    expect(system).toContain('## Formato da resposta');
    for (const key of ['"projectName"', '"walls"', '"openingTypes"', '"wallTypes"', '"notes"', '"origin"']) expect(system).toContain(key);
    expect(system).toBe(FULL_SYSTEM_PROMPT);
    const content = params.messages[0]?.content;
    expect(Array.isArray(content) && content.length).toBe(4); // document + 2 páginas + instrução
  });

  it('aceita modelo, esforço e max_tokens', async () => {
    const { params } = await buildRequest({ pdf: await makePdf(), pages: [1] }, { model: 'claude-sonnet-5-5', effort: 'max', maxTokens: 8000 });
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config.effort).toBe('max');
    expect(params.max_tokens).toBe(8000);
  });

  it('sem páginas ou sem arquivo é RangeError', async () => {
    await expect(buildRequest({ pdf: await makePdf(), pages: [] })).rejects.toThrow(RangeError);
    await expect(buildRequest({ sources: [] })).rejects.toThrow(RangeError);
    await expect(buildRequest({})).rejects.toThrow(RangeError);
  });

  it('vários arquivos: PDFs e imagens na ordem dada; PDF sem `pages` usa o carimbo', async () => {
    const pdf = await makePdf();
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const { params, pagesSent } = await buildRequest({
      sources: [
        { kind: 'image', name: 'foto.jpg', data: png, mediaType: 'image/jpeg' },
        { kind: 'pdf', name: 'arq.pdf', data: pdf },
        { kind: 'pdf', name: 'detalhe.pdf', data: pdf, pages: [2] },
      ],
    });
    expect(pagesSent).toEqual([
      { name: 'arq.pdf', pages: [1, 2] },
      { name: 'detalhe.pdf', pages: [2] },
    ]);
    const types = (params.messages[0]?.content as { type: string }[]).map((b) => b.type);
    // PDFs primeiro (document + 1 texto por página), depois a imagem (rótulo + image), depois a instrução.
    expect(types).toEqual(['document', 'text', 'text', 'document', 'text', 'text', 'image', 'text']);
  });

  it('PDF sem carimbo reconhecível manda todas as páginas até o limite', async () => {
    const only = await subsetPdf(await makePdf(), [2]); // só A-800: sem planta A-1xx
    const { pagesSent } = await buildRequest({ sources: [{ kind: 'pdf', name: 's.pdf', data: only }] });
    expect(pagesSent).toEqual([{ name: 's.pdf', pages: [1] }]);
  });
});

describe('extractWalls com cliente falso', () => {
  it('devolve saída validada, JSON do CLI, relatório e uso', async () => {
    const { client, create } = fakeClient(fakeMessage({}));
    const result = await extractWalls({ pdf: await makePdf(), pages: [1, 2], convert: { studLength: [92.625, 104.625] } }, { client });
    expect(create).toHaveBeenCalledTimes(1);
    const sent = create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming];
    expect(sent[0].model).toBe(DEFAULT_MODEL);
    expect(result.output.walls.map((w) => w.id)).toEqual(['N1', 'S1', 'S2', 'I1']);
    expect(result.problems).toEqual([]);
    // P30: porta e janela a 8 1/4" na S2 — 1 jack por lado nas duas, com aviso para o revisor
    expect(result.warnings.map((w) => w.slice(0, 40))).toEqual([
      '1-S2-P1 HEADER_JACKS_BELOW_TABLE: parede',
      '1-S2-P1 HEADER_JACKS_BELOW_TABLE: parede',
    ]);
    expect(result.project['name']).toBe('26 Ringgold St');
    expect(result.report).toContain('# Extração — 26 Ringgold St');
    expect(result.model).toBe('claude-opus-5-5');
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 800 });
    expect(result.pagesSent).toEqual([{ name: 'planta.pdf', pages: [1, 2] }]);
  });

  it('recusa vira ExtractError com a explicação', async () => {
    const { client } = fakeClient(
      fakeMessage({
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'general_harms', explanation: 'não posso' },
        content: [],
      }),
    );
    await expect(extractWalls({ pdf: await makePdf(), pages: [1] }, { client })).rejects.toThrow(/recusou a extração: não posso/);
  });

  it('corte por max_tokens vira ExtractError com o texto cru', async () => {
    const { client } = fakeClient(fakeMessage({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"proj', citations: null }] }));
    const err = await extractWalls({ pdf: await makePdf(), pages: [1] }, { client }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as ExtractError).message).toContain('96000 tokens');
    expect((err as ExtractError).rawText).toBe('{"proj');
  });

  it('texto que não é JSON vira ExtractError com o texto cru', async () => {
    const { client } = fakeClient(fakeMessage({ content: [{ type: 'text', text: 'não dá', citations: null }] }));
    const err = await extractWalls({ pdf: await makePdf(), pages: [1] }, { client }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as ExtractError).message).toMatch(/não é JSON/);
    expect((err as ExtractError).rawText).toBe('não dá');
  });

  it('JSON fora do schema vira ExtractError apontando o campo', async () => {
    const { client } = fakeClient(fakeMessage({ content: [{ type: 'text', text: '{"projectName":"x"}', citations: null }] }));
    const err = await extractWalls({ pdf: await makePdf(), pages: [1] }, { client }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as ExtractError).message).toMatch(/fora do schema: level/);
    expect((err as ExtractError).rawText).toBe('{"projectName":"x"}');
  });
});

describe('stripFences', () => {
  it('tira a cerca de código quando o modelo a põe, e não mexe em JSON limpo', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('```\n{"a":1}\n```\n')).toBe('{"a":1}');
    expect(stripFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('resposta com cerca passa pelo cliente falso', async () => {
    const { client } = fakeClient(fakeMessage({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(ringgoldOutput) + '\n```', citations: null }] }));
    const r = await extractWalls({ pdf: await makePdf(), pages: [1] }, { client });
    expect(r.output.walls).toHaveLength(4);
  });
});

describe('finish — respostas gravadas', () => {
  it('mesmo pós-processamento da chamada real', () => {
    const r = finish(ringgoldOutput, undefined, 'gravado', { inputTokens: 0, outputTokens: 0 });
    expect(r.problems).toEqual([]);
    expect(r.warnings).toHaveLength(2);
    expect(r.model).toBe('gravado');
  });
});

describe.skipIf(!process.env['ANTHROPIC_API_KEY'] || !existsSync(RINGGOLD))('extração real (só com ANTHROPIC_API_KEY e o PDF)', () => {
  it('26 Ringgold St: A-100 + A-800 → 4+ paredes sem problemas no CLI', async () => {
    const pdf = new Uint8Array(readFileSync(RINGGOLD));
    const result = await extractWalls({ pdf, pages: [3, 15], hints: { level: 1 } });
    expect(result.output.walls.length).toBeGreaterThanOrEqual(4);
    expect(result.problems.filter((p) => p.startsWith('parser:'))).toEqual([]);
  }, 600_000);
});
