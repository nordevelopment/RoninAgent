import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { ImageService } from '../src/backend/services/imageService.js';
import { config } from '../src/backend/config.js';

vi.mock('axios');

describe('ImageService Tests', () => {
  let imageService: ImageService;

  beforeEach(() => {
    vi.clearAllMocks();
    config.images.together.key = 'test-together-key';
    config.images.together.model = 'ByteDance-Seed/Seedream-4.0';
    config.images.together.url = 'https://api.together.xyz/v1/images/generations';
    (config.images.together as any).steps = undefined;

    config.images.xai.key = 'test-xai-key';
    config.images.xai.model = 'grok-imagine-image';
    config.images.xai.url = 'https://api.x.ai/v1/images/generations';

    imageService = new ImageService();

    // Mock downloadImage to return a mock local path
    vi.spyOn(imageService as any, 'downloadImage').mockResolvedValue('storage/generated/mock_img.png');
  });

  describe('Validation', () => {
    it('throws an error if prompt is empty', async () => {
      await expect(imageService.generateImage('')).rejects.toThrow('Prompt cannot be empty');
      await expect(imageService.generateImage('   ')).rejects.toThrow('Prompt cannot be empty');
    });

    it('throws an error if no provider keys are configured', async () => {
      config.images.together.key = '';
      config.images.xai.key = '';
      await expect(imageService.generateImage('a cute cat')).rejects.toThrow('API keys');
    });
  });

  describe('Together AI Generation (Seedream-4.0 & FLUX)', () => {
    it('omits steps completely when steps is undefined (default for Seedream)', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          data: [{ url: 'https://example.com/image.png' }]
        }
      });

      const result = await imageService.generateImage('a cute cat', '1:1', undefined, 'together');

      expect(axios.post).toHaveBeenCalledTimes(1);
      const [url, payload, options] = (axios.post as any).mock.calls[0];

      expect(url).toBe('https://api.together.xyz/v1/images/generations');
      expect(payload.model).toBe('ByteDance-Seed/Seedream-4.0');
      expect(payload.prompt).toBe('a cute cat');
      expect(payload.width).toBe(1024);
      expect(payload.height).toBe(1024);
      expect(payload.steps).toBeUndefined();
      expect('steps' in payload).toBe(false); // Key MUST NOT exist in payload for Seedream
      expect(options.headers.Authorization).toBe('Bearer test-together-key');
      expect(result.relativePath).toBe('/storage/generated/mock_img.png');
    });

    it('omits steps when steps is null or NaN', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          data: [{ url: 'https://example.com/image.png' }]
        }
      });

      await imageService.generateImage('a cute cat', '1:1', null as any, 'together');

      const [, payload] = (axios.post as any).mock.calls[0];
      expect(payload.steps).toBeUndefined();
      expect('steps' in payload).toBe(false);
    });

    it('omits steps for Seedream even if steps is explicitly passed', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          data: [{ url: 'https://example.com/image.png' }]
        }
      });

      config.images.together.model = 'ByteDance-Seed/Seedream-4.0';
      await imageService.generateImage('a cute cat', '16:9', 30, 'together');

      const [, payload] = (axios.post as any).mock.calls[0];
      expect(payload.steps).toBeUndefined();
      expect('steps' in payload).toBe(false); // Seedream rejects steps parameter
    });

    it('includes steps for FLUX when explicitly provided', async () => {
      config.images.together.model = 'black-forest-labs/FLUX.1-dev';
      (axios.post as any).mockResolvedValueOnce({
        data: {
          data: [{ url: 'https://example.com/image.png' }]
        }
      });

      await imageService.generateImage('a cute cat', '16:9', 28, 'together');

      const [, payload] = (axios.post as any).mock.calls[0];
      expect(payload.steps).toBe(28);
      expect(payload.width).toBe(1344);
      expect(payload.height).toBe(768);
    });

    it('clamps steps to 4 for FLUX.1-schnell', async () => {
      config.images.together.model = 'black-forest-labs/FLUX.1-schnell';
      (axios.post as any).mockResolvedValueOnce({
        data: {
          data: [{ url: 'https://example.com/image.png' }]
        }
      });

      await imageService.generateImage('a cute cat', '1:1', 20, 'together');

      const [, payload] = (axios.post as any).mock.calls[0];
      expect(payload.steps).toBe(4);
    });
  });

  describe('xAI Generation', () => {
    it('sends correct payload to xAI endpoint', async () => {
      (axios.post as any).mockResolvedValueOnce({
        data: {
          data: [{ url: 'https://example.com/grok_image.png' }]
        }
      });

      const result = await imageService.generateImage('cyberpunk city', '16:9', undefined, 'xai');

      expect(axios.post).toHaveBeenCalledTimes(1);
      const [url, payload] = (axios.post as any).mock.calls[0];

      expect(url).toBe('https://api.x.ai/v1/images/generations');
      expect(payload.model).toBe('grok-imagine-image');
      expect(payload.aspect_ratio).toBe('16:9');
      expect(result.relativePath).toBe('/storage/generated/mock_img.png');
    });
  });
});
