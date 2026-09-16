<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '../stores/settings';

const router = useRouter();
const settingsStore = useSettingsStore();

const providerSelect = ref('openrouter');
const apiUrl = ref('');
const apiKey = ref('');
const defaultModel = ref('');
const selectedModelFromList = ref('');

const telegramToken = ref('');
const allowedTelegramUserIds = ref('');

const appUser = ref('admin');
const appPassword = ref('');

const togetherApiKey = ref('');
const togetherImageModel = ref('');

const xaiApiKey = ref('');

interface ProviderDraft {
  apiUrl: string;
  apiKey: string;
  defaultModel: string;
}

const providerDrafts = ref<Record<string, ProviderDraft>>({});
const previousProvider = ref<string>('openrouter');

onMounted(async () => {
  await settingsStore.fetchSettings();
  syncFromStore();
  settingsStore.fetchOpenRouterModels();
});

function syncFromStore() {
  const currentP = settingsStore.aiProvider || 'openrouter';
  providerSelect.value = currentP;
  previousProvider.value = currentP;

  apiUrl.value = settingsStore.aiApiUrl || 'https://openrouter.ai/api/v1/chat/completions';
  defaultModel.value = settingsStore.aiDefaultModel || 'qwen/qwen3.5-flash-02-23';
  selectedModelFromList.value = defaultModel.value;
  apiKey.value = '';

  providerDrafts.value[currentP] = {
    apiUrl: apiUrl.value,
    apiKey: apiKey.value,
    defaultModel: defaultModel.value,
  };

  if (currentP !== 'custom' && !providerDrafts.value['custom']) {
    providerDrafts.value['custom'] = {
      apiUrl: '',
      apiKey: '',
      defaultModel: '',
    };
  }

  telegramToken.value = '';
  allowedTelegramUserIds.value = settingsStore.allowedTelegramUserIds;
  appUser.value = settingsStore.appUser;
  appPassword.value = '';
  togetherApiKey.value = '';
  togetherImageModel.value = settingsStore.togetherImageModel;
  xaiApiKey.value = '';
}

const selectedProvider = computed(() => {
  return settingsStore.providers.find((p) => p.id === providerSelect.value);
});

const availablePopularModels = computed(() => {
  if (providerSelect.value === 'openrouter') {
    return settingsStore.openRouterModels.map((m) => ({ id: m.id, name: m.name || m.id }));
  }
  const p = selectedProvider.value;
  if (p && p.popularModels && p.popularModels.length > 0) {
    return p.popularModels.map((m) => ({ id: m, name: m }));
  }
  return [];
});

function onProviderSelectChange() {
  // 1. Save current form values to previous provider draft
  if (previousProvider.value) {
    providerDrafts.value[previousProvider.value] = {
      apiUrl: apiUrl.value,
      apiKey: apiKey.value,
      defaultModel: defaultModel.value,
    };
  }

  const newP = providerSelect.value;
  previousProvider.value = newP;
  const p = selectedProvider.value;
  const draft = providerDrafts.value[newP];

  // 2. Load draft or clean/preset values for new provider
  if (newP === 'custom') {
    if (draft && (draft.apiUrl || draft.apiKey || draft.defaultModel)) {
      apiUrl.value = draft.apiUrl;
      apiKey.value = draft.apiKey;
      defaultModel.value = draft.defaultModel;
    } else {
      apiUrl.value = '';
      apiKey.value = '';
      defaultModel.value = '';
    }
    selectedModelFromList.value = '';
  } else {
    if (draft && (draft.apiUrl || draft.defaultModel)) {
      apiUrl.value = draft.apiUrl;
      apiKey.value = draft.apiKey;
      defaultModel.value = draft.defaultModel;
      selectedModelFromList.value = draft.defaultModel;
    } else if (p) {
      apiUrl.value = p.baseUrl || p.url || '';
      defaultModel.value = p.defaultModel || '';
      selectedModelFromList.value = p.defaultModel || '';
      apiKey.value = '';
    }
  }
}

function onModelSelectChange() {
  if (selectedModelFromList.value) {
    defaultModel.value = selectedModelFromList.value;
  }
}

