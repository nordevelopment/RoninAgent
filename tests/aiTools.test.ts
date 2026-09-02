import { describe, it, expect, vi } from 'vitest';
import { extractPathArgument, AITools } from '../src/backend/ai/AITools.js';
import { FileSystemManager } from '../src/backend/services/FileSystemManager.js';
import { WebPageContent } from '../src/backend/services/WebPageContent.js';
import { OfficeDocumentService } from '../src/backend/services/OfficeDocumentService.js';
import path from 'path';

describe('AITools & Path Extraction', () => {
  describe('extractPathArgument', () => {
    it('returns path when path property is provided', () => {
      expect(extractPathArgument({ path: 'workspace/test.txt' })).toBe('workspace/test.txt');
    });

    it('resolves alternative aliases such as filePath, file_path, filename, file, targetPath', () => {
      expect(extractPathArgument({ filePath: 'file1.txt' })).toBe('file1.txt');
      expect(extractPathArgument({ file_path: 'file2.txt' })).toBe('file2.txt');
      expect(extractPathArgument({ filepath: 'file3.txt' })).toBe('file3.txt');
      expect(extractPathArgument({ filename: 'file4.txt' })).toBe('file4.txt');
      expect(extractPathArgument({ file: 'file5.txt' })).toBe('file5.txt');
      expect(extractPathArgument({ targetPath: 'file6.txt' })).toBe('file6.txt');
      expect(extractPathArgument({ target_path: 'file7.txt' })).toBe('file7.txt');
      expect(extractPathArgument({ name: 'file8.txt' })).toBe('file8.txt');
      expect(extractPathArgument({ outputPath: 'file9.txt' })).toBe('file9.txt');
    });

    it('resolves nested path containers such as input.path or file.path', () => {
      expect(extractPathArgument({ input: { path: 'nested/file.txt' } })).toBe('nested/file.txt');
      expect(extractPathArgument({ file: { filePath: 'nested/file2.txt' } })).toBe('nested/file2.txt');
      expect(extractPathArgument({ params: { filename: 'nested/file3.txt' } })).toBe('nested/file3.txt');
    });

    it('returns undefined when no valid path is found or args is empty', () => {
      expect(extractPathArgument(undefined)).toBeUndefined();
      expect(extractPathArgument({})).toBeUndefined();
      expect(extractPathArgument({ path: '   ' })).toBeUndefined();
      expect(extractPathArgument({ otherKey: 123 })).toBeUndefined();
    });
  });

  describe('write_file validation', () => {
    it('returns a clean and descriptive error when path is missing rather than internal validator crash', async () => {
      const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
      const webPage = new WebPageContent();
      const officeService = new OfficeDocumentService();
      const aiTools = new AITools(fsManager, webPage, officeService);

      const result = await aiTools.executeTool({
        name: 'write_file',
        arguments: { content: 'test content without path' }
      }, 'test_session');

      expect(result.result).toContain("The 'path' argument is required for tool 'write_file'");
    });

    it('accepts alternative path keys like filePath in write_file', async () => {
      const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
      vi.spyOn(fsManager, 'writeFile').mockResolvedValue(undefined as never);
      const webPage = new WebPageContent();
      const officeService = new OfficeDocumentService();
      const aiTools = new AITools(fsManager, webPage, officeService);

      const result = await aiTools.executeTool({
        name: 'write_file',
        arguments: { filePath: 'test_alternative_path_key.txt', content: 'test data' }
      }, 'test_session');

      expect(result.result).toBe('File written successfully.');
    });

    it('accepts nested path structures like input.path in write_file', async () => {
      const fsManager = new FileSystemManager([path.resolve(process.cwd(), 'workspace')]);
      vi.spyOn(fsManager, 'writeFile').mockResolvedValue(undefined as never);
      const webPage = new WebPageContent();
      const officeService = new OfficeDocumentService();
      const aiTools = new AITools(fsManager, webPage, officeService);

      const result = await aiTools.executeTool({
        name: 'write_file',
        arguments: { input: { path: 'test_nested_path.txt' }, content: 'nested data' }
      }, 'test_session');

      expect(result.result).toBe('File written successfully.');
    });
  });
});
