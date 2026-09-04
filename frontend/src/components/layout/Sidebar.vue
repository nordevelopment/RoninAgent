<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useChatStore } from '../../stores/chat';
import { useThemeStore, ThemeMode } from '../../stores/theme';
import RobotPet from './RobotPet.vue';

const router = useRouter();
const route = useRoute();
const chatStore = useChatStore();
const themeStore = useThemeStore();

const editingSessionId = ref<string | null>(null);
const editTitleText = ref<string>('');

onMounted(() => {
  if (chatStore.sessions.length === 0) {
    chatStore.fetchSessions();
  }
});

function onThemeChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  themeStore.setTheme(target.value as ThemeMode);
}

function handleNewChat() {
  chatStore.createNewSession();
  if (route.path !== '/') {
    router.push('/');
  }
}

function handleSelectSession(id: string) {
  chatStore.switchSession(id);
  if (route.path !== '/') {
    router.push('/');
  }
}

function startRename(id: string, currentTitle: string, e: Event) {
  e.stopPropagation();
  editingSessionId.value = id;
  editTitleText.value = currentTitle;
}

function saveRename(id: string) {
  if (editTitleText.value.trim()) {
    chatStore.updateSessionTitle(id, editTitleText.value.trim());
  }
  editingSessionId.value = null;
}

function cancelRename() {
  editingSessionId.value = null;
}

function handleDeleteSession(id: string, e: Event) {
  e.stopPropagation();
  if (confirm('Delete this conversation session?')) {
    chatStore.deleteSession(id);
  }
}

function handleClearChat() {
  if (confirm('Clear messages in current chat?')) {
    chatStore.clearCurrentChat();
  }
}

function handlePurgeMemory() {
  if (confirm('Purge all agent working memory for this session?')) {
    chatStore.purgeMemory();
  }
}

function navigateTo(path: string) {
  router.push(path);
}
</script>

<template>
  <aside class="sidebar cyber-bg-primary">
    <!-- Logo & Brand -->
    <div class="logo-panel" @click="navigateTo('/')" style="cursor: pointer;">
      <div class="logo cyber-nav__brand">
        RoninAgent
      </div>
      <div class="cyber-status">
        <div class="cyber-status__dot cyber-icon--pulse"></div>
      </div>
    </div>

    <!-- Theme Switcher -->
    <div class="sidebar-panel">
      <div class="sessions-title cyber-text-glow">THEME</div>
      <select
        class="cyber-select cyber-theme-select"
        :value="themeStore.theme"
        @change="onThemeChange"
      >
        <option value="dark">🌙 Cyber Dark</option>
        <option value="light">☀️ Modern Light</option>
      </select>
    </div>

    <!-- New Chat Button -->
    <button id="btnNewChat" class="cyber-btn" @click="handleNewChat">
      + NEW CHAT
    </button>

    <!-- Sessions List -->
    <div class="sidebar-panel sessions-panel">
      <div class="sessions-title cyber-text-glow">SESSIONS</div>
      <div class="sessions-list" id="sessionsList">
        <div
          v-for="s in chatStore.sessions"
          :key="s.id"
          class="session-item"
          :class="{ active: s.id === chatStore.currentSessionId }"
          @click="handleSelectSession(s.id)"
        >
          <!-- Editing Mode -->
          <div v-if="editingSessionId === s.id" class="session-edit-box" @click.stop>
            <input
              v-model="editTitleText"
              class="cyber-input cyber-input--sm"
              @keydown.enter="saveRename(s.id)"
              @keydown.esc="cancelRename"
              autofocus
            />
            <button class="cyber-btn cyber-btn--xs cyber-btn--green" @click="saveRename(s.id)">✓</button>
            <button class="cyber-btn cyber-btn--xs" @click="cancelRename">✕</button>
          </div>

          <!-- Normal Display Mode -->
          <template v-else>
            <span class="session-title-text" :title="s.title">
              {{ s.title || s.id }}
            </span>
            <div class="session-actions">
              <button
                class="session-action-btn"
                title="Rename Session"
                @click="startRename(s.id, s.title, $event)"
              >
                ✏️
              </button>
              <button
                class="session-action-btn delete-btn"
                title="Delete Session"
                @click="handleDeleteSession(s.id, $event)"
              >
                🗑
              </button>
            </div>
          </template>
        </div>

        <div v-if="chatStore.sessions.length === 0" class="no-sessions">
          NO SESSIONS YET
        </div>
      </div>
    </div>

    <!-- Navigation Hub Buttons -->
    <div class="sidebar-panel" style="display: flex; flex-direction: column; gap: 8px;">
      <button
        id="btnOpenAgents"
        class="cyber-btn cyber-btn--cyan w-100"
        :class="{ active: route.path === '/agents' }"
        @click="navigateTo('/agents')"
        style="display: flex; align-items: center; justify-content: center; gap: 8px;"
      >
        <span>🤖</span> AGENTS HUB
      </button>
      <button
        id="btnOpenTasks"
        class="cyber-btn cyber-btn--green w-100"
        :class="{ active: route.path === '/tasks' }"
        @click="navigateTo('/tasks')"
        style="display: flex; align-items: center; justify-content: center; gap: 8px;"
      >
        <span>📋</span> TASK MANAGER
      </button>
      <button
        id="btnOpenWorkspace"
        class="cyber-btn cyber-btn--cyan w-100"
        title="OPEN WORKSPACE FOLDER"
        @click="chatStore.openWorkspaceFolder"
        style="display: flex; align-items: center; justify-content: center; gap: 8px;"
      >
        <span>📁</span> WORKSPACE
      </button>
    </div>

    <!-- Sidebar Footer -->
    <div class="sidebar-footer">
      <button
        id="btnOpenSettings"
        class="cyber-btn cyber-btn--cyan w-100"
        :class="{ active: route.path === '/settings' }"
        @click="navigateTo('/settings')"
      >
        ⚙️ SETTINGS
      </button>

      <button
        id="btnClearChat"
        class="cyber-btn cyber-btn--magenta w-100"
        style="margin-top: 8px;"
        @click="handleClearChat"
      >
        CLEAR CHAT
      </button>

      <button
        id="btnClearMemory"
        class="cyber-btn cyber-btn--magenta w-100"
        style="margin-top: 8px;"
        @click="handlePurgeMemory"
      >
        PURGE MEMORY
      </button>

      <!-- Robot Pet Widget -->
      <div
        class="sidebar-panel"
        style="display: flex; justify-content: center; align-items: center; padding: 10px 0; margin-bottom: 5px;"
      >
        <RobotPet />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sessions-panel {
  flex: 1;
  min-height: 120px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 250px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

.session-item:hover {
  background: rgba(0, 240, 255, 0.08);
  border-color: rgba(0, 240, 255, 0.3);
}

.session-item.active {
  background: rgba(0, 240, 255, 0.15);
  border-color: var(--cyber-cyan-500, #00f0ff);
  color: var(--cyber-cyan-300, #87eaf2);
}

.session-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.session-actions {
  display: none;
  gap: 4px;
}

.session-item:hover .session-actions {
  display: flex;
}

.session-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 2px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.session-action-btn:hover {
  opacity: 1;
}

.session-edit-box {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.no-sessions {
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  padding: 16px 0;
}
</style>