function onDefaultModelInput() {
  const matched = availablePopularModels.value.find((m) => m.id === defaultModel.value.trim());
  if (matched) {
    selectedModelFromList.value = matched.id;
  } else {
    selectedModelFromList.value = '';
  }
}

const currentModelPrice = computed(() => {
  if (providerSelect.value !== 'openrouter') return null;
  const matched = settingsStore.openRouterModels.find((m) => m.id === defaultModel.value.trim());
  if (!matched || !matched.pricing) return null;
  const pIn = parseFloat(matched.pricing.prompt || '0') * 1000000;
  const pOut = parseFloat(matched.pricing.completion || '0') * 1000000;
  return `$${pIn.toFixed(2)} / $${pOut.toFixed(2)} per 1M tokens`;
});

async function handleSave() {
  const payload: any = {
    aiApiUrl: apiUrl.value.trim(),
    aiDefaultModel: defaultModel.value.trim(),
    allowedTelegramUserIds: allowedTelegramUserIds.value.trim(),
    appUser: appUser.value.trim(),
    togetherImageModel: togetherImageModel.value.trim(),
  };

  if (apiKey.value.trim()) payload.aiApiKey = apiKey.value.trim();
  if (telegramToken.value.trim()) payload.telegramToken = telegramToken.value.trim();
  if (appPassword.value.trim()) payload.appPassword = appPassword.value.trim();
  if (togetherApiKey.value.trim()) payload.togetherApiKey = togetherApiKey.value.trim();
  if (xaiApiKey.value.trim()) payload.xaiApiKey = xaiApiKey.value.trim();

  await settingsStore.saveSettings(payload);
  apiKey.value = '';
  providerDrafts.value[providerSelect.value] = {
    apiUrl: apiUrl.value,
    apiKey: '',
    defaultModel: defaultModel.value,
  };
}
</script>

