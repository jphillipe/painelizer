import { describe, expect, it } from 'vitest';
import { devToolsEnabled } from './dev-tools';

describe('devToolsEnabled (S23, A9)', () => {
  it('ligado fora de produção ou com PANELIZER_DEV_TOOLS=1; desligado em produção', () => {
    expect(devToolsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(devToolsEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(devToolsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(devToolsEnabled({ NODE_ENV: 'production', PANELIZER_DEV_TOOLS: '1' })).toBe(true);
    expect(devToolsEnabled({ NODE_ENV: 'production', PANELIZER_DEV_TOOLS: 'true' })).toBe(false);
  });
});
