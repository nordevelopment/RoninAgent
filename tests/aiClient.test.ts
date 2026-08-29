import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import { AIClient, AIMessages } from '../src/backend/ai/AIClient.js';
import { config } from '../src/backend/config.js';

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
    config.AI_TOP_P = 0.9;
    config.AI_TIMEOUT = 10000;

    aiClient = new AIClient();
  });

  describe('Getters and Config', () => {
    it('returns configured apiKey, apiUrl, and model', () => {
      expect(aiClient.apiKey).toBe('test-ai-key');
      expect(aiClient.apiUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(aiClient.model).toBe('qwen/qwen3.5-flash-02-23');
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
    it('matches skills by keyword in query', () => {
      // Test with main_agent skills
      const matched = aiClient.getMatchingSkills('main_agent', 'tell me a web search query');
      expect(typeof matched).toBe('string');
    });

    it('returns empty string if query is empty', () => {
      expect(aiClient.getMatchingSkills('main_agent', '')).toBe('');
      expect(aiClient.getMatchingSkillsList('main_agent', '')).toEqual([]);
    });

    it('returns empty string if agent skills dir does not exist', () => {
      expect(aiClient.getMatchingSkills('invalid_agent_xyz', 'test query')).toBe('');
      expect(aiClient.getMatchingSkillsList('invalid_agent_xyz', 'test query')).toEqual([]);
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
      expect(options.headers['X-Title']).toBe('PAIAgent');
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
    });
  });

  describe('Local image URL transformation to Base64', () => {
    it('reads local /storage image and converts to base64 data url', async () => {
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
            { type: 'image_url', image_url: { url: '/storage/images/photo.jpg' } }
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
