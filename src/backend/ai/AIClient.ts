/**
 * AIClient.ts - Client for communication with AI API
 * Responsible for sending messages to AI and receiving responses
 * Author: Norayr Petrosyan
 */
import { config } from '../config.js';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // Обычно JSON-строка от LLM
  };
}


export interface AIMessages {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | AiContentItem[] | null;
  tool_call_id?: string; // For role: 'tool' 
  tool_calls?: AIToolCall[];    // For role: 'assistant' when calling tools
}

export interface AIResponse {
  content: string;
  toolCalls?: AIToolCall[];
  reasoning?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface AiContentItem {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export class AIClient {
  get apiKey(): string {
    return config.AI_API_KEY;
  }
  get apiUrl(): string {
    return config.AI_API_URL || '';
  }
  get model(): string {
    return config.AI_DEFAULT_MODEL;
  }

  constructor() {
  }

  buildSystemPrompt(agentId: string = 'main_agent'): string {
    const mainAgentPath = path.join(__dirname, `../../../agents/${agentId}`);

    if (fs.existsSync(mainAgentPath)) {
      // Strict order of file loading
      const order = [
        'Identity.md',
        'User.md',
        'Agent.md',
        'Memory.md'
      ];

      let systemPrompt = '';

      for (const fileName of order) {
        const filePath = path.join(mainAgentPath, fileName);

        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          systemPrompt += `\n${content}`;
        }
      }

      return systemPrompt.trim();

    } else {
      console.warn(`AIClient: Agent directory not found: ${agentId}`);
      return '';
    }
  }

  /**
   * Resolve and match dynamic skills for a given agent and query.
   * Scans local agent skills (agents/<agentId>/skills/) and shared global skills (skills/),
   * with local skills taking priority (overriding shared skills with identical filenames).
   */
  private resolveMatchingSkills(agentId: string, query: string): Array<{ name: string; body: string; filename: string; isLocal: boolean }> {
    if (!query) return [];

    const queryLower = query.replace(/https?:\/\/[^\s]+/g, '').toLowerCase();
    const candidateFiles = new Map<string, { filePath: string; isLocal: boolean }>();

    // 1. Scan agent-specific local skills (higher priority)
    if (agentId) {
      const localSkillsDir = path.join(__dirname, `../../../agents/${agentId}/skills`);
      if (fs.existsSync(localSkillsDir) && fs.statSync(localSkillsDir).isDirectory()) {
        const localFiles = fs.readdirSync(localSkillsDir);
        for (const file of localFiles) {
          if (file.endsWith('.md')) {
            candidateFiles.set(file.toLowerCase(), {
              filePath: path.join(localSkillsDir, file),
              isLocal: true,
            });
          }
        }
      }
    }

    // 2. Scan shared global skills (fallback/base)
    const sharedSkillsDir = path.join(__dirname, '../../../skills');
    if (fs.existsSync(sharedSkillsDir) && fs.statSync(sharedSkillsDir).isDirectory()) {
      const sharedFiles = fs.readdirSync(sharedSkillsDir);
      for (const file of sharedFiles) {
        const key = file.toLowerCase();
        if (file.endsWith('.md') && !candidateFiles.has(key)) {
          candidateFiles.set(key, {
            filePath: path.join(sharedSkillsDir, file),
            isLocal: false,
          });
        }
      }
    }

    const matchedSkills: Array<{ name: string; body: string; filename: string; isLocal: boolean }> = [];

    for (const [filenameKey, { filePath, isLocal }] of candidateFiles.entries()) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        if (lines.length === 0) continue;

        let keywords: string[] = [];
        let phrases: string[] = [];
        let combinations: Array<{ actions: string[]; targets: string[] }> = [];
        let excludePhrases: string[] = [];
        let bodyStartIndex = 0;

        // Parse header metadata directives at the top of the file
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) {
            bodyStartIndex = i + 1;
            break;
          }

          const lineLower = line.toLowerCase();
          if (lineLower.startsWith('keywords:')) {
            const parsed = line.substring(9).split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
            keywords.push(...parsed);
            bodyStartIndex = i + 1;
          } else if (lineLower.startsWith('phrases:') || lineLower.startsWith('phrase:')) {
            const colonIdx = line.indexOf(':');
            const parsed = line.substring(colonIdx + 1).split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
            phrases.push(...parsed);
            bodyStartIndex = i + 1;
          } else if (lineLower.startsWith('combinations:') || lineLower.startsWith('combination:')) {
            const colonIdx = line.indexOf(':');
            const combStr = line.substring(colonIdx + 1).trim();
            const parts = combStr.split('|');
            if (parts.length >= 2) {
              const actions = parts[0].split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
              const targets = parts[1].split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
              if (actions.length > 0 && targets.length > 0) {
                combinations.push({ actions, targets });
              }
            }
            bodyStartIndex = i + 1;
          } else if (lineLower.startsWith('exclude:') || lineLower.startsWith('excludes:')) {
            const colonIdx = line.indexOf(':');
            const parsed = line.substring(colonIdx + 1).split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
            excludePhrases.push(...parsed);
            bodyStartIndex = i + 1;
          } else {
            // Non-header line reached
            bodyStartIndex = i;
            break;
          }
        }

