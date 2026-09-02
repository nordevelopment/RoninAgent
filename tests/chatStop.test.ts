import { describe, it, expect, vi } from 'vitest';
import { ChatManager } from '../src/backend/ai/ChatManager.js';
import { AIClient } from '../src/backend/ai/AIClient.js';
import { ChatHistoryManager } from '../src/backend/ai/ChatHistoryManager.js';
import { SessionManager } from '../src/backend/ai/SessionManager.js';
import { MemoryManager } from '../src/backend/ai/MemoryManager.js';
import { AITools } from '../src/backend/ai/AITools.js';
import { DatabaseClient } from '../src/backend/database/DatabaseClient.js';

describe('ChatManager Stop/Abort Functionality', () => {
  it('returns false when stopping a non-active session', () => {
    const db = new DatabaseClient(':memory:');
    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);
    const tools = new AITools(memoryManager);

    const chatManager = new ChatManager({
      aiClient,
      historyManager,
      tools,
      memoryManager,
      sessionManager
    });

    expect(chatManager.stopSession('non_existent_session')).toBe(false);
  });

  it('stops active sendMessage loop when stopSession is invoked', async () => {
    const db = new DatabaseClient(':memory:');
    await db.initialize();

    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);
    const tools = new AITools(memoryManager);

    const sessionId = 'test_stop_session_' + Date.now();
    await sessionManager.createSession(sessionId);

    const chatManager = new ChatManager({
      aiClient,
      historyManager,
      tools,
      memoryManager,
      sessionManager
    });

    // Mock AI Client to simulate a slow or long-running query
    vi.spyOn(aiClient, 'sendMessage').mockImplementation(async (_messages, _agentId, _tools, _sys, _skip, signal) => {
      // Simulate delay and abort check
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ content: 'Slow response completed' });
        }, 300);

        signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve({ content: 'Error: Request was cancelled by user' });
        });
      });
    });

    // Start sending message in background
    const sendPromise = chatManager.sendMessage('Hello AI, please do work', sessionId);

    // Allow sendMessage to register activeAbortController and enter execution
    await new Promise((r) => setTimeout(r, 20));

    // Abort the session
    const stopped = chatManager.stopSession(sessionId);
    expect(stopped).toBe(true);

    const result = await sendPromise;
    expect(result.content).toBe('Generation stopped by user.');

    // Once finished, stopSession should return false (controller cleaned up)
    expect(chatManager.stopSession(sessionId)).toBe(false);
  });
});
