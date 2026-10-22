/**
 * ChatManager.ts - Orchestrator of chat
 * Author: Norayr Petrosyan
 * 
 * Orchestrates the chat by coordinating the AIClient, ChatHistoryManager, AITools, and MemoryManager
 */

import { createHash } from 'crypto';
import { AIClient, AIError, AIMessages, AIResponse } from './AIClient.js';
import type { ContextState } from './ContextWindow.js';
import type { StoredMessage } from './ChatHistoryManager.js';
import { ChatHistoryManager } from './ChatHistoryManager.js';
import { SessionManager } from './SessionManager.js';
import { AITools, extractPathArgument } from './AITools.js';
import { MemoryManager } from './MemoryManager.js';
import { config } from '../config.js';
import logger from '../utils/logger.js';

const MAX_CONTEXT_STATES = 200;
/** A call is blocked once it has returned the same result this many times in a row */
const LOOP_REPEAT_LIMIT = 2;
const STEP_LIMIT_NOTE = '[STEP LIMIT REACHED]\nStep limit reached. Do not call tools. Briefly tell the user what is done, ' +
  'what is left, and that they can say "continue" to resume.';

interface ToolCallRepeat {
  /** Hash of the last result: results can be 100k chars and live for the whole turn */
  lastResultHash: string;
  sameResultRuns: number;
}

/** JSON with object keys sorted, so {a,b} and {b,a} count as the same arguments */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Only an identical result counts as a repeat: re-reading a file after editing it is
 * legitimate work, while getting the same answer again is the loop we want to stop.
 */
function recordToolCallResult(repeats: Map<string, ToolCallRepeat>, key: string, resultContent: string): void {
  const resultHash = createHash('sha1').update(resultContent).digest('hex');
  const previous = repeats.get(key);
  repeats.set(key, {
    lastResultHash: resultHash,
    sameResultRuns: previous && previous.lastResultHash === resultHash ? previous.sameResultRuns + 1 : 1
  });
}

export interface ChatManagerDeps {
  aiClient: AIClient;
  historyManager: ChatHistoryManager;
  tools: AITools;
  memoryManager: MemoryManager;
  sessionManager: SessionManager;
}

export class ChatManager {
  private aiClient: AIClient;
  private historyManager: ChatHistoryManager;
  private tools: AITools;
  private memoryManager: MemoryManager;
  private sessionManager: SessionManager;
  private activeAbortControllers = new Map<string, AbortController>();
  /** Context window watermarks per session, kept in least-recently-used order */
  private contextStates = new Map<string, ContextState>();

  constructor(deps: ChatManagerDeps) {
    this.aiClient = deps.aiClient;
    this.historyManager = deps.historyManager;
    this.tools = deps.tools;
    this.memoryManager = deps.memoryManager;
    this.sessionManager = deps.sessionManager;
  }

