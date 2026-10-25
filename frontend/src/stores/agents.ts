import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface AgentItem {
  id: string;
  name?: string;
  description?: string;
  is_active?: boolean;
}

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<AgentItem[]>([]);
  const isLoading = ref<boolean>(false);
  const fetchError = ref<string | null>(null);
  const currentAgentFiles = ref<Record<string, string>>({});
  const isSavingFiles = ref<boolean>(false);

  async function fetchAgents(retryCount = 0) {
    isLoading.value = true;
    if (retryCount === 0) {
      fetchError.value = null;
    }
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        agents.value = (data.agents || []).map((a: any) => {
          if (typeof a === 'string') {
            return {
              id: a,
              name: a.toUpperCase().replace(/_/g, ' '),
              description: 'Custom specialized AI agent persona with dedicated prompts and memory.',
            };
          }
          return {
            id: a.id,
            name: (a.name || a.id).toUpperCase().replace(/_/g, ' '),
            description: a.description || 'Custom specialized AI agent persona with dedicated prompts and memory.',
          };
        });
        fetchError.value = null;
        isLoading.value = false;
      } else {
        if (retryCount < 5) {
          setTimeout(() => fetchAgents(retryCount + 1), 1000);
        } else {
          fetchError.value = `HTTP ${res.status}: Failed to load agents`;
          isLoading.value = false;
        }
      }
    } catch (err: any) {
      if (retryCount < 5) {
        setTimeout(() => fetchAgents(retryCount + 1), 1000);
      } else {
        fetchError.value = err?.message || 'Network error';
        isLoading.value = false;
      }
    }
  }

  async function createAgent(agentId: string) {
    const res = await fetch('/api/agents/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create agent');
    }
    await fetchAgents();
  }

  async function deleteAgent(agentId: string) {
    const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete agent');
    }
    await fetchAgents();
  }

  async function fetchAgentFiles(agentId: string) {
    isLoading.value = true;
    try {
      const res = await fetch(`/api/agents/${agentId}/files`);
      if (res.ok) {
        const data = await res.json();
        currentAgentFiles.value = data.files || {};
      } else {
        throw new Error('Failed to load agent files');
      }
    } catch (err) {
      console.error('Failed to load agent files:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveAgentFiles(agentId: string, files: Record<string, string>) {
    isSavingFiles.value = true;
    try {
      const res = await fetch(`/api/agents/${agentId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save agent files');
      }
      currentAgentFiles.value = { ...files };
    } finally {
      isSavingFiles.value = false;
    }
  }

  return {
    agents,
    isLoading,
    fetchError,
    currentAgentFiles,
    isSavingFiles,
    fetchAgents,
    createAgent,
    deleteAgent,
    fetchAgentFiles,
    saveAgentFiles,
  };
});
