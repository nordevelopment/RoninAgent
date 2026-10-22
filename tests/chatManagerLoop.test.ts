import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChatManager } from '../backend/ai/ChatManager.js';
import { AIClient, type AIMessages, type ContextWindowReport, type ContextWindowRequest } from '../backend/ai/AIClient.js';
import { ChatHistoryManager } from '../backend/ai/ChatHistoryManager.js';
import { SessionManager } from '../backend/ai/SessionManager.js';
import { MemoryManager } from '../backend/ai/MemoryManager.js';
import { AITools } from '../backend/ai/AITools.js';
import { DatabaseClient } from '../backend/database/DatabaseClient.js';
import { FileSystemManager } from '../backend/services/FileSystemManager.js';
import { WebPageContent } from '../backend/services/WebPageContent.js';
import { OfficeDocumentService } from '../backend/services/OfficeDocumentService.js';
import path from 'path';
import { config } from '../backend/config.js';

describe('ChatManager Multi-Step Tool Execution Loop', () => {
  it('successfully completes a multi-step loop: tool call -> tool result -> final answer', async () => {
    const db = new DatabaseClient(':memory:');
    await db.initialize();

    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);

    const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
    const webPage = new WebPageContent();
    const officeService = new OfficeDocumentService();
    const tools = new AITools(fsManager, webPage, officeService, memoryManager);

    const sessionId = 'test_loop_session_' + Date.now();
    await sessionManager.createSession(sessionId);

    const chatManager = new ChatManager({
      aiClient,
      historyManager,
      tools,
      memoryManager,
      sessionManager
    });

    let callCount = 0;
    const progressEvents: string[] = [];

    // Mock AIClient:
    // Turn 1: Returns a tool call (write_file)
    // Turn 2: Receives the tool result and returns final answer
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages) => {
      // Handle background session auto-rename request
      if (typeof messages[0]?.content === 'string' && messages[0].content.includes('generate a short, descriptive title')) {
        return { content: 'Containment Test' };
      }

      callCount++;
      if (callCount === 1) {
        return {
          content: 'I need to write a log file first.',
          toolCalls: [
            {
              id: 'call_test_123',
              type: 'function',
              function: {
                name: 'write_file',
                arguments: JSON.stringify({
                  path: `${sessionId}/test_journal.md`,
                  content: '# Test Journal Entry'
                })
              }
            }
          ]
        };
      } else {
        // Verify that Turn 2 includes the tool result message in history
        const lastMsg = messages[messages.length - 1];
        expect(lastMsg.role).toBe('tool');
        expect(lastMsg.tool_call_id).toBe('call_test_123');

        return {
          content: 'Log file written. I am ready.',
          toolCalls: []
        };
      }
    });

    const response = await chatManager.sendMessage(
      'Initialize containment check',
      sessionId,
      undefined,
      async (event) => {
        progressEvents.push(event);
      }
    );

    // Verify response
    expect(response.content).toBe('Log file written. I am ready.');
    expect(callCount).toBe(2);

    // Verify progress events were emitted
    expect(progressEvents).toContain('tool_start');
    expect(progressEvents).toContain('tool_done');

    // Verify history in DB
    const history = await historyManager.getHistory(sessionId);
    expect(history.length).toBe(4);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
    expect(history[1].tool_calls).toBeDefined();
    expect(history[2].role).toBe('tool');
    expect(history[2].tool_call_id).toBe('call_test_123');
    expect(history[3].role).toBe('assistant');
    expect(history[3].content).toBe('Log file written. I am ready.');

    // Clean up created file
    try {
      await fsManager.deleteDirectory(sessionId, true);
    } catch {}
  });

  it('handles tool execution errors gracefully and forwards them to AI in the next step', async () => {
    const db = new DatabaseClient(':memory:');
    await db.initialize();

    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);

    const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
    const webPage = new WebPageContent();
    const officeService = new OfficeDocumentService();
    const tools = new AITools(fsManager, webPage, officeService, memoryManager);

    const sessionId = 'test_error_session_' + Date.now();
    await sessionManager.createSession(sessionId);

    const chatManager = new ChatManager({
      aiClient,
      historyManager,
      tools,
      memoryManager,
      sessionManager
    });

    let callCount = 0;

    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages) => {
      // Handle background session auto-rename request
      if (typeof messages[0]?.content === 'string' && messages[0].content.includes('generate a short, descriptive title')) {
        return { content: 'Error Test' };
      }

      callCount++;
      if (callCount === 1) {
        return {
          content: 'Trying to read a missing file.',
          toolCalls: [
            {
              id: 'call_err_456',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: 'non_existent_file.txt' })
              }
            }
          ]
        };
      } else {
        const lastMsg = messages[messages.length - 1];
        expect(lastMsg.role).toBe('tool');
        expect(lastMsg.content).toContain('Error executing tool');

        return {
          content: 'File not found. Moving to plan B.',
          toolCalls: []
        };
      }
    });

    const response = await chatManager.sendMessage('Read file test', sessionId);
    expect(response.content).toBe('File not found. Moving to plan B.');
    expect(callCount).toBe(2);

    const history = await historyManager.getHistory(sessionId);
    expect(history.length).toBe(4);
    expect(history[2].role).toBe('tool');
  });

  it('returns an AI error to the caller but does not store it in history (overflow persists after the retry)', async () => {
    const db = new DatabaseClient(':memory:');
    await db.initialize();

    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);

    const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
    const tools = new AITools(fsManager, new WebPageContent(), new OfficeDocumentService(), memoryManager);

    const sessionId = 'test_api_error_session_' + Date.now();
    await sessionManager.createSession(sessionId);

    const chatManager = new ChatManager({ aiClient, historyManager, tools, memoryManager, sessionManager });

    let callCount = 0;
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages) => {
      if (typeof messages[0]?.content === 'string' && messages[0].content.includes('generate a short, descriptive title')) {
        return { content: 'Unused' };
      }

      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          toolCalls: [
            {
              id: 'call_err_789',
              type: 'function',
              function: { name: 'read_file', arguments: JSON.stringify({ path: 'non_existent_file.txt' }) }
            }
          ]
        };
      }
      return {
        content: 'Error: AI response maximum context length exceeded',
        error: { kind: 'context_overflow', message: 'maximum context length exceeded', status: 400 }
      };
    });

    const response = await chatManager.sendMessage('Read file test', sessionId);
    expect(response.content).toBe('Error: AI response maximum context length exceeded');
    expect(response.error?.kind).toBe('context_overflow');
    // tool step + overflow + one aggressive retry
    expect(callCount).toBe(3);

    // user + assistant(tool_calls) + tool; the failed step leaves no assistant message behind
    const history = await historyManager.getHistory(sessionId);
    expect(history.map(m => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(history.some(m => typeof m.content === 'string' && m.content.startsWith('Error: AI response'))).toBe(false);
  });
});