  /**
   * Stop/abort active AI generation for a specific session
   * @param sessionId - target session identifier
   * @returns boolean indicating whether an active generation was found and stopped
   */
  public stopSession(sessionId: string): boolean {
    const controller = this.activeAbortControllers.get(sessionId);
    if (controller) {
      logger.info({ sessionId }, '[ChatManager] Stopping active generation session');
      controller.abort();
      this.activeAbortControllers.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Keeps the watermarks of the last fit. The provider's prompt_tokens for exactly that
   * request become the anchor of the next estimate. After an overflow the old anchor is
   * known to be wrong, so the next fit falls back to the rough count.
   */
  private rememberContextState(sessionId: string, response: AIResponse): void {
    if (!response.context) {
      return;
    }
    const state: ContextState = { ...response.context.state };
    if (response.usage && response.usage.promptTokens > 0) {
      state.anchor = { roughTokens: response.context.roughTokens, actualPromptTokens: response.usage.promptTokens };
    } else if (response.error?.kind === 'context_overflow') {
      delete state.anchor;
    }

    this.contextStates.delete(sessionId);
    this.contextStates.set(sessionId, state);
    if (this.contextStates.size > MAX_CONTEXT_STATES) {
      const oldest = this.contextStates.keys().next().value;
      if (oldest !== undefined) {
        this.contextStates.delete(oldest);
      }
    }
  }

  /**
   * One model request over the fitted history, with a single aggressive retry on context overflow
   */
  private async requestStep(
    sessionId: string,
    history: StoredMessage[],
    agentId: string,
    tools: any[],
    systemContext: string,
    signal: AbortSignal,
    toolChoice: 'auto' | 'none'
  ): Promise<AIResponse> {
    let response = await this.aiClient.sendMessage(history, agentId, tools, systemContext, false, signal, undefined, {
      contextWindow: { state: this.contextStates.get(sessionId) },
      toolChoice
    });
    this.rememberContextState(sessionId, response);

    if (response.error?.kind === 'context_overflow' && !signal.aborted) {
      logger.warn({ sessionId, err: response.error.message }, '[ChatManager] Context overflow, retrying with aggressive compression');
      response = await this.aiClient.sendMessage(history, agentId, tools, systemContext, false, signal, undefined, {
        contextWindow: { state: this.contextStates.get(sessionId), aggressive: true },
        toolChoice
      });
      this.rememberContextState(sessionId, response);
    }
    return response;
  }

  /**
   * Send message to AI
   * @param userMessage - user message
   * @param sessionId - session ID
   * @returns AI response
   */


  /**
   * Safely parse tool arguments from AI model with auto-recovery for truncated/malformed JSON strings
   */
  private safeParseToolArguments(rawArgs: string | Record<string, unknown>, toolName?: string): Record<string, unknown> {
    if (!rawArgs) return {};

    const normalizeResult = (obj: any): Record<string, unknown> => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        // Flatten nested common sub-objects if present
        if (obj.input && typeof obj.input === 'object' && !Array.isArray(obj.input)) {
          Object.assign(obj, obj.input);
        }
        if (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) {
          Object.assign(obj, obj.params);
        }
        if (obj.arguments && typeof obj.arguments === 'object' && !Array.isArray(obj.arguments)) {
          Object.assign(obj, obj.arguments);
        }
        if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
          Object.assign(obj, obj.data);
        }
        if (obj.file && typeof obj.file === 'object' && !Array.isArray(obj.file)) {
          const nestedPath = extractPathArgument(obj.file);
          if (nestedPath && !obj.path) obj.path = nestedPath;
        }

        const resolvedPath = extractPathArgument(obj);
        if (resolvedPath && !obj.path) {
          obj.path = resolvedPath;
        }
      }
      return obj || {};
    };

    if (typeof rawArgs === 'object') {
      return normalizeResult(rawArgs);
    }

    if (typeof rawArgs !== 'string') return {};

    try {
      return normalizeResult(JSON.parse(rawArgs));
    } catch (primaryErr) {
      logger.warn({ rawLength: rawArgs.length }, '[ChatManager] Standard JSON.parse failed on tool arguments. Attempting auto-recovery...');

      // Attempt 1: Sanitize unescaped control characters
      try {
        const sanitized = rawArgs.replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => {
          if (c === '\n') return '\\n';
          if (c === '\r') return '\\r';
          if (c === '\t') return '\\t';
          return '';
        });
        return normalizeResult(JSON.parse(sanitized));
      } catch {}

      // Attempt 2: Auto-close truncated JSON string/object (e.g. hitting token limits)
      try {
        let repaired = rawArgs.trim();
        if (!repaired.endsWith('}')) {
          if (!repaired.endsWith('"')) {
            repaired += '"';
          }
          repaired += '}';
        }
        const parsed = JSON.parse(repaired);
        return normalizeResult(parsed);
      } catch {}

