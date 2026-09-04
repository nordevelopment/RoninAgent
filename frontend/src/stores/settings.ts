import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ProviderOption {
  id: string;
  name: string;
  url: string;
  defaultModel: string;
}

export interface OpenRouterModelItem {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

export const useSettingsStore = defineStore('settings', () => {
  const isLoading = ref<boolean>(false);
  const isSaving = ref<boolean>(false);
  const saveStatus = ref<{ message: string; type: 'success' | 'error' } | null>(null);

  const aiProvider = ref<string>('openrouter');
  const aiApiUrl = ref<string>('https://openrouter.ai/api/v1');
  const aiApiKey = ref<string>('');
  const hasAiApiKey = ref<boolean>(false);
  const aiDefaultModel = ref<string>('qwen/qwen3.5-flash-02-23');

  const telegramToken = ref<string>('');
  const hasTelegramBotToken = ref<boolean>(false);
  const allowedTelegramUserIds = ref<string>('');

  const appUser = ref<string>('admin');
  const appPassword = ref<string>('');
  const hasAppPassword = ref<boolean>(false);

  const togetherApiKey = ref<string>('');
  const hasTogetherApiKey = ref<boolean>(false);
  const togetherImageModel = ref<string>('black-forest-labs/FLUX.1-schnell-Free');

  const xaiApiKey = ref<string>('');
  const hasXaiApiKey = ref<boolean>(false);

  const providers = ref<ProviderOption[]>([]);
  const openRouterModels = ref<OpenRouterModelItem[]>([]);

  async function fetchSettings() {
    isLoading.value = true;
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        providers.value = data.providers || [];
        aiApiUrl.value = data.aiApiUrl || 'https://openrouter.ai/api/v1';
        aiDefaultModel.value = data.aiDefaultModel || 'qwen/qwen3.5-flash-02-23';
        hasAiApiKey.value = !!data.hasAiApiKey;
        hasTelegramBotToken.value = !!data.hasTelegramBotToken;
        allowedTelegramUserIds.value = data.allowedTelegramUserIds || '';
        appUser.value = data.appUser || 'admin';
        hasAppPassword.value = !!data.hasAppPassword;
        hasTogetherApiKey.value = !!data.hasTogetherApiKey;
        togetherImageModel.value = data.togetherImageModel || 'black-forest-labs/FLUX.1-schnell-Free';
        hasXaiApiKey.value = !!data.hasXaiApiKey;

        // Determine current provider
        syncProviderFromUrl();
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      isLoading.value = false;
    }
  }

  function syncProviderFromUrl() {
    const matched = providers.value.find(
      (p) => p.url.trim().replace(/\/+$/, '') === aiApiUrl.value.trim().replace(/\/+$/, '')
    );
    if (matched) {
      aiProvider.value = matched.id;
    } else {
      aiProvider.value = 'custom';
    }
  }

  async function fetchOpenRouterModels() {
    try {
      const res = await fetch('/api/ai/openrouter-models');
      if (res.ok) {
        const data = await res.json();
        openRouterModels.value = data.models || [];
      }
    } catch (err) {
      console.error('Failed to fetch OpenRouter models:', err);
    }
  }

  async function saveSettings(payload: any) {
    isSaving.value = true;
    saveStatus.value = null;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        saveStatus.value = { message: 'SETTINGS SAVED SUCCESSFULLY', type: 'success' };
        await fetchSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        saveStatus.value = { message: err.message || 'FAILED TO SAVE SETTINGS', type: 'error' };
      }
    } catch (err: any) {
      saveStatus.value = { message: err.message || 'ERROR SAVING SETTINGS', type: 'error' };
    } finally {
      isSaving.value = false;
    }
  }

  return {
    isLoading,
    isSaving,
    saveStatus,
    aiProvider,
    aiApiUrl,
    aiApiKey,
    hasAiApiKey,
    aiDefaultModel,
    telegramToken,
    hasTelegramBotToken,
    allowedTelegramUserIds,
    appUser,
    appPassword,
    hasAppPassword,
    togetherApiKey,
    hasTogetherApiKey,
    togetherImageModel,
    xaiApiKey,
    hasXaiApiKey,
    providers,
    openRouterModels,
    fetchSettings,
    fetchOpenRouterModels,
    saveSettings,
    syncProviderFromUrl,
  };
});
