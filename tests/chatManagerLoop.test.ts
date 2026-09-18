import { describe, it, expect, vi } from 'vitest';
import { ChatManager } from '../backend/ai/ChatManager.js';
import { AIClient } from '../backend/ai/AIClient.js';
import { ChatHistoryManager } from '../backend/ai/ChatHistoryManager.js';
import { SessionManager } from '../backend/ai/SessionManager.js';
import { MemoryManager } from '../backend/ai/MemoryManager.js';
import { AITools } from '../backend/ai/AITools.js';
import { DatabaseClient } from '../backend/database/DatabaseClient.js';
import { FileSystemManager } from '../backend/services/FileSystemManager.js';
import { WebPageContent } from '../backend/services/WebPageContent.js';
import { OfficeDocumentService } from '../backend/services/OfficeDocumentService.js';
import path from 'path';

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
});