describe('ChatManager context window', () => {
  async function setup(prefix: string) {
    const db = new DatabaseClient(':memory:');
    await db.initialize();
    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);
    const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
    const tools = new AITools(fsManager, new WebPageContent(), new OfficeDocumentService(), memoryManager);
    const sessionId = `${prefix}_${Date.now()}`;
    await sessionManager.createSession(sessionId);
    const chatManager = new ChatManager({ aiClient, historyManager, tools, memoryManager, sessionManager });
    return { aiClient, historyManager, chatManager, sessionId };
  }

  const isTitleRequest = (messages: AIMessages[]) =>
    typeof messages[0]?.content === 'string' && messages[0].content.includes('generate a short, descriptive title');

  const context = (elideToolResultsBeforeId: number): ContextWindowReport => ({
    state: { model: 'm', elideToolResultsBeforeId, elideImagesBeforeId: 0, dropTurnsBeforeId: 0 },
    roughTokens: 5_000,
    estimatedTokens: 5_000,
    budget: 10_000,
    overBudget: false
  });

  it('sends the full stored history with ids and asks AIClient to fit it', async () => {
    const { aiClient, historyManager, chatManager, sessionId } = await setup('test_full_history');
    for (let i = 0; i < 40; i++) {
      await historyManager.addMessage(sessionId, { role: i % 2 === 0 ? 'user' : 'assistant', content: `old ${i}` });
    }

    const calls: { messages: AIMessages[]; contextWindow?: ContextWindowRequest }[] = [];
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages, _a, _t, _s, _k, _sig, _r, options) => {
      if (isTitleRequest(messages)) return { content: 'Unused' };
      calls.push({ messages, contextWindow: options?.contextWindow });
      return { content: 'done' };
    });

    await chatManager.sendMessage('new question', sessionId);
    expect(calls).toHaveLength(1);
    expect(calls[0].messages).toHaveLength(41);
    expect(calls[0].messages.every(m => typeof (m as { id?: unknown }).id === 'number')).toBe(true);
    expect(calls[0].contextWindow).toEqual({ state: undefined });
  });

  it('retries once in aggressive mode after a context overflow and continues', async () => {
    const { aiClient, historyManager, chatManager, sessionId } = await setup('test_overflow_retry');

    const requests: (ContextWindowRequest | undefined)[] = [];
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages, _a, _t, _s, _k, _sig, _r, options) => {
      if (isTitleRequest(messages)) return { content: 'Unused' };
      requests.push(options?.contextWindow);
      if (requests.length === 1) {
        return {
          content: 'Error: AI response prompt is too long',
          error: { kind: 'context_overflow', message: 'prompt is too long', status: 400 },
          context: context(3)
        };
      }
      return { content: 'Fitted answer', usage: { promptTokens: 4_000, completionTokens: 10 }, context: context(7) };
    });

    const response = await chatManager.sendMessage('long task', sessionId);
    expect(response.content).toBe('Fitted answer');
    expect(response.error).toBeUndefined();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.aggressive).toBe(true);
    // The retry starts from the watermarks of the failed fit, without a stale anchor
    expect(requests[1]?.state).toEqual(context(3).state);

    const history = await historyManager.getHistory(sessionId);
    expect(history.map(m => m.content)).toEqual(['long task', 'Fitted answer']);
  });

  it('keeps watermarks and anchors the next estimate on the provider prompt_tokens', async () => {
    const { aiClient, chatManager, sessionId } = await setup('test_anchor');

    const requests: (ContextWindowRequest | undefined)[] = [];
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages, _a, _t, _s, _k, _sig, _r, options) => {
      if (isTitleRequest(messages)) return { content: 'Unused' };
      requests.push(options?.contextWindow);
      return { content: 'ok', usage: { promptTokens: 4_321, completionTokens: 5 }, context: context(5) };
    });

    await chatManager.sendMessage('first', sessionId);
    await chatManager.sendMessage('second', sessionId);
    expect(requests[1]?.state).toEqual({
      ...context(5).state,
      anchor: { roughTokens: 5_000, actualPromptTokens: 4_321 }
    });

    await chatManager.clearHistory(sessionId);
    await chatManager.sendMessage('after clear', sessionId);
    expect(requests[2]?.state).toBeUndefined();
  });
});