      // Attempt 3: Regex extraction for write_file / generate_pdf / read_file
      if (toolName === 'write_file' || toolName === 'generate_pdf' || toolName === 'generate_docx' || rawArgs.includes('"content"') || rawArgs.includes('"path"')) {
        const pathMatch = rawArgs.match(/"(?:path|filePath|file_path|filepath|targetPath|target_path|targetpath|filename|fileName|file_name|file|name|target|outputPath|output_path|output|destination|dest|relative_path|relativePath)"\s*:\s*"([^"]+)"/);
        const contentMatch = rawArgs.match(/"(?:content|html|markdown|text)"\s*:\s*"([\s\S]*)/);
        const pathVal = pathMatch ? pathMatch[1] : undefined;
        let contentVal = '';
        if (contentMatch) {
          contentVal = contentMatch[1];
          contentVal = contentVal.replace(/"\s*}?\s*$/, '');
          contentVal = contentVal.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
        }
        if (pathVal || contentVal) {
          return normalizeResult({
            path: pathVal,
            content: contentVal,
            html: contentVal
          });
        }
      }

      throw primaryErr;
    }
  }

  async sendMessage(
    userMessage: string,
    sessionId: string,
    imageBase64?: string,
    onProgress?: (event: 'tool_start' | 'tool_done' | 'skills_loaded', data: any) => void | Promise<void>,
    files?: { name: string; path: string; size: number; type?: string }[]
  ): Promise<{ content: string; reasoning?: string; error?: AIError }> {
    const controller = new AbortController();
    this.activeAbortControllers.set(sessionId, controller);
    const signal = controller.signal;

    try {
      let textPrompt = userMessage || '';

      if (files && files.length > 0) {
        const filesDesc = files.map(f => `- 📎 **${f.name}** (Path: \`workspace/${f.path}\`, Size: ${Math.max(1, Math.round(f.size / 1024))} KB)`).join('\n');
        const attachmentContext = `\n\n[USER ATTACHED WORKSPACE FILES]:\n${filesDesc}\n(You can inspect, read, analyze, or edit these files using your tools: 'read_file', 'read_docx', 'read_excel', 'read_pdf', 'edit_excel', etc.)`;
        textPrompt = textPrompt ? `${textPrompt}\n${attachmentContext}` : `Please inspect and analyze the attached files:\n${attachmentContext}`;
      }

      let finalContent: any = textPrompt;

      if (imageBase64) {
        try {
          const processed = await this.aiClient.processImage({ base64: imageBase64, url: '' }, sessionId, logger);
          finalContent = [
            { type: 'text', text: textPrompt || 'What is this image? Describe it in details.' },
            { type: 'image_url', image_url: { url: processed.filePath } }
          ];
        } catch (err) {
          console.error('[ChatManager] Failed to process incoming image:', err);
        }
      }

      // Save user message in history
      await this.historyManager.addMessage(sessionId, {
        role: 'user',
        content: finalContent
      });

      // Check cancellation
      if (signal.aborted) {
        logger.info({ sessionId }, '[ChatManager] Session was stopped after initial message');
        return { content: 'Generation stopped by user.' };
      }

      // Notify client of matching skills if any
      if (onProgress && userMessage) {
        try {
          const session = await this.sessionManager.getSession(sessionId);
          const agentId = session?.agent_id || config.default_agent;
          const loadedSkills = this.aiClient.getMatchingSkillsList(agentId, userMessage);
          if (loadedSkills.length > 0) {
            await onProgress('skills_loaded', { skills: loadedSkills });
          }
        } catch (err) {
          console.error('[ChatManager] Failed to fetch or send matching skills:', err);
        }
      }

      // Get current available tools
      const availableTools = this.tools.getAvailableTools();

      let lastReasoning: string | undefined = undefined;

      // Fetch relevant memories context
      let memoriesContext = '';
      try {
        memoriesContext = await this.memoryManager.getRelevantContext(sessionId, userMessage);
      } catch (err) {
        console.error('[ChatManager] Failed to fetch relevant memories context:', err);
      }

      // Build session context for workspace project isolation
      const sessionFolderName = sessionId.startsWith('session_') || sessionId.startsWith('telegram_')
        ? sessionId
        : `session_${sessionId}`;
      const sessionWorkspaceDir = `workspace/${sessionFolderName}`;
      const sessionContext = `[CURRENT SESSION CONTEXT]\nSession ID: ${sessionId}\nAssigned Workspace Folder: ${sessionWorkspaceDir}/`;
      const combinedSystemContext = [sessionContext, memoriesContext].filter(Boolean).join('\n\n');

      // Run loop of interaction with AI (maximum iterations from config, to not go into infinite loop)
      const maxSteps = config.AI_MAX_THINKING_STEPS;
      const toolCallRepeats = new Map<string, ToolCallRepeat>();
      for (let i = 0; i < maxSteps; i++) {
        if (signal.aborted) {
          logger.info({ sessionId }, '[ChatManager] Session stopped before AI thinking step');
          return { content: 'Generation stopped by user.', reasoning: lastReasoning };
        }

        // Full history: AIClient fits it into the model context window
        const history = await this.historyManager.getHistory(sessionId);

        // Get agent ID for this session
        const session = await this.sessionManager.getSession(sessionId);
        const agentId = session?.agent_id || config.default_agent;

        const aiResponse = await this.requestStep(sessionId, history, agentId, availableTools, combinedSystemContext, signal, 'auto');

        if (signal.aborted) {
          logger.info({ sessionId }, '[ChatManager] Session stopped during AI response');
          return { content: 'Generation stopped by user.', reasoning: lastReasoning };
        }

        // A failed request is shown to the user but never stored: a saved "Error: ..." would be
        // replayed to the model as its own previous answer on every following step
        if (aiResponse.error) {
          logger.warn(
            { sessionId, kind: aiResponse.error.kind, status: aiResponse.error.status, err: aiResponse.error.message },
            '[ChatManager] AI request failed'
          );
          return { content: aiResponse.content, reasoning: lastReasoning, error: aiResponse.error };
        }

        if (aiResponse.reasoning) {
          lastReasoning = aiResponse.reasoning;
        }

        // If AI just answered text (without calling tools)
        if (!aiResponse.toolCalls || aiResponse.toolCalls.length === 0) {
          const finalContent = aiResponse.content ?? "I couldn't prepare an answer, Master.";

          await this.historyManager.addMessage(sessionId, {
            role: 'assistant',
            content: finalContent
          });

          // Trigger auto-rename if session has no title and it's a standard user session
          if (session && !session.title && !sessionId.startsWith('task_') && sessionId !== 'task_session' && !sessionId.startsWith('telegram_')) {
            (async () => {
              try {
                const fullHistory = await this.historyManager.getHistory(sessionId);
                const firstMessages = fullHistory.slice(0, 3);
                const chatText = firstMessages
                  .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
                  .join('\n');

                const prompt = `Based on the following beginning of a chat session, generate a short, descriptive title of 2 to 4 words in the user's language. Do NOT think out loud. Respond ONLY with the title itself. No quotes, no markdown, no explanations.

Chat Beginning:
${chatText}

Title:`;

                const titleResponse = await this.aiClient.sendMessage([{ role: 'user', content: prompt }], agentId, undefined, undefined, true);
                if (titleResponse.error) {
                  return;
                }
                let title = titleResponse.content ? titleResponse.content.trim() : '';

                // Strip any thinking tags if present
                title = title.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

                // If multiline, take the final concise title line
                const titleLines = title.split('\n')
                  .map(l => l.trim())
                  .filter(l => l.length > 0 && !l.startsWith('-') && !l.startsWith('*') && !l.toLowerCase().startsWith('possible'));
                if (titleLines.length > 0) {
                  title = titleLines[titleLines.length - 1];
                }

                // Clean quotes, Markdown symbols, and "Title:" prefix
                title = title.replace(/^["'`*#\s]+|["'`*#\s]+$/g, '');
                title = title.replace(/^Title:\s*/i, '').trim();

                // Cap length to 32 characters max
                if (title.length > 32) {
                  title = title.slice(0, 30).trim() + '...';
                }

                if (title && title.length > 0 && !title.startsWith('Error:')) {
                  await this.sessionManager.updateSessionTitle(sessionId, title);
                }
              } catch (err) {
                logger.error({ err }, '[Auto-Rename] Failed to auto-rename session');
              }
            })().catch(e => logger.error({ err: e }, '[Auto-Rename] Unhandled background error'));
          }

          return { content: finalContent, reasoning: lastReasoning };
        }

        await this.historyManager.addMessage(sessionId, {
          role: 'assistant',
          content: aiResponse.content || '',
          tool_calls: aiResponse.toolCalls
        });

        logger.debug({ toolCalls: aiResponse.toolCalls }, '[Agent] AI decided to use tools');

        for (const toolCall of aiResponse.toolCalls) {
          if (signal.aborted) {
            logger.info({ sessionId, tool: toolCall.function.name }, '[ChatManager] Session stopped before tool execution');
            return { content: 'Generation stopped by user.', reasoning: lastReasoning };
          }

          let toolCallKey: string | undefined;
          try {
            const toolArgs = this.safeParseToolArguments(toolCall.function.arguments, toolCall.function.name);

            toolCallKey = `${toolCall.function.name}:${stableStringify(toolArgs)}`;
            const previous = toolCallRepeats.get(toolCallKey);
            if (previous && previous.sameResultRuns >= LOOP_REPEAT_LIMIT) {
              logger.warn({ sessionId, tool: toolCall.function.name }, '[ChatManager] Repeated tool call blocked by the loop detector');
              await this.historyManager.addMessage(sessionId, {
                role: 'tool',
                content: JSON.stringify({
                  error: `You already called ${toolCall.function.name} with the same arguments ${previous.sameResultRuns} times in this task and got the same result. ` +
                    'The result will not change. Use the previous result or try a different approach.'
                }),
                tool_call_id: toolCall.id
              });
              continue;
            }

            if (onProgress) {
              await onProgress('tool_start', {
                name: toolCall.function.name,
                arguments: toolArgs
              });
            }

            const result = await this.tools.executeTool({
              name: toolCall.function.name,
              arguments: toolArgs
            }, sessionId);

            if (onProgress) {
              await onProgress('tool_done', {
                name: toolCall.function.name,
                result: result.result
              });
            }

            // Save result of tool execution in history
            const resultContent = JSON.stringify(result.result);
            recordToolCallResult(toolCallRepeats, toolCallKey, resultContent);
            await this.historyManager.addMessage(sessionId, {
              role: 'tool',
              content: resultContent,
              tool_call_id: toolCall.id
            });
          } catch (error) {
            logger.error({ err: error }, `[ChatManager] Error executing tool ${toolCall.function.name}:`);

            if (onProgress) {
              await onProgress('tool_done', {
                name: toolCall.function.name,
                result: { error: (error as Error).message }
              });
            }

            // save error in history for AI to know
            const errorContent = JSON.stringify({ error: (error as Error).message });
            if (toolCallKey) {
              recordToolCallResult(toolCallRepeats, toolCallKey, errorContent);
            }
            await this.historyManager.addMessage(sessionId, {
              role: 'tool',
              content: errorContent,
              tool_call_id: toolCall.id
            });
          }
        }

      }

      if (signal.aborted) {
        return { content: 'Generation stopped by user.', reasoning: lastReasoning };
      }

      // Out of steps: one more request with tools forbidden, so the work done so far is
      // summarized and kept in history instead of being lost
      logger.warn({ sessionId, maxSteps }, '[ChatManager] Step limit reached, asking the model for a summary');
      const session = await this.sessionManager.getSession(sessionId);
      const agentId = session?.agent_id || config.default_agent;
      const history = await this.historyManager.getHistory(sessionId);
      const summaryResponse = await this.requestStep(
        sessionId, history, agentId, availableTools, `${combinedSystemContext}\n\n${STEP_LIMIT_NOTE}`, signal, 'none'
      );

      if (signal.aborted) {
        return { content: 'Generation stopped by user.', reasoning: lastReasoning };
      }
      if (summaryResponse.error) {
        logger.warn({ sessionId, kind: summaryResponse.error.kind, err: summaryResponse.error.message }, '[ChatManager] Step limit summary failed');
        return { content: summaryResponse.content, reasoning: lastReasoning, error: summaryResponse.error };
      }

      // Tool calls are dropped even if the provider ignored tool_choice: they would have no results
      const summary = summaryResponse.content.trim()
        || `I reached the step limit (${maxSteps} steps) before finishing the task. Say "continue" and I will go on.`;
      await this.historyManager.addMessage(sessionId, { role: 'assistant', content: summary });
      return { content: summary, reasoning: summaryResponse.reasoning ?? lastReasoning };
    } finally {
      if (this.activeAbortControllers.get(sessionId) === controller) {
        this.activeAbortControllers.delete(sessionId);
      }
    }
  }


  /**
   * Get chat history
   * @param sessionId - session ID
   * @returns array of messages
   */
  async getHistory(sessionId: string): Promise<AIMessages[]> {
    //logger.info({ sessionId }, '[ChatManager] Getting history for session');
    return await this.historyManager.getHistory(sessionId);
  }

  async getAllSessions(): Promise<any[]> {
    return await this.sessionManager.getAllSessions();
  }

  async getLastSession(): Promise<any | null> {
    return await this.sessionManager.getLastSession();
  }

  /**
   * Clear chat history
   * @param sessionId - session ID
   */
  async clearHistory(sessionId: string): Promise<void> {
    await this.historyManager.clearHistory(sessionId);
    this.contextStates.delete(sessionId);
  }

  /**
   * Clear all memories for a session
   * @param sessionId - session ID
   */
  async clearMemory(sessionId: string): Promise<void> {
    await this.memoryManager.clearAll(sessionId);
  }


  /**
   * Create new session
   * @param sessionId - session ID
   * @param agentId - agent ID
   */
  async createSession(sessionId: string, agentId?: string): Promise<void> {
    await this.sessionManager.createSession(sessionId, agentId);
  }

  /**
   * Delete session
   * @param sessionId - session ID
   */
  async deleteSession(sessionId: string): Promise<number> {
    // Message history and memories will be deleted automatically due to ON DELETE CASCADE
    const deleted = await this.sessionManager.deleteSession(sessionId);
    this.contextStates.delete(sessionId);
    return deleted;
  }

  /**
   * Get session
   * @param sessionId - session ID
   */
  async getSession(sessionId: string): Promise<any> {
    return await this.sessionManager.getSession(sessionId);
  }

  /**
   * Update sessions with old agent ID to new agent ID
   */
  async updateSessionsAgent(oldAgentId: string, newAgentId: string): Promise<number> {
    return await this.sessionManager.updateSessionsAgent(oldAgentId, newAgentId);
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<number> {
    return await this.sessionManager.updateSessionTitle(sessionId, title);
  }
}
