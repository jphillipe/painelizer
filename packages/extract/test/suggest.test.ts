import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { askForFix, FixSuggestion, SuggestError, SUGGEST_FIELDS, SUGGEST_MODEL } from '../src/suggest';

const good: FixSuggestion = {
  explanation: 'The door rough opening is 1" taller than the header base.',
  confidence: 'medium',
  needsFromHuman: '',
  edits: [{ target: 'openingType', wallId: '', openingId: '', tag: 'A', field: 'roughHeight', value: '81.5' }],
};

/** Cliente falso: só `beta.messages.parse`, que é o que `askForFix` usa. Nenhum teste chama a API. */
function fakeClient(response: Record<string, unknown> | Error) {
  const parse = vi.fn(async (_params: unknown, _options?: unknown) => {
    if (response instanceof Error) throw response;
    return {
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      stop_details: null,
      usage: { input_tokens: 1200, output_tokens: 150 },
      parsed_output: good,
      ...response,
    };
  });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

describe('askForFix (S51): a chamada da sugestão de resolução', () => {
  it('manda o prompt com o modelo, saída estruturada e fallback do servidor; devolve a sugestão validada, o modelo e os tokens', async () => {
    const { client, parse } = fakeClient({});
    const out = await askForFix({ system: 'SYSTEM', user: 'USER' }, { client });
    expect(out).toEqual({
      suggestion: good,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1200, outputTokens: 150 },
    });
    const [params] = parse.mock.calls[0]! as unknown as [Record<string, unknown>];
    expect(params).toMatchObject({
      model: SUGGEST_MODEL,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: 'USER' }],
    });
    expect(SUGGEST_MODEL).toBe('claude-opus-5-5');
    expect(params['system']).toEqual([{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }]);
    const config = params['output_config'] as { effort: string; format: { type: string } };
    expect(config.effort).toBe('medium');
    expect(config.format.type).toBe('json_schema');
  });

  it('recusa do modelo, teto de tokens e resposta sem saída válida viram SuggestError com código', async () => {
    const ask = (response: Record<string, unknown>) =>
      askForFix({ system: 's', user: 'u' }, { client: fakeClient(response).client });
    await expect(ask({ stop_reason: 'refusal', parsed_output: null })).rejects.toMatchObject({
      name: 'SuggestError',
      code: 'MODEL_REFUSED',
    });
    await expect(ask({ stop_reason: 'max_tokens', parsed_output: null })).rejects.toMatchObject({ code: 'MAX_TOKENS' });
    await expect(ask({ parsed_output: null })).rejects.toMatchObject({ code: 'RESPONSE_INVALID' });
    await expect(ask({ parsed_output: { ...good, confidence: 'certain' } })).rejects.toMatchObject({
      code: 'RESPONSE_INVALID',
    });
  });

  it('erro da API (sem chave, 429, rede) vira SuggestError API_ERROR com o status, sem vazar a chave', async () => {
    const apiError = new Anthropic.APIError(
      429,
      { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
      'slow down',
      new Headers(),
    );
    const failing = fakeClient(apiError).client;
    const error = await askForFix({ system: 's', user: 'u' }, { client: failing }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SuggestError);
    expect(error).toMatchObject({ code: 'API_ERROR', status: 429 });
    // erro que não é da API não é engolido
    await expect(
      askForFix({ system: 's', user: 'u' }, { client: fakeClient(new TypeError('boom')).client }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('o schema da resposta é plano (sem campo nulo): todo campo é texto e o vocabulário de campos é fechado', () => {
    expect(FixSuggestion.safeParse(good).success).toBe(true);
    expect(FixSuggestion.safeParse({ ...good, edits: [{ ...good.edits[0], field: 'anything' }] }).success).toBe(false);
    expect(FixSuggestion.safeParse({ ...good, edits: [{ ...good.edits[0], value: 81.5 }] }).success).toBe(false);
    expect(SUGGEST_FIELDS).toContain('headerSection');
    expect(SUGGEST_FIELDS).toContain('roughHeight');
  });
});
