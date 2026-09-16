import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface FileAttachment {
  name: string;
  url?: string;
  path?: string;
  size?: number;
  type?: string;
  file?: File;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent' | 'system';
  content: string;
  reasoning?: string | null;
  attachments?: FileAttachment[];
  timestamp?: number;
  isSystemInfo?: boolean;
  systemTitle?: string;
  systemDetails?: string | null;
  systemResult?: string | null;
  isSuccess?: boolean;
  icon?: string;
}

export interface SessionItem {
  id: string;
  title: string;
  agent_id?: string;
  created_at?: string;
  updated_at?: string;
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<SessionItem[]>([]);
  const currentSessionId = ref<string>('');
  const currentAgentId = ref<string>('main_agent');
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref<boolean>(false);
  const typingStatusText = ref<string>('AI IS THINKING...');
  const systemStatus = ref<string>('READY');
  const activeModelName = ref<string>('');
  const isSetupWarningVisible = ref<boolean>(false);

  let currentAbortController: AbortController | null = null;

  async function initialize() {
    await checkApiStatus();
    await fetchCurrentSession();
    await fetchSessions();
    if (sessions.value.length === 0 && currentSessionId.value) {
      sessions.value = [
        {
          id: currentSessionId.value,
          title: 'Main Chat',
          agent_id: currentAgentId.value || 'main_agent',
        },
      ];
    }
    await fetchHistory();
  }