        const body = lines.slice(bodyStartIndex).join('\n').trim();

        // Fallback if no directives were specified
        if (keywords.length === 0 && phrases.length === 0 && combinations.length === 0) {
          const filenameKeyword = filenameKey.replace(/\.md$/, '');
          keywords = [filenameKeyword];
        }

        // 1. Check exclusions first (immediate suppression)
        const isExcluded = excludePhrases.some(ex => {
          if (!ex) return false;
          return queryLower.includes(ex);
        });

        if (isExcluded) {
          continue;
        }

        const testWordBoundary = (word: string): boolean => {
          if (!word) return false;
          const escaped = word.replace(/[\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'gu');
          return regex.test(queryLower);
        };

        // 2. Check exact phrases
        let isMatched = phrases.some(phrase => {
          if (!phrase) return false;
          return queryLower.includes(phrase);
        });

        // 3. Check combinations (Action + Target requirement)
        if (!isMatched && combinations.length > 0) {
          isMatched = combinations.some(({ actions, targets }) => {
            const hasAction = actions.some(act => testWordBoundary(act) || queryLower.includes(act));
            const hasTarget = targets.some(tgt => testWordBoundary(tgt) || queryLower.includes(tgt));
            return hasAction && hasTarget;
          });
        }

        // 4. Check keywords with whole-word boundary
        if (!isMatched && keywords.length > 0) {
          isMatched = keywords.some(keyword => testWordBoundary(keyword));
        }

        if (isMatched) {
          const rawBasename = path.basename(filePath, '.md');
          const skillName = rawBasename.toUpperCase();
          matchedSkills.push({
            name: skillName,
            body: body || content.trim(),
            filename: path.basename(filePath),
            isLocal,
          });
          logger.debug(`[AIClient] Dynamic skill loaded: ${path.basename(filePath)} (${isLocal ? 'local override' : 'shared'})`);
        }
      } catch (err) {
        logger.error({ err }, `[AIClient] Failed to read skill file ${filePath}`);
      }
    }

    return matchedSkills;
  }

  /**
   * Search for matching skills (local agent skills + global shared skills) based on query
   */
  getMatchingSkills(agentId: string, query: string): string {
    const matched = this.resolveMatchingSkills(agentId, query);
    return matched.map(s => `### SKILL: ${s.name}\n${s.body}`).join('\n\n');
  }

  /**
   * Search for matching skills (local agent skills + global shared skills) and return their names
   */
  getMatchingSkillsList(agentId: string, query: string): string[] {
    const matched = this.resolveMatchingSkills(agentId, query);
    return matched.map(s => s.name);
  }


  /**
   * Send a message to AI
   * @param messages - array of messages (dialog history)
   * @param tools - list of available tools (from AITools.getAvailableTools())
   * @param agentId - ID of the agent (folder name in agents/)
   * @param tools - list of available tools
   * @param additionalSystem - additional system prompt (e.g., memory context)
   * @returns ответ от AI
   */
  async sendMessage(
    messages: AIMessages[],
    agentId?: string,
    tools?: any[],
    additionalSystem?: string,
    skipSkills?: boolean,
    signal?: AbortSignal
  ): Promise<AIResponse> {

    const systemPrompt = this.buildSystemPrompt(agentId);

    // Dynamic skills selection based on last user query
    let userQuery = '';
    let activeSkillsContent = '';

    if (!skipSkills) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          const content = messages[i].content;
          if (typeof content === 'string') {
            userQuery = content;
            break;
          } else if (Array.isArray(content)) {
            userQuery = content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join(' ');
            break;
          }
        }
      }

      if (userQuery) {
        activeSkillsContent = this.getMatchingSkills(agentId || 'main_agent', userQuery);
      }
    }

    // Convert local stored image paths to base64 strings for the API request
    const processedMessages: AIMessages[] = await Promise.all(messages.map(async (msg): Promise<AIMessages> => {
      if (Array.isArray(msg.content)) {
        const newContent: AiContentItem[] = await Promise.all(msg.content.map(async (item): Promise<AiContentItem> => {
          if (item.type === 'image_url' && item.image_url && (item.image_url.url.startsWith('/workspace/') || item.image_url.url.startsWith('/storage/'))) {
            try {
              const relativePath = item.image_url.url;
              const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
              const fullPath = path.join(process.cwd(), cleanPath);
              const fileData = await fsp.readFile(fullPath);
              const base64 = fileData.toString('base64');
              const mimeType = 'image/jpeg';
              return {
                type: 'image_url' as const,
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              };
            } catch (err) {
              console.error('Error reading stored image for AI request:', err);
              return item;
            }
          }
          return item;
        }));
        return { ...msg, content: newContent };
      }
      return msg;
    }));

    // Add system prompt to the beginning of messages
    const messagesWithSystem: AIMessages[] = [];
    let finalSystemPrompt = systemPrompt;
    if (activeSkillsContent) {
      finalSystemPrompt = finalSystemPrompt ? `${finalSystemPrompt}\n\n[ACTIVE SKILLS]\n${activeSkillsContent}` : activeSkillsContent;
    }
    if (additionalSystem) {
      finalSystemPrompt = finalSystemPrompt ? `${finalSystemPrompt}\n${additionalSystem}` : additionalSystem;
    }
    if (finalSystemPrompt) {
      messagesWithSystem.push({
        role: 'system',
        content: finalSystemPrompt,
      });
    }
    messagesWithSystem.push(...processedMessages);

    // Real code to send a request to the AI API
    // For example, using axios
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: messagesWithSystem,
      temperature: config.AI_TEMPERATURE,
      max_tokens: config.AI_MAX_TOKENS,
    };

    // If tools are passed, add them to the request
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'RoninAgent'
          },
          timeout: config.AI_TIMEOUT,
          signal
        }
      );

      const data = response.data;

      const message = data.choices?.[0]?.message;
      const reasoning = message?.reasoning_content || message?.reasoning || undefined;

      // If there is no text, no function calls, no reasoning, then there is trouble
      if (!message?.content && (!message?.tool_calls || message.tool_calls.length === 0) && !reasoning) {
        return {
          content: 'Error: AI response not received',
        };
      }

      return {
        content: message?.content || '', // Empty string is ok if there are tool calls
        toolCalls: message?.tool_calls || undefined,
        reasoning: reasoning,
      };

    } catch (error: any) {
      if (axios.isCancel(error) || error.name === 'CanceledError' || error.code === 'ERR_CANCELED' || signal?.aborted) {
        return {
          content: 'Error: Request was cancelled by user',
        };
      }
      if (axios.isAxiosError(error)) {
        console.error('AIClient: Axios Error ', error.response?.data);
        return {
          content: 'Error: AI response ' + (error.response?.data?.error?.message || error.message),
        };
      } else {
        console.error('AIClient: Error ', error);
        return {
          content: 'Error: AI response ' + error.message,
        };
      }
    }
  }


  /**
   * Process and resize incoming images
   */
  async processImage(imageData: { base64: string, url: string }, sessionId?: string, logger?: any): Promise<{ filePath: string, base64Image: string }> {
    try {
      const matches = imageData.base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      const data = matches ? matches[2] : imageData.base64;
      const imgBuffer = Buffer.from(data, 'base64');

      const metadata = await sharp(imgBuffer).metadata();
      let pipeline = sharp(imgBuffer);
      if (metadata.width && metadata.width > 1024) {
        pipeline = pipeline.resize({ width: 1024 });
      }

      const resized = await pipeline
        .jpeg({ quality: 85 })
        .toBuffer();

      // Convert to base64
      const base64Image = `data:image/jpeg;base64,${resized.toString('base64')}`;

      // Save image to session workspace
      const sessionFolderName = (sessionId && (sessionId.startsWith('session_') || sessionId.startsWith('telegram_')))
        ? sessionId
        : `session_${sessionId || 'global'}`;
      const filename = `${Date.now()}.jpg`;
      const imagesDir = path.join(process.cwd(), config.workspaceDir || 'workspace', sessionFolderName, 'images');
      await fsp.mkdir(imagesDir, { recursive: true });
      const fullPath = path.join(imagesDir, filename);
      await fsp.writeFile(fullPath, resized);

      // Return relative path for frontend use
      const filePath = `/workspace/${sessionFolderName}/images/${filename}`;

      return { filePath, base64Image };

    } catch (err: any) {
      logger?.error({ error: err.message }, '[AI SERVICE] Image processing error');
      throw new Error('Image processing failed');
    }
  }

}
