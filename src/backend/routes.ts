/**
 * routes.ts - API routes
 * Author: Norayr Petrosyan
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { ChatManager } from './ai/ChatManager.js';
import { AgentService } from './ai/AgentService.js';
import { config } from './config.js';
import { TaskService } from './services/TaskService.js';
import { SettingsService, UpdateSettingsDto } from './services/SettingsService.js';
import { FileSystemManager, UploadedFileInfo } from './services/FileSystemManager.js';
import { openRouterService } from './services/OpenRouterService.js';

export type { UploadedFileInfo };

/**
 * Types for chat request body
 */
interface ChatRequestBody {
  message: string;
  sessionId?: string;
  image?: string;
  files?: UploadedFileInfo[];
}

interface ClearHistoryRequestBody {
  sessionId: string;
}

/**
 * Register all API routes
 * @param app - Fastify instance
 * @param chatManager - chat manager
 * @param agentService - agent service
 * @param taskService - task service
 * @param settingsService - settings service
 * @param fsManager - file system manager
 */
export async function registerRoutes(
  app: FastifyInstance,
  chatManager: ChatManager,
  agentService: AgentService,
  taskService: TaskService,
  settingsService: SettingsService,
  fsManager: FileSystemManager
): Promise<void> {

  // Main chat template route
  app.get('/', async (_request, reply) => {
    return reply.view('chat.ejs');
  });

  // Render system settings page
  app.get('/settings', async (_request, reply) => {
    return reply.view('settings.ejs');
  });

  // Render task management page
  app.get('/tasks', async (_request, reply) => {
    return reply.view('tasks.ejs');
  });

  // Get all tasks
  app.get('/api/tasks', async (_request, reply) => {
    const tasks = await taskService.getAllTasks();
    return reply.send({ tasks });
  });

  // Create a new task
  app.post('/api/tasks', async (request: FastifyRequest<{ Body: { title: string, status?: 'ready' | 'done' | 'running' | 'failed', run_at?: string, is_auto?: boolean, repeat_interval?: number, cron_expression?: string } }>, reply: FastifyReply) => {
    const { title, status, run_at, is_auto, repeat_interval, cron_expression } = request.body;
    if (!title || typeof title !== 'string') {
      return reply.status(400).send({ success: false, message: 'Invalid title' });
    }

    try {
      const taskId = await taskService.createTask({
        title,
        status,
        run_at: run_at || undefined,
        is_auto: is_auto ? 1 : 0,
        repeat_interval: repeat_interval !== undefined ? repeat_interval : undefined,
        cron_expression: cron_expression || undefined
      });
      return reply.send({ success: true, taskId, message: 'Task created successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create task');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to create task' });
    }
  });

  // Update a task
  app.put('/api/tasks/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: { title?: string, status?: 'ready' | 'done' | 'running' | 'failed', result?: string, run_at?: string, is_auto?: boolean, repeat_interval?: number | null, cron_expression?: string | null } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ success: false, message: 'Invalid task ID' });
    }

    const { title, status, result, run_at, is_auto, repeat_interval, cron_expression } = request.body;

    try {
      const existing = await taskService.getTaskById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, message: 'Task not found' });
      }

      await taskService.updateTask(id, {
        title,
        status,
        result,
        run_at: run_at === '' ? undefined : run_at,
        is_auto: is_auto !== undefined ? (is_auto ? 1 : 0) : undefined,
        repeat_interval,
        cron_expression
      });
      return reply.send({ success: true, message: 'Task updated successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update task');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to update task' });
    }
  });

  // Delete a task
  app.delete('/api/tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ success: false, message: 'Invalid task ID' });
    }

    try {
      const existing = await taskService.getTaskById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, message: 'Task not found' });
      }

      await taskService.deleteTask(id);
      return reply.send({ success: true, message: 'Task deleted successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete task');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to delete task' });
    }
  });

  // Run ready tasks in background
  app.post('/api/tasks/run', async (_request, reply) => {
    const result = await taskService.triggerReadyTasks();
    return reply.send(result);
  });

  // Render agent editor page
  app.get('/edit-agent/:agentId', async (request: FastifyRequest<{ Params: { agentId: string } }>, reply: FastifyReply) => {
    const { agentId } = request.params;

    const exists = await agentService.agentExists(agentId);
    if (!exists) {
      return reply.status(404).send('Agent not found');
    }

    const files = await agentService.getAgentFiles(agentId);
    return reply.view('edit_agent.ejs', { agentId, files });
  });

  // Save agent files
  app.post('/api/agents/:id/files', async (request: FastifyRequest<{ Params: { id: string }, Body: { files: Record<string, string> } }>, reply: FastifyReply) => {
    const agentId = request.params.id;
    const { files } = request.body;

    const exists = await agentService.agentExists(agentId);
    if (!exists) {
      return reply.status(404).send({ success: false, message: 'Agent not found' });
    }

    if (!files || typeof files !== 'object') {
      return reply.status(400).send({ success: false, message: 'Invalid files payload' });
    }

    try {
      await agentService.saveAgentFiles(agentId, files);
      return reply.send({ success: true, message: 'Agent files updated successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to save agent files');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to save agent files' });
    }
  });

  // Health check
  app.get('/api/health', async (_request, _reply) => {
    return { status: 'ok', message: 'System initialized', timestamp: new Date().toISOString() };
  });

  // Get list of available agents
  app.get('/api/agents', async (_request, _reply) => {
    const agents = await agentService.getAvailableAgents();
    return _reply.send({ agents });
  });

  // Create new agent profile
  app.post('/api/agents/create', async (request: FastifyRequest<{ Body: { agentId: string } }>, reply: FastifyReply) => {
    const { agentId } = request.body;
    if (!agentId || typeof agentId !== 'string') {
      return reply.status(400).send({ success: false, message: 'Invalid agentId' });
    }

    try {
      await agentService.createAgent(agentId);
      return reply.send({ success: true, message: 'Agent created successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create agent');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to create agent' });
    }
  });

  // Delete agent profile
  app.delete('/api/agents/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const agentId = request.params.id;
    if (agentId === 'main_agent' || agentId === 'base-template' || agentId === 'base_template') {
      return reply.status(400).send({ success: false, message: 'Cannot delete system agent or base template' });
    }

    try {
      await agentService.deleteAgent(agentId);
      // Update database sessions referencing this agent to fallback to main_agent
      await chatManager.updateSessionsAgent(agentId, 'main_agent');
      return reply.send({ success: true, message: 'Agent deleted successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete agent');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to delete agent' });
    }
  });

  // File upload route (supports txt, pdf, excel, word, images, etc.)
  app.post('/api/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ success: false, message: 'No file provided' });
      }

      const requestedSessionId = request.sessionId || (data.fields?.sessionId as any)?.value || 'session_global';
      const buffer = await data.toBuffer();
      const fileInfo = await fsManager.saveUploadedFile(
        requestedSessionId,
        data.filename,
        buffer,
        data.mimetype
      );

      return reply.send({
        success: true,
        file: fileInfo
      });
    } catch (err: any) {
      request.log.error({ err }, 'File upload failed');
      return reply.status(500).send({ success: false, message: err?.message || 'File upload failed' });
    }
  });

  // Chat with agent (Streaming via Server-Sent Events)
  app.post('/api/chat', async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
    const { message, image, files } = request.body;
    const sessionId = request.sessionId;
    //request.log.info({ message, sessionId, hasImage: !!image, filesCount: files?.length || 0 }, 'Chat request (stream)');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let isStreamFinished = false;
    const handleClientClose = () => {
      if (!isStreamFinished && !reply.raw.writableEnded) {
        chatManager.stopSession(sessionId);
      }
    };
    reply.raw.on('close', handleClientClose);

    try {
      const response = await chatManager.sendMessage(message, sessionId, image, (event, data) => {
        sendEvent(event, data);
      }, files);
      sendEvent('final', {
        message: response.content,
        reasoning: response.reasoning
      });
    } catch (error) {
      request.log.error({ err: error }, 'Chat stream error');
      sendEvent('error', {
        message: error instanceof Error ? error.message : 'Internal Server Error'
      });
    } finally {
      isStreamFinished = true;
      reply.raw.off('close', handleClientClose);
      reply.raw.end();
    }
  });

  // Stop active AI chat generation
  app.post('/api/chat/stop', async (request: FastifyRequest<{ Body: { sessionId?: string } }>, reply: FastifyReply) => {
    const sessionId = request.body?.sessionId || request.sessionId;
    const stopped = chatManager.stopSession(sessionId);
    return reply.send({
      success: true,
      stopped,
      message: stopped ? 'AI generation stopped successfully.' : 'No active generation found for session.'
    });
  });

  app.get('/api/sessions', async (_request, _reply) => {
    const sessions = await chatManager.getAllSessions();
    return _reply.send({ sessions });
  });

  app.post('/api/chat/get_history', async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
    const sessionId = request.body.sessionId || request.sessionId;
    //request.log.info({ sessionId }, 'Get history request');
    const history = await chatManager.getHistory(sessionId);
    return reply.send({ history });
  });

  // route clear chat history
  app.post('/api/chat/clear_history', async (request: FastifyRequest<{ Body: ClearHistoryRequestBody }>, reply: FastifyReply) => {
    const sessionId = request.body.sessionId || request.sessionId;
    await chatManager.clearHistory(sessionId);
    return reply.send({ success: true, message: 'Chat history cleared' });
  });

  // Clear memory route
  app.post('/api/memory/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.sessionId;
    await chatManager.clearMemory(sessionId);
    return reply.send({ success: true, message: 'Memory cleared' });
  });

  // Create new session
  app.post('/api/sessions/create', async (request: FastifyRequest<{ Body: { agentId?: string } }>, reply: FastifyReply) => {
    const { agentId } = request.body || {};
    const sessionId = 'session_' + crypto.randomUUID();
    await chatManager.createSession(sessionId, agentId);

    reply.setCookie('sessionId', sessionId, {
      path: '/',
      maxAge: 86400000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.ENV === 'production'
    });

    return reply.send({ success: true, sessionId });
  });

  // Get current session
  app.get('/api/sessions/current', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await chatManager.getSession(request.sessionId);
    return reply.send({ sessionId: request.sessionId, agentId: session?.agent_id || 'main_agent' });
  });

  // Switch to existing session
  app.post('/api/sessions/switch', async (request: FastifyRequest<{ Body: { sessionId: string } }>, reply: FastifyReply) => {
    const { sessionId } = request.body;

    const session = await chatManager.getSession(sessionId);
    if (!session) {
      return reply.status(404).send({ success: false, message: 'Session not found' });
    }

    reply.setCookie('sessionId', sessionId, {
      path: '/',
      maxAge: 86400000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.ENV === 'production'
    });

    return reply.send({ success: true, sessionId, agentId: session.agent_id || 'main_agent' });
  });

  // Delete session
  app.delete('/api/sessions/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    await chatManager.deleteSession(id);
    return reply.send({ success: true, message: 'Session deleted' });
  });

  // Update session title
  app.put('/api/sessions/:id/title', async (request: FastifyRequest<{ Params: { id: string }, Body: { title: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { title } = request.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return reply.status(400).send({ success: false, message: 'Invalid title' });
    }

    try {
      await chatManager.updateSessionTitle(id, title.trim());
      return reply.send({ success: true, message: 'Session title updated successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update session title');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to update session title' });
    }
  });

  // Get system settings
  app.get('/api/settings', async (_request, reply) => {
    return reply.send(settingsService.getPublicSettings());
  });

  // Get OpenRouter live models with pricing
  app.get('/api/ai/openrouter-models', async (_request, reply) => {
    try {
      const models = await openRouterService.getModels();
      return reply.send({ success: true, models });
    } catch (err) {
      return reply.status(500).send({ success: false, message: 'Failed to fetch OpenRouter models', models: [] });
    }
  });

  // Save system settings
  app.post('/api/settings', async (request: FastifyRequest<{ Body: UpdateSettingsDto }>, reply: FastifyReply) => {
    try {
      await settingsService.saveSettings(request.body);
      return reply.send({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to save system settings');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to save settings' });
    }
  });

  // Open workspace directory in OS File Explorer / Finder
  const openWorkspaceHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const workspacePath = await fsManager.openWorkspaceInExplorer();
      return reply.send({ success: true, path: workspacePath });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to open workspace directory');
      return reply.status(500).send({ success: false, message: err?.message || 'Failed to open workspace' });
    }
  };

  app.post('/api/workspace/open', openWorkspaceHandler);
  app.get('/api/workspace/open', openWorkspaceHandler);

}
