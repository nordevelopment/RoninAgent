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
  <!-- System Execution Card -->
  <div v-if="isSystem" class="system-message-card">
    <div class="system-message-header">
      <span class="system-message-icon">{{ message.icon || '⚙️' }}</span>
      <span class="system-message-title">{{ message.systemTitle }}</span>
      <span v-if="message.isSuccess !== undefined" class="system-message-badge" :class="{ success: message.isSuccess, info: !message.isSuccess }">
        {{ message.isSuccess ? 'SUCCESS' : 'INFO' }}
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
        {{ isUser ? '👤 OPERATOR' : '🤖 RONIN AGENT' }}
      </span>
      <button
        v-if="!isUser && message.content"
        class="copy-btn"
        :title="copied ? 'COPIED!' : 'COPY MESSAGE'"
        @click="copyMessageContent"
      >
        {{ copied ? '✓ COPIED' : '📋 COPY' }}
      </button>
    </div>

    <!-- Reasoning / Thinking Block (if present) -->
    <details v-if="message.reasoning" class="reasoning-block">
      <summary class="reasoning-summary">
        🧠 NEURAL REASONING TRACE
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
.system-message-card {
  background: rgba(13, 20, 36, 0.8);
  border-left: 3px solid var(--cyber-cyan-500, #00f0ff);
  padding: 8px 12px;
  border-radius: 4px;
  margin: 6px 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

.system-message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}

.system-message-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 2px;
  margin-left: auto;
}

.system-message-badge.success {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
  border: 1px solid #00ff88;
}

.system-message-badge.info {
  background: rgba(0, 240, 255, 0.2);
  color: #00f0ff;
  border: 1px solid #00f0ff;
}

.system-message-details {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
}

.system-message-result pre {
  background: rgba(0, 0, 0, 0.4);
  padding: 6px;
  border-radius: 4px;
  margin-top: 4px;
  overflow-x: auto;
  font-size: 11px;
}

.reasoning-block {
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed rgba(255, 170, 0, 0.4);
  border-radius: 4px;
  padding: 6px;
}

.reasoning-summary {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: bold;
  color: #ffaa00;
  cursor: pointer;
  user-select: none;
}

.reasoning-content {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.attached-image-preview {
  max-width: 250px;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid var(--cyber-cyan-500, #00f0ff);
}

.attached-doc-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 240, 255, 0.1);
  border: 1px solid rgba(0, 240, 255, 0.3);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
}

.copy-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.6);
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn:hover {
  border-color: var(--cyber-cyan-500, #00f0ff);
  color: var(--cyber-cyan-300, #87eaf2);
}
</style>
