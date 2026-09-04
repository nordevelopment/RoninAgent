<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';
import MessageItem from '../components/chat/MessageItem.vue';
import ChatInput from '../components/chat/ChatInput.vue';
import DropZone from '../components/chat/DropZone.vue';

const router = useRouter();
const chatStore = useChatStore();

const messagesContainer = ref<HTMLElement | null>(null);
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);
const isDraggingOver = ref(false);

let dragCounter = 0;

function scrollToBottom(smooth = true) {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  });
}

watch(
  () => chatStore.messages.length,
  () => {
    scrollToBottom();
  }
);

function handleSend(text: string, files: File[], imageDataUrl: string | null) {
  chatStore.sendMessage(text, files, imageDataUrl);
  scrollToBottom();
}

function handleStop() {
  chatStore.stopGeneration();
}

function onDragEnter(e: DragEvent) {
  e.preventDefault();
  dragCounter++;
  if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
    isDraggingOver.value = true;
  }
}

function onDragLeave(e: DragEvent) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    isDraggingOver.value = false;
    dragCounter = 0;
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  isDraggingOver.value = false;
  dragCounter = 0;
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    chatInputRef.value?.addDroppedFiles(e.dataTransfer.files);
  }
}

onMounted(() => {
  chatStore.initialize().then(() => {
    scrollToBottom(false);
  });
});
</script>

<template>
  <div
    class="chat-area"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <!-- DropZone Overlay -->
    <DropZone :visible="isDraggingOver" />

    <!-- Chat Header -->
    <header class="chat-header cyber-tile--bottom">
      <div class="header-left">
        <div class="system-status" id="system-status">
          <span class="status-pulse-dot"></span>
          <span class="status-agent-name">{{ (chatStore.currentAgentId || 'main_agent').toUpperCase().replace(/_/g, ' ') }}</span>
          <span class="status-divider">//</span>
          <span class="status-state">{{ chatStore.isLoading ? 'PROCESSING...' : chatStore.systemStatus }}</span>
          <span v-if="chatStore.activeModelName" class="status-model-tag">{{ chatStore.activeModelName }}</span>
        </div>
      </div>

      <div class="header-right">
        <button
          class="cyber-btn cyber-btn--green"
          @click="router.push('/tasks')"
        >
          📋 TASK MANAGER
        </button>
      </div>
    </header>

    <!-- Setup Warning Alert -->
    <div
      v-if="chatStore.isSetupWarningVisible"
      class="cyber-warning-alert"
    >
      ⚠️ PREVIEW MODE: AI API Key is not configured. Please open
      <router-link to="/settings" class="alert-link">Settings</router-link>
      to enter your API key for LLM chat completions.
    </div>

    <!-- Messages Container -->
    <div ref="messagesContainer" class="chat-messages" id="chatMessages">
      <div v-if="chatStore.messages.length === 0" class="empty-chat-state">
        <div class="empty-icon">🤖</div>
        <div class="empty-title cyber-text-glow">RONIN AGENT INITIALIZED</div>
        <div class="empty-subtitle">// Ready to assist with coding, automation, analysis and tasks.</div>
      </div>

      <MessageItem
        v-for="msg in chatStore.messages"
        :key="msg.id"
        :message="msg"
      />
    </div>

    <!-- Typing Indicator -->
    <div
      v-if="chatStore.isLoading"
      class="typing-indicator"
      id="typingIndicator"
    >
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <span class="typing-text">{{ chatStore.typingStatusText }}</span>
      <button
        type="button"
        class="cyber-btn cyber-btn--red typing-stop-btn"
        title="STOP AI GENERATION"
        @click="handleStop"
      >
        ⏹ STOP
      </button>
    </div>

    <!-- Input Box -->
    <ChatInput
      ref="chatInputRef"
      :is-generating="chatStore.isLoading"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<style scoped>
.chat-area {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg-main, #070e17);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(3, 31, 42, 0.6);
  border-bottom: 1px solid rgba(0, 240, 255, 0.2);
  z-index: 10;
}

.system-status {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--cyber-cyan-400, #54d1db);
  letter-spacing: 1px;
}

.alert-link {
  color: var(--cyber-cyan-300, #87eaf2);
  font-weight: bold;
  text-decoration: underline;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-chat-state {
  margin: auto;
  text-align: center;
  padding: 40px;
}

.empty-icon {
  font-size: 54px;
  margin-bottom: 12px;
}

.empty-title {
  font-family: var(--font-mono, monospace);
  font-size: 16px;
  font-weight: bold;
  color: var(--cyber-cyan-300, #87eaf2);
}

.empty-subtitle {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  background: rgba(0, 0, 0, 0.4);
  border-top: 1px solid rgba(0, 240, 255, 0.1);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--cyber-cyan-300, #87eaf2);
}

.typing-dots {
  display: flex;
  gap: 4px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cyber-cyan-500, #00f0ff);
  animation: pulse 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

.typing-stop-btn {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 11px;
}

@keyframes pulse {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1.2); opacity: 1; }
}
</style>
