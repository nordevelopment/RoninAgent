/**
 * OpenRouterService.ts - Fetches and caches live model list with pricing from OpenRouter API
 * Author: Norayr Petrosyan
 */

export interface OpenRouterModelPricing {
  prompt: string;
  completion: string;
}

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: OpenRouterModelPricing;
  promptPricePerM: number;
  completionPricePerM: number;
  isFree: boolean;
  formattedPrice: string;
}

export class OpenRouterService {
  private cachedModels: OpenRouterModelInfo[] = [];
  private lastFetchTime: number = 0;
  private readonly cacheTtlMs: number = 60 * 60 * 1000; // 1 hour
  // The agent loop asks for context lengths on every step; while OpenRouter is down
  // each call would otherwise wait for the 10s fetch timeout again
  private readonly failureBackoffMs: number = 60 * 1000;
  private lastFailureTime: number = 0;
  private inFlight: Promise<OpenRouterModelInfo[]> | null = null;

  /**
   * Fetch model details from OpenRouter API with caching
   */
  async getModels(): Promise<OpenRouterModelInfo[]> {
    const now = Date.now();
    if (this.cachedModels.length > 0 && (now - this.lastFetchTime) < this.cacheTtlMs) {
      return this.cachedModels;
    }
    if ((now - this.lastFailureTime) < this.failureBackoffMs) {
      return this.cachedModels;
    }
    if (!this.inFlight) {
      this.inFlight = this.fetchModels().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /**
   * Context length of a model, or undefined when OpenRouter does not list it.
   * Routing variants like ":nitro" are not listed separately, so the base id is tried too.
   */
  async getContextLength(modelId: string): Promise<number | undefined> {
    const models = await this.getModels();
    const baseId = modelId.split(':')[0];
    const info = models.find(m => m.id === modelId) ?? models.find(m => m.id === baseId);
    return info && info.context_length > 0 ? info.context_length : undefined;
  }

  private async fetchModels(): Promise<OpenRouterModelInfo[]> {
    const now = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RoninAgent/2.6'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OpenRouter API HTTP ${response.status}`);
      }

      const json = await response.json() as { data?: any[] };
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const models: OpenRouterModelInfo[] = json.data.map(m => {
          const promptPriceNum = parseFloat(m.pricing?.prompt || '0') * 1_000_000;
          const completionPriceNum = parseFloat(m.pricing?.completion || '0') * 1_000_000;
          const isFree = promptPriceNum === 0 && completionPriceNum === 0;

          const formatNum = (num: number) => {
            if (num === 0) return '0';
            return parseFloat(num.toFixed(4)).toString();
          };

          const formattedPrice = isFree
            ? 'FREE'
            : `$${formatNum(promptPriceNum)} / $${formatNum(completionPriceNum)} (1M Tokens)`;

          return {
            id: m.id,
            name: m.name || m.id,
            context_length: m.context_length || 0,
            pricing: {
              prompt: m.pricing?.prompt || '0',
              completion: m.pricing?.completion || '0'
            },
            promptPricePerM: promptPriceNum,
            completionPricePerM: completionPriceNum,
            isFree,
            formattedPrice
          };
        });

        // Sort: Free models first, then popular/cheaper, or alphabetical
        models.sort((a, b) => {
          if (a.isFree && !b.isFree) return -1;
          if (!a.isFree && b.isFree) return 1;
          return a.id.localeCompare(b.id);
        });

        this.cachedModels = models;
        this.lastFetchTime = now;
        return this.cachedModels;
      }
      throw new Error('OpenRouter API returned an empty model list');
    } catch (err) {
      this.lastFailureTime = Date.now();
      console.warn('[OpenRouterService] Failed to fetch live models from OpenRouter:', err instanceof Error ? err.message : String(err));
    }

    return this.cachedModels;
  }
}

export const openRouterService = new OpenRouterService();
