<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
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

onMounted(async () => {
  await settingsStore.fetchSettings();
  syncFromStore();
  settingsStore.fetchOpenRouterModels();
});

function syncFromStore() {
  providerSelect.value = settingsStore.aiProvider;
  apiUrl.value = settingsStore.aiApiUrl;
  defaultModel.value = settingsStore.aiDefaultModel;
  selectedModelFromList.value = settingsStore.aiDefaultModel;
  telegramToken.value = '';
  allowedTelegramUserIds.value = settingsStore.allowedTelegramUserIds;
  appUser.value = settingsStore.appUser;
  appPassword.value = '';
  togetherApiKey.value = '';
  togetherImageModel.value = settingsStore.togetherImageModel;
  xaiApiKey.value = '';
}

function onProviderSelectChange() {
  const p = settingsStore.providers.find((item) => item.id === providerSelect.value);
  if (p) {
    apiUrl.value = p.url;
    defaultModel.value = p.defaultModel;
    selectedModelFromList.value = p.defaultModel;
  }
}

function onModelSelectChange() {
  if (selectedModelFromList.value) {
    defaultModel.value = selectedModelFromList.value;
  }
}

function onDefaultModelInput() {
  const matched = settingsStore.openRouterModels.find((m) => m.id === defaultModel.value.trim());
  if (matched) {
    selectedModelFromList.value = matched.id;
  } else {
    selectedModelFromList.value = '';
  }
}

