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
  if (confirm('Clear all messages in current chat?')) {
    chatStore.clearCurrentChat();
  }
}

function handlePurgeMemory() {
  if (confirm('Purge all working memory for this session?')) {
    chatStore.purgeMemory();
  }
}

function navigateTo(path: string) {
  router.push(path);
}
</script>

<template>
  <aside class="sidebar">
    <!-- Brand Header -->
    <div class="sidebar-brand-panel" @click="navigateTo('/')">
      <div class="brand-title">
        <div class="brand-icon-wrapper">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
        <span>RoninAgent</span>
      </div>
      <div class="brand-status-dot" title="AI Core Active"></div>
    </div>

    <!-- Primary Action: New Chat -->
    <button id="btnNewChat" class="btn-new-chat" @click="handleNewChat">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>New Chat</span>
    </button>

    <!-- Navigation Hub Links -->
    <nav class="sidebar-nav-list">
      <button
        class="sidebar-nav-link"
        :class="{ active: route.path === '/' }"
        @click="navigateTo('/')"
      >
        <span class="sidebar-nav-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </span>
        <span>Chat</span>
      </button>

      <button
        id="btnOpenAgents"
        class="sidebar-nav-link"
        :class="{ active: route.path === '/agents' || route.path.startsWith('/edit-agent') }"
        @click="navigateTo('/agents')"
      >
        <span class="sidebar-nav-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
            <line x1="8" y1="16" x2="8" y2="16"></line>
            <line x1="16" y1="16" x2="16" y2="16"></line>
          </svg>
        </span>
        <span>Agents Hub</span>
      </button>

      <button
        id="btnOpenTasks"
        class="sidebar-nav-link"
        :class="{ active: route.path === '/tasks' }"
        @click="navigateTo('/tasks')"
      >
        <span class="sidebar-nav-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
        </span>
        <span>Task Manager</span>
      </button>

      <button
        id="btnOpenWorkspace"
        class="sidebar-nav-link"
        title="Open Workspace Folder"
        @click="chatStore.openWorkspaceFolder"
      >
        <span class="sidebar-nav-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </span>
        <span>Workspace</span>
      </button>
    </nav>

    <!-- Sessions History Section -->
    <div class="sidebar-section-header">
      <span>RECENT SESSIONS</span>
    </div>

    <div class="sidebar-sessions-list" id="sessionsList">
      <div
        v-for="s in chatStore.sessions"
        :key="s.id"
        class="session-item-row"
        :class="{ active: s.id === chatStore.currentSessionId && route.path === '/' }"
        @click="handleSelectSession(s.id)"
      >
        <!-- Editing Session Title -->
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

        <!-- Normal Session Row -->
        <template v-else>
          <span class="session-label-text" :title="s.title">
            {{ s.title || s.id }}
          </span>
          <div class="session-actions-group">
            <button
              class="session-action-icon-btn"
              title="Rename session"
              @click="startRename(s.id, s.title, $event)"
            >
              ✏️
            </button>
            <button
              class="session-action-icon-btn delete-hover"
              title="Delete session"
              @click="handleDeleteSession(s.id, $event)"
            >
              🗑
            </button>
          </div>
        </template>
      </div>

      <div v-if="chatStore.sessions.length === 0" class="no-sessions">
        No sessions yet
      </div>
    </div>

    <!-- Theme & Quick Settings Selector -->
    <div style="padding: 0 4px;">
      <select
        class="cyber-select"
        :value="themeStore.theme"
        @change="onThemeChange"
      >
        <option value="dark">🌊 Deep Ocean</option>
        <option value="light">☀️ Clean Light</option>
      </select>
    </div>

    <!-- Sidebar Footer -->
    <div class="sidebar-footer-menu">
      <button
        id="btnOpenSettings"
        class="sidebar-footer-btn"
        :class="{ active: route.path === '/settings' }"
        @click="navigateTo('/settings')"
      >
        <span>⚙️</span>
        <span>Settings</span>
      </button>

      <button
        id="btnClearChat"
        class="sidebar-footer-btn"
        @click="handleClearChat"
      >
        <span>🧹</span>
        <span>Clear Chat</span>
      </button>

      <button
        id="btnClearMemory"
        class="sidebar-footer-btn danger-hover"
        @click="handlePurgeMemory"
      >
        <span>⚡</span>
        <span>Purge Memory</span>
      </button>

      <!-- Robot Pet Companion -->
      <div style="display: flex; justify-content: center; align-items: center; padding: 6px 0;">
        <RobotPet />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.session-edit-box {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}
</style>
