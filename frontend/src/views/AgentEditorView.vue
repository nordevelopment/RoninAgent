<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAgentsStore } from '../stores/agents';

const props = defineProps<{
  agentId: string;
}>();

const router = useRouter();
const agentsStore = useAgentsStore();

const allowedFiles = ['Agent.md', 'Identity.md', 'Memory.md', 'User.md'];
const activeTab = ref('Agent.md');
const fileContents = ref<Record<string, string>>({
  'Agent.md': '',
  'Identity.md': '',
  'Memory.md': '',
  'User.md': '',
});
const initialContents = ref<Record<string, string>>({});
const saveMessage = ref('ALL FILES SAVED');

onMounted(async () => {
  try {
    await agentsStore.fetchAgentFiles(props.agentId);
    allowedFiles.forEach((file) => {
      fileContents.value[file] = agentsStore.currentAgentFiles[file] || '';
      initialContents.value[file] = agentsStore.currentAgentFiles[file] || '';
    });
  } catch (err: any) {
    alert(`Failed to load agent: ${err.message}`);
    router.push('/agents');
  }
});

function isFileModified(file: string): boolean {
  return fileContents.value[file] !== initialContents.value[file];
}

const currentFileText = computed({
  get() {
    return fileContents.value[activeTab.value] || '';
  },
  set(val: string) {
    fileContents.value[activeTab.value] = val;
  },
});

const lineCount = computed(() => {
  const text = currentFileText.value;
  return text ? text.split('\n').length : 0;
});

const charCount = computed(() => {
  return currentFileText.value.length;
});

const hasAnyChanges = computed(() => {
  return allowedFiles.some((f) => isFileModified(f));
});

watch(hasAnyChanges, (changed) => {
  saveMessage.value = changed ? '● UNSAVED CHANGES' : 'ALL FILES SAVED';
});

async function handleSave() {
  try {
    await agentsStore.saveAgentFiles(props.agentId, fileContents.value);
    allowedFiles.forEach((file) => {
      initialContents.value[file] = fileContents.value[file];
    });
    saveMessage.value = '✓ SAVED SUCCESSFULLY';
    setTimeout(() => {
      if (!hasAnyChanges.value) {
        saveMessage.value = 'ALL FILES SAVED';
      }
    }, 2500);
  } catch (err: any) {
    alert(`Error saving files: ${err.message}`);
  }
}
</script>

<template>
  <div class="chat-area editor-container">
    <!-- Header -->
    <header class="chat-header cyber-tile--bottom">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="cyber-btn cyber-btn--cyan" @click="router.push('/agents')">
          ← BACK TO AGENTS
        </button>
        <div class="system-status">
          AGENT PROMPT MATRIX: [{{ agentId.toUpperCase() }}]
        </div>
      </div>

      <button
        class="cyber-btn cyber-btn--green"
        :disabled="agentsStore.isSavingFiles"
        @click="handleSave"
      >
        {{ agentsStore.isSavingFiles ? 'SAVING...' : '💾 SAVE CHANGES' }}
      </button>
    </header>

    <!-- Tabs Header -->
    <div class="editor-tabs-bar cyber-tile--bottom">
      <button
        v-for="file in allowedFiles"
        :key="file"
        class="editor-tab-btn"
        :class="{ active: activeTab === file, modified: isFileModified(file) }"
        @click="activeTab = file"
      >
        {{ file }}
        <span v-if="isFileModified(file)" class="change-dot">●</span>
      </button>
    </div>

    <!-- Textarea Body -->
    <div class="editor-body">
      <textarea
        v-model="currentFileText"
        class="editor-textarea"
        :placeholder="'Edit ' + activeTab + ' configuration...'"
        spellcheck="false"
      ></textarea>
    </div>

    <!-- Status Bar Footer -->
    <footer class="editor-status-bar cyber-tile--top">
      <div class="status-left">
        STATUS:
        <span
          class="status-text"
          :class="{ modified: hasAnyChanges }"
        >
          {{ saveMessage }}
        </span>
      </div>
      <div class="status-right">
        LINES: {{ lineCount }} | CHARS: {{ charCount }}
      </div>
    </footer>
  </div>
</template>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg-main, #070e17);
}

.editor-tabs-bar {
  display: flex;
  background: rgba(3, 31, 42, 0.4);
  border-bottom: 1px solid rgba(0, 240, 255, 0.2);
  padding: 0 10px;
}

.editor-tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.6);
  padding: 10px 18px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.editor-tab-btn:hover {
  color: #fff;
  background: rgba(0, 240, 255, 0.05);
}

.editor-tab-btn.active {
  color: var(--cyber-cyan-300, #87eaf2);
  border-bottom-color: var(--cyber-cyan-500, #00f0ff);
  background: rgba(0, 240, 255, 0.1);
}

.change-dot {
  color: #ffaa00;
  font-size: 10px;
}

.editor-body {
  flex: 1;
  overflow: hidden;
  padding: 10px;
}

.editor-textarea {
  width: 100%;
  height: 100%;
  background: #040810;
  color: #e2e8f0;
  border: 1px solid rgba(0, 240, 255, 0.2);
  border-radius: 4px;
  padding: 16px;
  font-family: 'Consolas', 'Fira Code', var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  box-sizing: border-box;
}

.editor-textarea:focus {
  border-color: var(--cyber-cyan-500, #00f0ff);
}

.editor-status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: rgba(3, 31, 42, 0.6);
  border-top: 1px solid rgba(0, 240, 255, 0.2);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.status-text {
  font-weight: bold;
  color: #00ff88;
}

.status-text.modified {
  color: #ffaa00;
}
</style>
