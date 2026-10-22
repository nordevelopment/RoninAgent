import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { AIClient, AIMessages } from '../backend/ai/AIClient.js';
import { config } from '../backend/config.js';

vi.mock('axios');

describe('AIClient Tests', () => {
  let aiClient: AIClient;

  beforeEach(() => {
    vi.clearAllMocks();
    config.AI_API_KEY = 'test-ai-key';
    config.AI_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    config.AI_DEFAULT_MODEL = 'qwen/qwen3.5-flash-02-23';
    config.AI_TEMPERATURE = 0.2;
    config.AI_MAX_TOKENS = 4000;
    config.AI_TIMEOUT = 10000;

    aiClient = new AIClient();
  });

  describe('Getters and Config', () => {
    it('returns configured apiKey, apiUrl, and model', () => {
      expect(aiClient.apiKey).toBe('test-ai-key');
      expect(aiClient.apiUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(aiClient.model).toBe('qwen/qwen3.5-flash-02-23');
      expect(aiClient.reasoning).toBe('medium');
    });

    it('allows configuring reasoning via constructor or setter', () => {
      const customClient = new AIClient({ reasoning: 'high' });
      expect(customClient.reasoning).toBe('high');

      customClient.reasoning = 'low';
      expect(customClient.reasoning).toBe('low');
    });
  });

  describe('buildSystemPrompt', () => {
    it('builds system prompt from agent markdown files if agent exists', () => {
      const prompt = aiClient.buildSystemPrompt('main_agent');
      expect(typeof prompt).toBe('string');
      // main_agent exists in the workspace
      if (prompt.length > 0) {
        expect(prompt.length).toBeGreaterThan(10);
      }
    });

    it('returns empty string and warns if agent directory does not exist', () => {
      const prompt = aiClient.buildSystemPrompt('non_existent_agent_xyz_123');
      expect(prompt).toBe('');
    });
  });

  describe('Dynamic Skills Matching', () => {
    it('matches shared global skills by keyword in query', () => {
      const matched = aiClient.getMatchingSkills('main_agent', 'please research and find info about typescript');
      expect(typeof matched).toBe('string');
      expect(matched).toContain('SKILL: WEB_RESEARCHER');

      const names = aiClient.getMatchingSkillsList('main_agent', 'please research and find info about typescript');
      expect(names).toContain('WEB_RESEARCHER');
    });

    it('returns empty string if query is empty', () => {
      expect(aiClient.getMatchingSkills('main_agent', '')).toBe('');
      expect(aiClient.getMatchingSkillsList('main_agent', '')).toEqual([]);
    });

    it('returns empty string if query has no matching keywords', () => {
      expect(aiClient.getMatchingSkills('invalid_agent_xyz', 'unmatched_random_query_string_12345')).toBe('');
      expect(aiClient.getMatchingSkillsList('invalid_agent_xyz', 'unmatched_random_query_string_12345')).toEqual([]);
    });

    it('allows agent-specific local skill to override global shared skill', () => {
      const mockAgentPath = path.join(__dirname, '../agents/mock_test_agent/skills');
      fs.mkdirSync(mockAgentPath, { recursive: true });
      const overrideFile = path.join(mockAgentPath, 'coding.md');
      fs.writeFileSync(overrideFile, 'Keywords: code, python, coding\nCUSTOM LOCAL CODING SKILL INSTRUCTIONS');

      try {
        const matched = aiClient.getMatchingSkills('mock_test_agent', 'write some python code');
        expect(matched).toContain('CUSTOM LOCAL CODING SKILL INSTRUCTIONS');
        expect(matched).not.toContain('Clean Architecture'); // from global skill
      } finally {
        fs.rmSync(path.join(__dirname, '../agents/mock_test_agent'), { recursive: true, force: true });
      }
    });
  });

  describe('sendMessage', () => {
    it('sends standard text messages to AI and parses text response', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Hello, how can I help you?'
              }
            }
          ]
        }
      });

      const messages: AIMessages[] = [
        { role: 'user', content: 'Hi' }
      ];

      const response = await aiClient.sendMessage(messages, 'main_agent');

      expect(axios.post).toHaveBeenCalledTimes(1);
      const [url, body, options] = (axios.post as any).mock.calls[0];

      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer test-ai-key');
      expect(options.headers['X-Title']).toBe('RoninAgent');
      expect(body.model).toBe('qwen/qwen3.5-flash-02-23');
      expect(body.messages.length).toBeGreaterThanOrEqual(2); // system + user
      expect(response.content).toBe('Hello, how can I help you?');
      expect(response.toolCalls).toBeUndefined();
    });

    it('parses tool calls from AI response', async () => {
      const mockToolCalls = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location":"Yerevan"}'
          }
        }
      ];

      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: mockToolCalls
              }
            }
          ]
        }
      });

      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: { type: 'object', properties: { location: { type: 'string' } } }
          }
        }
      ];

      const response = await aiClient.sendMessage(
        [{ role: 'user', content: 'What is the weather in Yerevan?' }],
        'main_agent',
        tools
      );

      const [, body] = (axios.post as any).mock.calls[0];
      expect(body.tools).toEqual(tools);
      expect(body.tool_choice).toBe('auto');
      expect(response.toolCalls).toEqual(mockToolCalls);
    });

    it('captures reasoning content from message if present', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Final Answer',
                reasoning_content: 'Let me think step by step...'
              }
            }
          ]
        }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Solve 2+2' }]);
      expect(response.content).toBe('Final Answer');
      expect(response.reasoning).toBe('Let me think step by step...');
    });

    it('sends default reasoning effort "medium" in request body', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [{ message: { role: 'assistant', content: 'OK' } }]
        }
      });

      await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      const [, body] = (axios.post as any).mock.calls[0];
      expect(body.reasoning).toEqual({ effort: 'medium' });
    });

    it('allows overriding reasoning parameter in sendMessage call', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [{ message: { role: 'assistant', content: 'OK' } }]
        }
      });

      await aiClient.sendMessage(
        [{ role: 'user', content: 'Complex puzzle' }],
        'main_agent',
        undefined,
        undefined,
        false,
        undefined,
        'high'
      );
      const [, body] = (axios.post as any).mock.calls[0];
      expect(body.reasoning).toEqual({ effort: 'high' });
    });

    it('supports custom reasoning configuration object', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [{ message: { role: 'assistant', content: 'OK' } }]
        }
      });

      await aiClient.sendMessage(
        [{ role: 'user', content: 'Complex puzzle' }],
        'main_agent',
        undefined,
        undefined,
        false,
        undefined,
        { effort: 'max', max_tokens: 4000, exclude: false }
      );
      const [, body] = (axios.post as any).mock.calls[0];
      expect(body.reasoning).toEqual({ effort: 'max', max_tokens: 4000, exclude: false });
    });

    it('omits reasoning if reasoning is set to false, null, or off', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [{ message: { role: 'assistant', content: 'OK' } }]
        }
      });

      await aiClient.sendMessage(
        [{ role: 'user', content: 'No reasoning needed' }],
        'main_agent',
        undefined,
        undefined,
        false,
        undefined,
        false
      );
      const [, body] = (axios.post as any).mock.calls[0];
      expect(body.reasoning).toBeUndefined();
    });

    it('handles Axios errors gracefully', async () => {
      const axiosError = {
        isAxiosError: true,
        message: 'Request failed with status code 429',
        response: {
          data: {
            error: {
              message: 'Rate limit exceeded'
            }
          }
        }
      };

      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
      (axios.post as any).mockRejectedValueOnce(axiosError);

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.content).toContain('Error: AI response Rate limit exceeded');
      expect(response.error).toEqual({ kind: 'api', message: 'Rate limit exceeded', status: undefined });
    });

    it('classifies a context-length error as context_overflow', async () => {
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
      (axios.post as any).mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            error: {
              message: "This endpoint's maximum context length is 131072 tokens. However, you requested about 150000 tokens."
            }
          }
        }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.error?.kind).toBe('context_overflow');
      expect(response.error?.status).toBe(400);
    });

    it('classifies OpenAI context_length_exceeded code as context_overflow', async () => {
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
      (axios.post as any).mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: { error: { message: 'Input is invalid.', code: 'context_length_exceeded' } }
        }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.error?.kind).toBe('context_overflow');
    });

    it('does not treat a 429 token rate limit as context_overflow', async () => {
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
      (axios.post as any).mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Request failed with status code 429',
        response: {
          status: 429,
          data: { error: { message: 'Too many tokens per minute. Please slow down.' } }
        }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.error?.kind).toBe('api');
    });

    it('returns a structured error when the provider reports an error with HTTP 200', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: { error: { code: 502, message: 'Upstream provider unavailable' } }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.content).toBe('Error: AI response Upstream provider unavailable');
      expect(response.error).toEqual({ kind: 'api', message: 'Upstream provider unavailable', status: 502 });
    });

    it('parses token usage from the response', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [{ message: { role: 'assistant', content: 'OK' } }],
          usage: { prompt_tokens: 1234, completion_tokens: 56, total_tokens: 1290 }
        }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.usage).toEqual({ promptTokens: 1234, completionTokens: 56 });
      expect(response.error).toBeUndefined();
    });

    it('leaves usage undefined when the provider does not report it', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: { choices: [{ message: { role: 'assistant', content: 'OK' } }] }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.usage).toBeUndefined();
    });

    it('sends only API message fields and drops history-only fields like id', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: { choices: [{ message: { role: 'assistant', content: 'OK' } }] }
      });

      const toolCalls = [{ id: 'call_1', type: 'function' as const, function: { name: 'read_file', arguments: '{}' } }];
      const history = [
        { id: 1, role: 'user', content: 'Read it' },
        { id: 2, role: 'assistant', content: '', tool_calls: toolCalls },
        { id: 3, role: 'tool', content: '{"ok":true}', tool_call_id: 'call_1' }
      ] as AIMessages[];

      await aiClient.sendMessage(history, 'main_agent', undefined, undefined, true);
      const [, body] = (axios.post as any).mock.calls[0];
      const sent = body.messages.filter((m: any) => m.role !== 'system');

      expect(sent).toEqual([
        { role: 'user', content: 'Read it' },
        { role: 'assistant', content: '', tool_calls: toolCalls },
        { role: 'tool', content: '{"ok":true}', tool_call_id: 'call_1' }
      ]);
    });

    it('handles unexpected empty response from AI', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: null
              }
            }
          ]
        }
      });

      const response = await aiClient.sendMessage([{ role: 'user', content: 'Hello' }]);
      expect(response.content).toBe('Error: AI response not received');
      expect(response.error?.kind).toBe('empty_response');
    });
  });

  describe('Local image URL transformation to Base64', () => {
    it('reads local /workspace session image and converts to base64 data url', async () => {
      const mockBuffer = Buffer.from('fake-image-bytes');
      vi.spyOn(fsp, 'readFile').mockResolvedValueOnce(mockBuffer);

      (axios.post as any).mockResolvedValueOnce({
        data: {
          choices: [{ message: { role: 'assistant', content: 'Image received' } }]
        }
      });

      const messages: AIMessages[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            { type: 'image_url', image_url: { url: '/workspace/session_test/images/photo.jpg' } }
          ]
        }
      ];

      await aiClient.sendMessage(messages);

      const [, body] = (axios.post as any).mock.calls[0];
      const userMsg = body.messages.find((m: any) => m.role === 'user');
      const imgItem = userMsg.content.find((item: any) => item.type === 'image_url');

      expect(imgItem.image_url.url).toContain('data:image/jpeg;base64,');
      expect(imgItem.image_url.url).toBe(`data:image/jpeg;base64,${mockBuffer.toString('base64')}`);
    });
  });
});
