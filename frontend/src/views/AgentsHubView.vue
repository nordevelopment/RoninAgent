<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAgentsStore, AgentItem } from '../stores/agents';
import { useChatStore } from '../stores/chat';

const router = useRouter();
const agentsStore = useAgentsStore();
const chatStore = useChatStore();

const newAgentName = ref('');
const isCreating = ref(false);

onMounted(() => {
  agentsStore.fetchAgents();
});

async function handleCreateAgent() {
  if (!newAgentName.value.trim()) return;
  const raw = newAgentName.value.trim().toLowerCase().replace(/\s+/g, '_');
  try {
    isCreating.value = true;
    await agentsStore.createAgent(raw);
    newAgentName.value = '';
  } catch (err: any) {
    alert(`Failed to create agent: ${err.message}`);
  } finally {
    isCreating.value = false;
  }
}

async function startChatWithAgent(agent: AgentItem) {
  await chatStore.createNewSession(agent.id);
  router.push('/');
}

function openEditor(agentId: string) {
  router.push(`/edit-agent/${agentId}`);
}

async function handleDelete(agentId: string) {
  if (confirm(`Delete agent profile "${agentId}"?`)) {
    try {
      await agentsStore.deleteAgent(agentId);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }
}
</script>

<template>
  <div class="chat-area agents-hub-container">
    <!-- Header -->
    <header class="chat-header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="btn-primary cyber-btn--sm" @click="router.push('/')">
          ← Back to Chat
        </button>
        <div class="system-status">Agents Repository</div>
      </div>

      <button
        class="btn-primary cyber-btn--sm"
        :disabled="agentsStore.isLoading"
        @click="agentsStore.fetchAgents"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>{{ agentsStore.isLoading ? 'Refreshing...' : 'Refresh' }}</span>
      </button>
    </header>

    <!-- Content Area -->
    <div class="agents-hub-content">
      <!-- Create New Agent Bar -->
      <div class="create-agent-box">
        <div class="create-agent-row">
          <div style="position: relative; flex: 1;">
            <input
              v-model="newAgentName"
              type="text"
              class="form-input"
              placeholder="Enter new agent identifier (e.g. security_auditor, devops_lead)..."
              @keydown.enter="handleCreateAgent"
            />
          </div>
          <button
            class="btn-new-chat"
            style="width: auto; padding: 9px 18px;"
            :disabled="isCreating || !newAgentName.trim()"
            @click="handleCreateAgent"
          >
            <span>+ Create Agent</span>
          </button>
        </div>
      </div>

      <!-- Agents Grid -->
      <div v-if="agentsStore.agents.length > 0" class="agents-grid">
        <div
          v-for="agent in agentsStore.agents"
          :key="agent.id || String(agent)"
          class="agent-card"
        >
          <div class="agent-card-header">
            <div class="agent-avatar-badge">🤖</div>
            <div class="agent-info">
              <div class="agent-name">
                {{ (agent.name || agent.id || String(agent)).replace(/_/g, ' ') }}
              </div>
              <div class="agent-id">ID: {{ agent.id || String(agent) }}</div>
            </div>
            <span v-if="(agent.id || agent) === 'main_agent'" class="default-badge">DEFAULT</span>
          </div>

          <div class="agent-card-body">
            <p class="agent-desc">
              {{ agent.description || 'Specialized autonomous AI agent persona with sovereign tool access and custom instructions.' }}
            </p>
          </div>

          <div class="agent-card-footer">
            <button
              class="btn-primary cyber-btn--sm flex-1"
              @click="startChatWithAgent(agent)"
            >
              <span>💬 Start Chat</span>
            </button>
            <button
              class="btn-primary cyber-btn--sm"
              title="Edit Prompts & Files"
              @click="openEditor(agent.id || String(agent))"
            >
              <span>Edit</span>
            </button>
            <button
              v-if="(agent.id || agent) !== 'main_agent' && (agent.id || agent) !== 'base-template' && (agent.id || agent) !== 'base_template'"
              class="cyber-btn cyber-btn--red cyber-btn--sm"
              title="Delete Agent"
              @click="handleDelete(agent.id || String(agent))"
            >
              <span>🗑</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-chat-state">
        <div class="empty-icon">🤖</div>
        <div v-if="agentsStore.isLoading" class="empty-title">Loading agent repository...</div>
        <div v-else-if="agentsStore.fetchError" class="empty-subtitle error-text">
          <div style="margin-bottom: 10px; color: var(--accent-rose);">⚠️ {{ agentsStore.fetchError }}</div>
          <button class="btn-primary" @click="agentsStore.fetchAgents(0)">
            Retry connection
          </button>
        </div>
        <div v-else class="empty-subtitle">
          No custom agents found. Create a new specialized agent profile above.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.create-agent-box {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  box-shadow: var(--shadow-sm), var(--shadow-inner-light);
}

.create-agent-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
}

.agent-card {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  box-shadow: var(--shadow-sm), var(--shadow-inner-light);
  transition: all var(--transition-fast);
}

.agent-card:hover {
  border-color: var(--border-bright);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-avatar-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  font-size: 20px;
}

.agent-info {
  flex: 1;
}

.agent-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  text-transform: capitalize;
}

.agent-id {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-muted);
}

.default-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  background: var(--accent-primary-subtle);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #818cf8;
  border-radius: var(--radius-full);
}

.agent-desc {
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.agent-card-footer {
  display: flex;
  gap: 8px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
}

.flex-1 {
  flex: 1;
}
</style>