describe('ChatManager step limit and loop detector', () => {
  async function setup(prefix: string) {
    const db = new DatabaseClient(':memory:');
    await db.initialize();
    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);
    const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
    const tools = new AITools(fsManager, new WebPageContent(), new OfficeDocumentService(), memoryManager);
    const sessionId = `${prefix}_${Date.now()}`;
    await sessionManager.createSession(sessionId);
    const chatManager = new ChatManager({ aiClient, historyManager, tools, memoryManager, sessionManager });
    return { aiClient, historyManager, tools, chatManager, sessionId };
  }

  const isTitleRequest = (messages: AIMessages[]) =>
    typeof messages[0]?.content === 'string' && messages[0].content.includes('generate a short, descriptive title');

  const readFileCall = (id: string, args: Record<string, unknown>) => ({
    id,
    type: 'function' as const,
    function: { name: 'read_file', arguments: JSON.stringify(args) }
  });

  const originalMaxSteps = config.AI_MAX_THINKING_STEPS;
  afterEach(() => {
    config.AI_MAX_THINKING_STEPS = originalMaxSteps;
  });

  it('blocks a call that already returned the same result twice', async () => {
    const { aiClient, historyManager, tools, chatManager, sessionId } = await setup('test_loop_block');
    const executeSpy = vi.spyOn(tools, 'executeTool').mockResolvedValue({ name: 'read_file', result: { content: 'same' } });

    let step = 0;
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages) => {
      if (isTitleRequest(messages)) return { content: 'Unused' };
      step++;
      if (step <= 4) {
        // Same arguments with a different key order still count as the same call
        const args = step % 2 === 0 ? { path: 'a.txt', encoding: 'utf8' } : { encoding: 'utf8', path: 'a.txt' };
        return { content: '', toolCalls: [readFileCall(`call_${step}`, args)] };
      }
      return { content: 'Done' };
    });

    const response = await chatManager.sendMessage('read a.txt', sessionId);
    expect(response.content).toBe('Done');
    expect(executeSpy).toHaveBeenCalledTimes(2);

    const toolResults = (await historyManager.getHistory(sessionId)).filter(m => m.role === 'tool');
    expect(toolResults).toHaveLength(4);
    expect(toolResults[2].content).toContain('You already called read_file with the same arguments 2 times');
    expect(toolResults[3].content).toContain('You already called read_file');
  });

  it('does not block a repeated call whose result changes', async () => {
    const { aiClient, tools, chatManager, sessionId } = await setup('test_loop_changing');
    let version = 0;
    const executeSpy = vi.spyOn(tools, 'executeTool').mockImplementation(async () => ({ name: 'read_file', result: { content: `v${++version}` } }));

    let step = 0;
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages) => {
      if (isTitleRequest(messages)) return { content: 'Unused' };
      step++;
      if (step <= 4) {
        return { content: '', toolCalls: [readFileCall(`call_${step}`, { path: 'a.txt' })] };
      }
      return { content: 'Done' };
    });

    await chatManager.sendMessage('watch a.txt', sessionId);
    expect(executeSpy).toHaveBeenCalledTimes(4);
  });

  it('asks for a summary without tool calls at the step limit and stores it', async () => {
    config.AI_MAX_THINKING_STEPS = 3;
    const { aiClient, historyManager, tools, chatManager, sessionId } = await setup('test_step_limit');
    vi.spyOn(tools, 'executeTool').mockImplementation(async (toolCall) => ({ name: toolCall.name, result: { content: String(toolCall.arguments.path) } }));

    const requests: { system?: string; toolChoice?: string; tools?: unknown[] }[] = [];
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages, _a, tools, system, _k, _sig, _r, options) => {
      if (isTitleRequest(messages)) return { content: 'Unused' };
      requests.push({ system, toolChoice: options?.toolChoice, tools });
      if (options?.toolChoice === 'none') {
        // A provider that ignores tool_choice must not leave unanswered tool calls in history
        return { content: 'Read 3 of 5 files. Left: d.txt, e.txt. Say "continue".', toolCalls: [readFileCall('ignored', { path: 'x' })] };
      }
      return { content: '', toolCalls: [readFileCall(`call_${requests.length}`, { path: `${requests.length}.txt` })] };
    });

    const response = await chatManager.sendMessage('read five files', sessionId);
    expect(response.content).toBe('Read 3 of 5 files. Left: d.txt, e.txt. Say "continue".');
    expect(requests).toHaveLength(4);
    expect(requests.slice(0, 3).every(r => r.toolChoice === 'auto')).toBe(true);
    expect(requests[3].toolChoice).toBe('none');
    expect(requests[3].tools?.length).toBeGreaterThan(0);
    expect(requests[3].system).toContain('Step limit reached. Do not call tools.');

    const history = await historyManager.getHistory(sessionId);
    const last = history[history.length - 1];
    expect(last).toMatchObject({ role: 'assistant', content: response.content });
    expect(last.tool_calls).toBeUndefined();
  });

  it('does not store a failed step limit summary', async () => {
    config.AI_MAX_THINKING_STEPS = 1;
    const { aiClient, historyManager, tools, chatManager, sessionId } = await setup('test_step_limit_error');
    vi.spyOn(tools, 'executeTool').mockResolvedValue({ name: 'read_file', result: { content: 'x' } });

    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (messages, _a, _t, _s, _k, _sig, _r, options) => {
      if (isTitleRequest(messages)) return { content: 'Unused' };
      if (options?.toolChoice === 'none') {
        return { content: 'Error: AI response Upstream down', error: { kind: 'api', message: 'Upstream down', status: 502 } };
      }
      return { content: '', toolCalls: [readFileCall('call_1', { path: 'a.txt' })] };
    });

    const response = await chatManager.sendMessage('task', sessionId);
    expect(response.error?.kind).toBe('api');
    const history = await historyManager.getHistory(sessionId);
    expect(history.map(m => m.role)).toEqual(['user', 'assistant', 'tool']);
  });
});

describe('ChatHistoryManager ordering', () => {
  it('returns messages in insertion order with their database ids', async () => {
    const db = new DatabaseClient(':memory:');
    await db.initialize();
    const historyManager = new ChatHistoryManager(db);
    const sessionId = 'test_order_session_' + Date.now();

    await historyManager.addMessage(sessionId, { role: 'user', content: 'first' });
    await historyManager.addMessage(sessionId, { role: 'assistant', content: 'second' });
    await historyManager.addMessage(sessionId, { role: 'user', content: 'third' });

    const history = await historyManager.getHistory(sessionId);
    expect(history.map(m => m.content)).toEqual(['first', 'second', 'third']);
    expect(history.every(m => Number.isInteger(m.id))).toBe(true);
    expect(history[0].id).toBeLessThan(history[1].id);
    expect(history[1].id).toBeLessThan(history[2].id);
  });

  it('creates the (session_id, id) index on messages', async () => {
    const db = new DatabaseClient(':memory:');
    await db.initialize();

    const result = await db.query(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'messages' AND name = 'idx_messages_session'"
    );
    expect(result.rows).toHaveLength(1);
  });
});
