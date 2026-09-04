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
    <header class="chat-header cyber-tile--bottom">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="cyber-btn cyber-btn--cyan" @click="router.push('/')">
          ← BACK TO CHAT
        </button>
        <div class="system-status">NEURAL AGENTS REPOSITORY</div>
      </div>

      <button
        class="cyber-btn"
        :disabled="agentsStore.isLoading"
        @click="agentsStore.fetchAgents"
      >
        {{ agentsStore.isLoading ? 'REFRESHING...' : '🔄 REFRESH' }}
      </button>
    </header>

    <!-- Content -->
    <div class="agents-hub-content">
      <!-- Create New Agent Card -->
      <div class="create-agent-bar cyber-tile">
        <div class="cyber-form-group" style="display: flex; gap: 10px; width: 100%;">
          <input
            v-model="newAgentName"
            type="text"
            class="cyber-input flex-1"
            placeholder="Enter new agent name (e.g. security_auditor, devops_lead)..."
            @keydown.enter="handleCreateAgent"
          />
          <button
            class="cyber-btn cyber-btn--green"
            :disabled="isCreating || !newAgentName.trim()"
            @click="handleCreateAgent"
          >
            {{ isCreating ? 'CREATING...' : '+ CREATE AGENT' }}
          </button>
        </div>
      </div>

      <!-- Agents Grid -->
      <div v-if="agentsStore.agents.length > 0" class="agents-grid">
        <div
          v-for="agent in agentsStore.agents"
          :key="agent.id || String(agent)"
          class="agent-card cyber-tile"
        >
          <div class="agent-card-header">
            <div class="agent-icon">🤖</div>
            <div class="agent-info">
              <div class="agent-name cyber-text-glow">
                {{ (agent.name || agent.id || String(agent)).toUpperCase().replace(/_/g, ' ') }}
              </div>
              <div class="agent-id">// ID: {{ agent.id || String(agent) }}</div>
            </div>
            <span v-if="(agent.id || agent) === 'main_agent'" class="system-badge">DEFAULT</span>
          </div>

          <div class="agent-card-body">
            <p class="agent-desc">
              {{ agent.description || 'Custom specialized AI agent profile with sovereign knowledge base, prompts, and identity matrix.' }}
            </p>
          </div>

          <div class="agent-card-footer">
            <button
              class="cyber-btn cyber-btn--cyan cyber-btn--sm flex-1"
              @click="startChatWithAgent(agent)"
            >
              💬 START CHAT
            </button>
            <button
              class="cyber-btn cyber-btn--green cyber-btn--sm"
              title="Edit Prompts & Files"
              @click="openEditor(agent.id || String(agent))"
            >
              📝 EDIT
            </button>
            <button
              v-if="(agent.id || agent) !== 'main_agent' && (agent.id || agent) !== 'base-template' && (agent.id || agent) !== 'base_template'"
              class="cyber-btn cyber-btn--red cyber-btn--sm"
              title="Delete Agent"
              @click="handleDelete(agent.id || String(agent))"
            >
              🗑
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-agents-state">
        <div class="empty-icon">🤖</div>
        <div v-if="agentsStore.isLoading" class="empty-text">
          INITIALIZING AGENTS MATRIX...
        </div>
        <div v-else-if="agentsStore.fetchError" class="empty-text error-text">
          <div style="margin-bottom: 8px; color: #ff5555;">⚠️ {{ agentsStore.fetchError }}</div>
          <button class="cyber-btn cyber-btn--cyan cyber-btn--sm" @click="agentsStore.fetchAgents(0)">
            🔄 RETRY CONNECTION
          </button>
        </div>
        <div v-else class="empty-text">
          NO CUSTOM AGENTS FOUND. CREATE ONE ABOVE TO START.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agents-hub-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg-main, #070e17);
}

.agents-hub-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.create-agent-bar {
  padding: 16px 20px;
  background: rgba(13, 20, 36, 0.7);
  border: 1px solid rgba(0, 240, 255, 0.2);
  border-radius: 6px;
}

.flex-1 {
  flex: 1;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.agent-card {
  padding: 20px;
  background: rgba(13, 20, 36, 0.7);
  border: 1px solid rgba(0, 240, 255, 0.2);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  transition: transform 0.2s, border-color 0.2s;
}

.agent-card:hover {
  transform: translateY(-2px);
  border-color: var(--cyber-cyan-500, #00f0ff);
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-icon {
  font-size: 28px;
}

.agent-name {
  font-family: var(--font-mono, monospace);
  font-weight: bold;
  font-size: 14px;
  color: var(--cyber-cyan-300, #87eaf2);
}

.agent-id {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.system-badge {
  margin-left: auto;
  font-size: 9px;
  font-family: var(--font-mono, monospace);
  padding: 2px 6px;
  background: rgba(0, 240, 255, 0.15);
  border: 1px solid var(--cyber-cyan-500, #00f0ff);
  color: #00f0ff;
  border-radius: 3px;
}

.agent-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
  margin: 0;
}

.agent-card-footer {
  display: flex;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}
</style>