  async function checkApiStatus() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const settings = await res.json();
        activeModelName.value = settings.aiDefaultModel || '';
        const hasKey = !!(
          settings.hasAiApiKey ||
          settings.aiProvider === 'local' ||
          (settings.aiProvider === 'openrouter' && settings.openrouterApiKey) ||
          (settings.aiProvider === 'custom' && settings.customApiKey) ||
          settings.apiKey ||
          settings.googleApiKey ||
          settings.anthropicApiKey ||
          settings.openaiApiKey
        );
        isSetupWarningVisible.value = !hasKey;
        systemStatus.value = hasKey ? 'READY' : 'PREVIEW MODE';
      }
    } catch {
      systemStatus.value = 'ONLINE';
    }
  }

  async function fetchSessions(retryCount = 0) {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        const raw = data.sessions || [];
        if (raw.length > 0) {
          sessions.value = raw.map((s: any) => ({
            id: s.id,
            title: s.title || s.id,
            agent_id: s.agent_id || 'main_agent',
            created_at: s.created_at,
            updated_at: s.updated_at,
          }));
        }
      } else if (retryCount < 3) {
        setTimeout(() => fetchSessions(retryCount + 1), 1200);
      }
    } catch (err) {
      if (retryCount < 3) {
        setTimeout(() => fetchSessions(retryCount + 1), 1200);
      }
    }
  }

  async function fetchCurrentSession(retryCount = 0) {
    try {
      const res = await fetch('/api/sessions/current');
      if (res.ok) {
        const data = await res.json();
        currentSessionId.value = data.sessionId;
        currentAgentId.value = data.agentId || 'main_agent';
      } else if (retryCount < 3) {
        setTimeout(() => fetchCurrentSession(retryCount + 1), 1200);
      }
    } catch (err) {
      if (retryCount < 3) {
        setTimeout(() => fetchCurrentSession(retryCount + 1), 1200);
      }
    }
  }

  async function switchSession(sessionId: string) {
    if (isLoading.value) return;
    try {
      const res = await fetch('/api/sessions/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        currentSessionId.value = data.sessionId;
        currentAgentId.value = data.agentId || 'main_agent';
        await fetchHistory();
      }
    } catch (err) {
      console.error('Failed to switch session:', err);
    }
  }

  async function createNewSession(agentId?: string) {
    if (isLoading.value) return;
    try {
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (res.ok) {
        const data = await res.json();
        currentSessionId.value = data.sessionId;
        currentAgentId.value = agentId || 'main_agent';
        messages.value = [];
        await fetchSessions();
      }
    } catch (err) {
      console.error('Failed to create new session:', err);
    }
  }

  async function deleteSession(id: string) {
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchSessions();
        if (currentSessionId.value === id) {
          if (sessions.value.length > 0) {
            await switchSession(sessions.value[0].id);
          } else {
            await createNewSession();
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }

  async function updateSessionTitle(id: string, title: string) {
    try {
      const res = await fetch(`/api/sessions/${id}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        await fetchSessions();
      }
    } catch (err) {
      console.error('Failed to update session title:', err);
    }
  }

  async function fetchHistory() {
    if (!currentSessionId.value) return;
    try {
      const res = await fetch('/api/chat/get_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId.value }),
      });
      if (res.ok) {
        const data = await res.json();
        messages.value = (data.history || []).map((msg: any, idx: number) => ({
          id: `hist_${idx}_${Date.now()}`,
          role: msg.role === 'assistant' ? 'agent' : msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          reasoning: msg.reasoning || null,
          attachments: msg.attachments || [],
          timestamp: msg.timestamp || Date.now(),
        }));
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }

  async function clearCurrentChat() {
    if (!currentSessionId.value) return;
    try {
      const res = await fetch('/api/chat/clear_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId.value }),
      });
      if (res.ok) {
        messages.value = [];
        addSystemMessage('Chat history cleared.', null, null, true, '🧹');
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  }

  async function purgeMemory() {
    try {
      const res = await fetch('/api/memory/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        addSystemMessage('System memory purged.', null, null, true, '💾');
      }
    } catch (err) {
      console.error('Failed to purge memory:', err);
    }
  }

  function addSystemMessage(
    title: string,
    details: string | null = null,
    result: string | null = null,
    isSuccess: boolean = false,
    icon: string = '⚙️'
  ) {
    messages.value.push({
      id: `sys_${Date.now()}_${Math.random()}`,
      role: 'system',
      isSystemInfo: true,
      content: '',
      systemTitle: title,
      systemDetails: details,
      systemResult: result,
      isSuccess,
      icon,
      timestamp: Date.now(),
    });
  }

  async function uploadFiles(files: File[]): Promise<any[]> {
    const uploadedFiles: any[] = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (currentSessionId.value) {
          formData.append('sessionId', currentSessionId.value);
        }
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.file) {
            uploadedFiles.push(json.file);
          }
        }
      } catch (err) {
        console.error('Upload failed for file:', file.name, err);
      }
    }
    return uploadedFiles;
  }

  async function sendMessage(
    text: string,
    filesToUpload: File[] = [],
    imageDataUrl: string | null = null
  ) {
    if ((!text.trim() && filesToUpload.length === 0 && !imageDataUrl) || isLoading.value) return;

    isLoading.value = true;
    typingStatusText.value = 'AI IS THINKING...';

    // 1. Upload files
    let uploadedFiles: any[] = [];
    if (filesToUpload.length > 0) {
      uploadedFiles = await uploadFiles(filesToUpload);
    }

    // 2. Add user message
    messages.value.push({
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      attachments: [
        ...(imageDataUrl ? [{ name: 'Image', url: imageDataUrl, type: 'image' }] : []),
        ...uploadedFiles,
      ],
      timestamp: Date.now(),
    });

    // 3. Initiate SSE Streaming
    currentAbortController = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: currentAbortController.signal,
        body: JSON.stringify({
          message: text,
          sessionId: currentSessionId.value,
          image: imageDataUrl,
          files: uploadedFiles,
        }),
      });

      if (!response.ok) {
        throw new Error('Neural transmission failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // Trigger pet animation
      triggerPetState('thinking');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event:\s*(.+)$/m);
          const dataMatch = line.match(/^data:\s*(.+)$/m);

          if (eventMatch && dataMatch) {
            const eventName = eventMatch[1].trim();
            let eventData: any = null;
            try {
              eventData = JSON.parse(dataMatch[1].trim());
            } catch {
              continue;
            }
            handleSSEEvent(eventName, eventData);
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || currentAbortController?.signal?.aborted) {
        addSystemMessage('AI Generation Stopped', null, 'Process was cancelled by user.', true, '🛑');
      } else {
        console.error('Chat error:', error);
        messages.value.push({
          id: `err_${Date.now()}`,
          role: 'agent',
          content: '⚠️ NEURAL INTERFACE ERROR. Retry transmission.',
          timestamp: Date.now(),
        });
        triggerPetState('error');
      }
    } finally {
      isLoading.value = false;
      currentAbortController = null;
      typingStatusText.value = 'AI IS THINKING...';
      triggerPetState('idle');
      await fetchSessions();
    }
  }

  function handleSSEEvent(eventName: string, eventData: any) {
    if (eventName === 'tool_start') {
      const toolName = eventData.name;
      const args = eventData.arguments || {};
      let detailText = '';

      if (
        toolName === 'write_file' ||
        toolName === 'read_file' ||
        toolName === 'delete_item' ||
        toolName === 'get_file_info' ||
        toolName === 'generate_pdf'
      ) {
        detailText = `Path: ${args.path || ''}`;
      } else if (toolName === 'move_or_rename') {
        detailText = `From: ${args.source || ''} -> To: ${args.destination || ''}`;
      } else if (toolName === 'fetch_web_page') {
        detailText = `URL: ${args.url || ''}`;
      } else if (toolName === 'generate_image') {
        detailText = `Prompt: ${args.prompt || ''}`;
      } else if (toolName === 'save_memory' || toolName === 'delete_memory') {
        detailText = `Key: ${args.key || ''}`;
      } else {
        detailText = JSON.stringify(args);
      }

      const isPlan =
        toolName === 'write_file' && typeof args.path === 'string' && /plan\.md$/i.test(args.path);
      const titleText = isPlan
        ? 'Tool execution started: Planning'
        : `Tool execution started: ${toolName}`;
      const toolIcon = isPlan ? '📋' : '⚙️';

      typingStatusText.value = isPlan
        ? 'PLANNING PROJECT (PLAN.MD)...'
        : `EXECUTING TOOL: ${toolName.toUpperCase()}...`;

      addSystemMessage(titleText, detailText, null, false, toolIcon);
    } else if (eventName === 'tool_done') {
      const toolName = eventData.name;
      let resultText = '';

      if (typeof eventData.result === 'string') {
        resultText = eventData.result;
      } else {
        resultText = JSON.stringify(eventData.result, null, 2);
      }

      if (resultText && resultText.length > 250) {
        resultText = resultText.substring(0, 250) + '\n... [TRUNCATED]';
      }

      const isPlan =
        toolName === 'write_file' && resultText && /plan/i.test(resultText);
      const titleDoneText = isPlan
        ? 'Tool completed: Planning'
        : `Tool completed: ${toolName}`;
      const toolDoneIcon = isPlan ? '📋' : '⚙️';

      typingStatusText.value = isPlan
        ? 'PLANNING COMPLETED'
        : `TOOL ${toolName.toUpperCase()} COMPLETED`;

      addSystemMessage(titleDoneText, null, `Result: ${resultText}`, true, toolDoneIcon);
    } else if (eventName === 'skills_loaded') {
      const skills = eventData.skills || [];
      if (skills.length > 0) {
        addSystemMessage(`Active skills loaded: ${skills.join(', ')}`, null, null, false, '💡');
      }
    } else if (eventName === 'final') {
      messages.value.push({
        id: `agent_${Date.now()}`,
        role: 'agent',
        content: eventData.message || '',
        reasoning: eventData.reasoning || null,
        timestamp: Date.now(),
      });
      triggerPetState('happy');
    }
  }

  async function stopGeneration() {
    if (!isLoading.value) return;

    if (currentAbortController) {
      try {
        currentAbortController.abort();
      } catch {}
    }

    try {
      await fetch('/api/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId.value }),
      });
    } catch {}

    isLoading.value = false;
    currentAbortController = null;
    typingStatusText.value = 'AI IS THINKING...';
    triggerPetState('idle');
    addSystemMessage('AI Generation Stopped', null, 'Process was cancelled by user.', true, '🛑');
  }

  async function openWorkspaceFolder() {
    try {
      const res = await fetch('/api/workspace/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to open workspace');
      }
    } catch (err: any) {
      alert(`Could not open workspace: ${err.message}`);
    }
  }

  function triggerPetState(state: string) {
    window.dispatchEvent(new CustomEvent('pet-state-change', { detail: { state } }));
  }

  return {
    sessions,
    currentSessionId,
    currentAgentId,
    messages,
    isLoading,
    typingStatusText,
    systemStatus,
    isSetupWarningVisible,
    initialize,
    fetchSessions,
    switchSession,
    createNewSession,
    deleteSession,
    updateSessionTitle,
    clearCurrentChat,
    purgeMemory,
    sendMessage,
    stopGeneration,
    openWorkspaceFolder,
  };
});