const currentModelPrice = computed(() => {
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
}
</script>

<template>
  <div class="chat-area settings-container">
    <!-- Header -->
    <header class="chat-header cyber-tile--bottom">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="cyber-btn cyber-btn--cyan" @click="router.push('/')">
          ← BACK TO CHAT
        </button>
        <div class="system-status">SYSTEM CONFIGURATION</div>
      </div>

      <button
        class="cyber-btn cyber-btn--green"
        :disabled="settingsStore.isSaving"
        @click="handleSave"
      >
        {{ settingsStore.isSaving ? 'SAVING...' : '💾 SAVE SETTINGS' }}
      </button>
    </header>

    <!-- Save Status Banner -->
    <div
      v-if="settingsStore.saveStatus"
      class="cyber-save-banner"
      :class="settingsStore.saveStatus.type"
    >
      {{ settingsStore.saveStatus.message }}
    </div>

    <!-- Settings Content -->
    <div class="settings-content">
      <div class="settings-grid">
        <!-- Section 1: AI Provider & Models -->
        <div class="settings-card cyber-tile">
          <div class="card-title cyber-text-glow">🧠 LLM & AI PROVIDER</div>

          <div class="cyber-form-group">
            <label class="cyber-label">PRESET PROVIDER</label>
            <select
              v-model="providerSelect"
              class="cyber-select"
              @change="onProviderSelectChange"
            >
              <option v-for="p in settingsStore.providers" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
              <option value="custom">⚙️ Custom Endpoint</option>
            </select>
          </div>

          <div class="cyber-form-group">
            <label class="cyber-label">API BASE URL</label>
            <input
              v-model="apiUrl"
              type="text"
              class="cyber-input"
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>

          <div class="cyber-form-group">
            <label class="cyber-label">
              API KEY
              <span v-if="settingsStore.hasAiApiKey" class="configured-tag">✓ CONFIGURED</span>
            </label>
            <input
              v-model="apiKey"
              type="password"
              class="cyber-input"
              :placeholder="settingsStore.hasAiApiKey ? '•••••••• (leave empty to keep unchanged)' : 'Enter API Key'"
            />
          </div>

          <div v-if="settingsStore.openRouterModels.length > 0" class="cyber-form-group">
            <label class="cyber-label">SELECT POPULAR MODEL</label>
            <select
              v-model="selectedModelFromList"
              class="cyber-select"
              @change="onModelSelectChange"
            >
              <option value="">-- Or type custom model below --</option>
              <option
                v-for="m in settingsStore.openRouterModels"
                :key="m.id"
                :value="m.id"
              >
                {{ m.name || m.id }}
              </option>
            </select>
          </div>

          <div class="cyber-form-group">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="cyber-label">DEFAULT MODEL IDENTIFIER</label>
              <span v-if="currentModelPrice" class="price-badge">{{ currentModelPrice }}</span>
            </div>
            <input
              v-model="defaultModel"
              type="text"
              class="cyber-input"
              placeholder="e.g. qwen/qwen3.5-flash-02-23"
              @input="onDefaultModelInput"
            />
          </div>
        </div>

        <!-- Section 2: Telegram Bot Integration -->
        <div class="settings-card cyber-tile">
          <div class="card-title cyber-text-glow">📱 TELEGRAM INTEGRATION</div>

          <div class="cyber-form-group">
            <label class="cyber-label">
              TELEGRAM BOT TOKEN
              <span v-if="settingsStore.hasTelegramBotToken" class="configured-tag">✓ CONFIGURED</span>
            </label>
            <input
              v-model="telegramToken"
              type="password"
              class="cyber-input"
              :placeholder="settingsStore.hasTelegramBotToken ? '•••••••• (leave empty to keep unchanged)' : 'Enter Bot Token from @BotFather'"
            />
          </div>

          <div class="cyber-form-group">
            <label class="cyber-label">ALLOWED TELEGRAM USER IDS (COMMA SEPARATED)</label>
            <input
              v-model="allowedTelegramUserIds"
              type="text"
              class="cyber-input"
              placeholder="e.g. 123456789, 987654321"
            />
            <div class="field-hint">// Only these user IDs will be allowed to talk to the bot.</div>
          </div>
        </div>

        <!-- Section 3: Web Security & Basic Auth -->
        <div class="settings-card cyber-tile">
          <div class="card-title cyber-text-glow">🔒 WEB SECURITY & AUTH</div>

          <div class="cyber-form-group">
            <label class="cyber-label">APPLICATION USERNAME</label>
            <input v-model="appUser" type="text" class="cyber-input" placeholder="admin" />
          </div>

          <div class="cyber-form-group">
            <label class="cyber-label">
              APPLICATION PASSWORD
              <span v-if="settingsStore.hasAppPassword" class="configured-tag">✓ CONFIGURED</span>
            </label>
            <input
              v-model="appPassword"
              type="password"
              class="cyber-input"
              :placeholder="settingsStore.hasAppPassword ? '•••••••• (leave empty to keep unchanged)' : 'Set password to enable Basic Auth'"
            />
            <div class="field-hint">// If set, Web UI and API will require login/password authentication.</div>
          </div>
        </div>

        <!-- Section 4: Image Generation & Vision (Together AI / xAI) -->
        <div class="settings-card cyber-tile">
          <div class="card-title cyber-text-glow">🎨 IMAGE GENERATION & EXTENSIONS</div>

          <div class="cyber-form-group">
            <label class="cyber-label">
              TOGETHER AI API KEY (FOR FLUX IMAGE GEN)
              <span v-if="settingsStore.hasTogetherApiKey" class="configured-tag">✓ CONFIGURED</span>
            </label>
            <input
              v-model="togetherApiKey"
              type="password"
              class="cyber-input"
              :placeholder="settingsStore.hasTogetherApiKey ? '•••••••• (leave empty to keep)' : 'Enter Together AI Key'"
            />
          </div>

          <div class="cyber-form-group">
            <label class="cyber-label">IMAGE GENERATION MODEL</label>
            <input
              v-model="togetherImageModel"
              type="text"
              class="cyber-input"
              placeholder="black-forest-labs/FLUX.1-schnell-Free"
            />
          </div>

          <div class="cyber-form-group">
            <label class="cyber-label">
              xAI GROK API KEY
              <span v-if="settingsStore.hasXaiApiKey" class="configured-tag">✓ CONFIGURED</span>
            </label>
            <input
              v-model="xaiApiKey"
              type="password"
              class="cyber-input"
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
  background: var(--color-bg-main, #070e17);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.settings-card {
  padding: 20px;
  background: rgba(13, 20, 36, 0.7);
  border: 1px solid rgba(0, 240, 255, 0.2);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-title {
  font-family: var(--font-mono, monospace);
  font-size: 14px;
  font-weight: bold;
  color: var(--cyber-cyan-300, #87eaf2);
  border-bottom: 1px solid rgba(0, 240, 255, 0.2);
  padding-bottom: 8px;
  margin-bottom: 4px;
}

.configured-tag {
  font-size: 10px;
  color: #00ff88;
  background: rgba(0, 255, 136, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  margin-left: 8px;
}

.price-badge {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: #ffaa00;
  background: rgba(255, 170, 0, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
}

.field-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-family: var(--font-mono, monospace);
  margin-top: 4px;
}

.cyber-save-banner {
  padding: 10px 20px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: bold;
  text-align: center;
}

.cyber-save-banner.success {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
  border-bottom: 1px solid #00ff88;
}

.cyber-save-banner.error {
  background: rgba(255, 0, 85, 0.2);
  color: #ff0055;
  border-bottom: 1px solid #ff0055;
}
</style>
