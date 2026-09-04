<script setup lang="ts">
import { computed, ref } from 'vue';
import { marked } from 'marked';
import { ChatMessage } from '../../stores/chat';

const props = defineProps<{
  message: ChatMessage;
}>();

const copied = ref(false);

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system' || props.message.isSystemInfo);
const isAgent = computed(() => props.message.role === 'agent' || props.message.role === 'assistant');

const renderedHtml = computed(() => {
  if (!props.message.content) return '';
  try {
    return marked.parse(props.message.content, { async: false }) as string;
  } catch {
    return props.message.content;
  }
});

const renderedReasoning = computed(() => {
  if (!props.message.reasoning) return '';
  try {
    return marked.parse(props.message.reasoning, { async: false }) as string;
  } catch {
    return props.message.reasoning;
  }
});

function copyMessageContent() {
  if (!props.message.content) return;
  navigator.clipboard.writeText(props.message.content).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}
</script>

<template>
  <!-- System / Tool Execution Card -->
  <div v-if="isSystem" class="system-message-card">
    <div class="system-message-header">
      <span class="system-message-icon">{{ message.icon || '⚙️' }}</span>
      <span class="system-message-title">{{ message.systemTitle || 'System Action' }}</span>
      <span v-if="message.isSuccess !== undefined" class="system-message-badge" :class="{ success: message.isSuccess, info: !message.isSuccess }">
        {{ message.isSuccess ? 'Success' : 'Info' }}
      </span>
    </div>
    <div v-if="message.systemDetails" class="system-message-details">
      {{ message.systemDetails }}
    </div>
    <div v-if="message.systemResult" class="system-message-result">
      <pre><code>{{ message.systemResult }}</code></pre>
    </div>
  </div>

  <!-- User / Agent Chat Bubble -->
  <div
    v-else
    class="message"
    :class="isUser ? 'user-message' : 'agent-message'"
  >
    <!-- Message Header -->
    <div class="message-header">
      <span class="sender-name">
        <template v-if="isUser">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>You</span>
        </template>
        <template v-else>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
          </svg>
          <span>RoninAgent</span>
        </template>
      </span>

      <button
        v-if="!isUser && message.content"
        class="copy-btn"
        :title="copied ? 'Copied to clipboard' : 'Copy message'"
        @click="copyMessageContent"
      >
        <svg v-if="copied" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>

    <!-- Neural Reasoning / Thinking Trace -->
    <details v-if="message.reasoning" class="reasoning-block">
      <summary class="reasoning-summary">
        <span>🧠 Thinking Process</span>
      </summary>
      <div class="reasoning-content markdown-body" v-html="renderedReasoning"></div>
    </details>

    <!-- Attachments Display -->
    <div v-if="message.attachments && message.attachments.length > 0" class="message-attachments">
      <div
        v-for="(att, idx) in message.attachments"
        :key="idx"
        class="attachment-item"
      >
        <img
          v-if="att.type === 'image' || att.url?.startsWith('data:image')"
          :src="att.url"
          alt="Attachment"
          class="attached-image-preview"
        />
        <div v-else class="attached-doc-chip">
          <span class="doc-icon">📄</span>
          <span class="doc-name">{{ att.name }}</span>
        </div>
      </div>
    </div>

    <!-- Message Content Body -->
    <div class="message-content markdown-body" v-html="renderedHtml"></div>
  </div>
</template>

<style scoped>
.sender-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.attached-image-preview {
  max-width: 260px;
  max-height: 200px;
  border-radius: var(--radius-sm, 8px);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-sm);
}

.attached-doc-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  padding: 5px 10px;
  border-radius: var(--radius-xs, 4px);
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--text-main);
}
</style>
