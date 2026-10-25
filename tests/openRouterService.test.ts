import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenRouterService } from '../backend/services/OpenRouterService.js';

function modelsResponse(models: { id: string; context_length: number }[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: models.map(m => ({ ...m, name: m.id, pricing: { prompt: '0.000001', completion: '0.000002' } })) })
  };
}

describe('OpenRouterService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the context length of a model, falling back to the base id of a routing variant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(modelsResponse([{ id: 'vendor/model', context_length: 131_072 }]));
    vi.stubGlobal('fetch', fetchMock);
    const service = new OpenRouterService();

    expect(await service.getContextLength('vendor/model')).toBe(131_072);
    expect(await service.getContextLength('vendor/model:nitro')).toBe(131_072);
    expect(await service.getContextLength('vendor/unknown')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(modelsResponse([{ id: 'vendor/model', context_length: 8_192 }]));
    vi.stubGlobal('fetch', fetchMock);
    const service = new OpenRouterService();

    const results = await Promise.all([service.getModels(), service.getModels(), service.getContextLength('vendor/model')]);
    expect(results[2]).toBe(8_192);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failed fetch until the backoff has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(modelsResponse([{ id: 'vendor/model', context_length: 4_096 }]));
    vi.stubGlobal('fetch', fetchMock);
    const service = new OpenRouterService();

    expect(await service.getContextLength('vendor/model')).toBeUndefined();
    expect(await service.getContextLength('vendor/model')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 61_000);
    expect(await service.getContextLength('vendor/model')).toBe(4_096);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