<template>
  <div class="chat-area settings-container">
    <!-- Header -->
    <header class="chat-header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="btn-primary cyber-btn--sm" @click="router.push('/')">
          ← Back to Chat
        </button>
        <div class="system-status">System Configuration</div>
      </div>

      <button
        class="btn-new-chat"
        style="width: auto; padding: 7px 18px;"
        :disabled="settingsStore.isSaving"
        @click="handleSave"
      >
        <span>{{ settingsStore.isSaving ? 'Saving...' : 'Save Settings' }}</span>
      </button>
    </header>

    <!-- Save Status Banner -->
    <div
      v-if="settingsStore.saveStatus"
      class="save-status-banner"
      :class="settingsStore.saveStatus.type"
    >
      {{ settingsStore.saveStatus.message }}
    </div>

    <!-- Settings Content -->
    <div class="settings-content">
      <div class="settings-grid">
        <!-- Section 1: AI Provider & Models -->
        <div class="settings-card">
          <div class="card-title">🧠 LLM & AI Provider</div>

          <div class="form-group">
            <label class="form-label">Preset Provider</label>
            <select
              v-model="providerSelect"
              class="cyber-select"
              @change="onProviderSelectChange"
            >
              <option v-for="p in settingsStore.providers" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">API Base URL</label>
            <input
              v-model="apiUrl"
              type="text"
              class="form-input"
              :placeholder="providerSelect === 'custom' ? 'e.g. http://localhost:8000/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions'"
            />
          </div>

          <div class="form-group">
            <label class="form-label">
              <span>API Key</span>
              <span v-if="settingsStore.hasAiApiKey && providerSelect === settingsStore.aiProvider" class="configured-tag">✓ Configured</span>
            </label>
            <input
              v-model="apiKey"
              type="password"
              class="form-input"
              :placeholder="(settingsStore.hasAiApiKey && providerSelect === settingsStore.aiProvider) ? '•••••••• (leave empty to keep unchanged)' : (providerSelect === 'custom' ? 'Enter API Key (or leave empty if not required)' : 'Enter API Key')"
            />
          </div>

          <div v-if="availablePopularModels.length > 0" class="form-group">
            <label class="form-label">
              <span>Select Popular Model</span>
              <span v-if="providerSelect === 'openrouter'" class="field-hint" style="margin-left: 8px; font-weight: normal;">(OpenRouter Live)</span>
            </label>
            <select
              v-model="selectedModelFromList"
              class="cyber-select"
              @change="onModelSelectChange"
            >
              <option value="">-- Or type custom model identifier below --</option>
              <option
                v-for="m in availablePopularModels"
                :key="m.id"
                :value="m.id"
              >
                {{ m.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="margin: 0;">Default Model Identifier</label>
              <span v-if="currentModelPrice" class="price-badge">{{ currentModelPrice }}</span>
            </div>
            <input
              v-model="defaultModel"
              type="text"
              class="form-input"
              :placeholder="providerSelect === 'custom' ? 'e.g. my-custom-model-id' : 'e.g. qwen/qwen3.5-flash-02-23'"
              @input="onDefaultModelInput"
            />
          </div>
        </div>

        <!-- Section 2: Telegram Bot Integration -->
        <div class="settings-card">
          <div class="card-title">📱 Telegram Integration</div>

          <div class="form-group">
            <label class="form-label">
              <span>Telegram Bot Token</span>
              <span v-if="settingsStore.hasTelegramBotToken" class="configured-tag">✓ Configured</span>
            </label>
            <input
              v-model="telegramToken"
              type="password"
              class="form-input"
              :placeholder="settingsStore.hasTelegramBotToken ? '•••••••• (leave empty to keep unchanged)' : 'Enter Bot Token from @BotFather'"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Allowed User IDs (comma-separated)</label>
            <input
              v-model="allowedTelegramUserIds"
              type="text"
              class="form-input"
              placeholder="e.g. 123456789, 987654321"
            />
            <div class="field-hint">Only these numerical Telegram user IDs will be allowed to interact with the bot.</div>
          </div>
        </div>

        <!-- Section 3: Web Security & Basic Auth -->
        <div class="settings-card">
          <div class="card-title">🔒 Web Security & Access Control</div>

          <div class="form-group">
            <label class="form-label">Application Username</label>
            <input v-model="appUser" type="text" class="form-input" placeholder="admin" />
          </div>

          <div class="form-group">
            <label class="form-label">
              <span>Application Password</span>
              <span v-if="settingsStore.hasAppPassword" class="configured-tag">✓ Configured</span>
            </label>
            <input
              v-model="appPassword"
              type="password"
              class="form-input"
              :placeholder="settingsStore.hasAppPassword ? '•••••••• (leave empty to keep unchanged)' : 'Set password to enable HTTP Basic Auth'"
            />
            <div class="field-hint">If set, both Web UI and API routes will require login/password authentication.</div>
          </div>
        </div>

        <!-- Section 4: Image Generation & Vision -->
        <div class="settings-card">
          <div class="card-title">🎨 Image Generation & Vision</div>

          <div class="form-group">
            <label class="form-label">
              <span>Together AI API Key (FLUX Image Gen)</span>
              <span v-if="settingsStore.hasTogetherApiKey" class="configured-tag">✓ Configured</span>
            </label>
            <input
              v-model="togetherApiKey"
              type="password"
              class="form-input"
              :placeholder="settingsStore.hasTogetherApiKey ? '•••••••• (leave empty to keep)' : 'Enter Together AI Key'"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Image Generation Model</label>
            <input
              v-model="togetherImageModel"
              type="text"
              class="form-input"
              placeholder="black-forest-labs/FLUX.1-schnell-Free"
            />
          </div>

          <div class="form-group">
            <label class="form-label">
              <span>xAI Grok API Key</span>
              <span v-if="settingsStore.hasXaiApiKey" class="configured-tag">✓ Configured</span>
            </label>
            <input
              v-model="xaiApiKey"
              type="password"
              class="form-input"
              :placeholder="settingsStore.hasXaiApiKey ? '•••••••• (leave empty to keep)' : 'Enter xAI Key'"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100vh;
  overflow: hidden;
  background: transparent;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 20px;
}

.card-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-main);
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 10px;
  margin-bottom: 16px;
}

.save-status-banner {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.save-status-banner.success {
  background: var(--accent-emerald-subtle);
  color: #34d399;
  border-bottom: 1px solid rgba(16, 185, 129, 0.3);
}

.save-status-banner.error {
  background: var(--accent-rose-subtle);
  color: #fb7185;
  border-bottom: 1px solid rgba(244, 63, 94, 0.3);
}
</style>
