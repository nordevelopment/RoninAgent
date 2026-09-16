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
const saveMessage = ref('All files saved');

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
  saveMessage.value = changed ? '● Unsaved changes' : 'All files saved';
});

async function handleSave() {
  try {
    await agentsStore.saveAgentFiles(props.agentId, fileContents.value);
    allowedFiles.forEach((file) => {
      initialContents.value[file] = fileContents.value[file];
    });
    saveMessage.value = '✓ Saved successfully';
    setTimeout(() => {
      if (!hasAnyChanges.value) {
        saveMessage.value = 'All files saved';
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
    <header class="chat-header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="btn-primary cyber-btn--sm" @click="router.push('/agents')">
          ← Back to Agents
        </button>
        <div class="system-status">
          <span>Agent Editor:</span>
          <span style="color: var(--accent-cyan);">{{ agentId }}</span>
        </div>
      </div>

      <button
        class="btn-new-chat"
        style="width: auto; padding: 7px 18px;"
        :disabled="agentsStore.isSavingFiles"
        @click="handleSave"
      >
        <span>{{ agentsStore.isSavingFiles ? 'Saving...' : 'Save Changes' }}</span>
      </button>
    </header>

    <!-- Tabs Header -->
    <div class="editor-tabs-bar">
      <button
        v-for="file in allowedFiles"
        :key="file"
        class="editor-tab-btn"
        :class="{ active: activeTab === file, modified: isFileModified(file) }"
        @click="activeTab = file"
      >
        <span>{{ file }}</span>
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
    <footer class="editor-status-bar">
      <div class="status-left">
        <span
          class="status-text"
          :class="{ modified: hasAnyChanges }"
        >
          {{ saveMessage }}
        </span>
      </div>
      <div class="status-right">
        Lines: {{ lineCount }} | Characters: {{ charCount }}
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
  background: var(--bg-canvas);
}

.editor-tabs-bar {
  display: flex;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  padding: 0 16px;
  gap: 4px;
}

.editor-tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 6px;
}

.editor-tab-btn:hover {
  color: var(--text-main);
  background: var(--bg-elevated);
}

.editor-tab-btn.active {
  color: var(--text-main);
  border-bottom-color: var(--accent-primary);
  background: var(--bg-card);
  font-weight: 600;
}

.change-dot {
  color: var(--accent-amber);
  font-size: 8px;
}

.editor-body {
  flex: 1;
  overflow: hidden;
  padding: 16px;
}

.editor-textarea {
  width: 100%;
  height: 100%;
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 18px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  line-height: 1.6;
  resize: none;
  outline: none;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.3);
}

.editor-textarea:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-subtle);
}

.editor-status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 24px;
  background: var(--bg-surface-glass);
  border-top: 1px solid var(--border-default);
  font-size: 12px;
  color: var(--text-muted);
}

.status-text {
  font-weight: 600;
  color: var(--accent-emerald);
}

.status-text.modified {
  color: var(--accent-amber);
}
</style>
