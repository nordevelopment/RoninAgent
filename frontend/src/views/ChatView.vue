<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';
import MessageItem from '../components/chat/MessageItem.vue';
import ChatInput from '../components/chat/ChatInput.vue';
import DropZone from '../components/chat/DropZone.vue';
import ChatCapabilities from '../components/chat/ChatCapabilities.vue';

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

    <!-- Sticky Header -->
    <header class="chat-header">
      <div class="header-left">
        <div class="system-status" id="system-status">
          <span class="status-pulse-dot"></span>
          <span class="status-agent-name">{{ (chatStore.currentAgentId || 'main_agent').replace(/_/g, ' ') }}</span>
          <span class="status-divider">/</span>
          <span class="status-state">{{ chatStore.isLoading ? 'Thinking...' : chatStore.systemStatus }}</span>
          <span v-if="chatStore.activeModelName" class="status-model-tag">{{ chatStore.activeModelName }}</span>
        </div>
      </div>

      <div class="header-right">
        <button
          class="btn-primary cyber-btn--sm"
          @click="router.push('/tasks')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
          <span>Task Manager</span>
        </button>
      </div>
    </header>

    <!-- Setup Warning Alert -->
    <div
      v-if="chatStore.isSetupWarningVisible"
      class="cyber-warning-alert"
    >
      <span>⚠️ Preview Mode: AI API Key is not configured. Please open</span>
      <router-link to="/settings" class="alert-link">Settings</router-link>
      <span>to add your LLM key.</span>
    </div>

    <!-- Messages Container -->
    <div ref="messagesContainer" class="chat-messages" id="chatMessages">
      <!-- Empty State Hero with Agent Capabilities Showcase -->
      <ChatCapabilities v-if="chatStore.messages.length === 0" />

      <MessageItem
        v-for="msg in chatStore.messages"
        :key="msg.id"
        :message="msg"
      />
    </div>

    <!-- Typing / Generating Indicator -->
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
        title="Stop AI Generation"
        @click="handleStop"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"></rect>
        </svg>
        <span>Stop</span>
      </button>
    </div>

    <!-- Floating Input Dock -->
    <ChatInput
      ref="chatInputRef"
      :is-generating="chatStore.isLoading"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<style scoped>
.alert-link {
  color: var(--text-accent, #38bdf8);
  font-weight: 600;
  text-decoration: underline;
}

</style>
