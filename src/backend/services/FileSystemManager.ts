/**
 * FileSystemManager.ts - File system management
 * Safe file and directory operations for AI tools
 * Author: Norayr Petrosyan
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create directory if not exists (synchronous)
 */
function ensureDir(dirPath: string): void {
  try {
    fsSync.mkdirSync(dirPath, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

export interface UploadedFileInfo {
  name: string;
  savedName: string;
  path: string;
  size: number;
  mimetype?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: Date;
}

export interface ReadFileOptions {
  encoding?: BufferEncoding;
  limit?: number; // максимальное количество байт для чтения
}

export class FileSystemManager {
  private allowedRoots: string[];

  constructor(allowedRoots?: string[]) {
    // По умолчанию разрешаем работу только в workspace
    const projectRoot = path.join(__dirname, '../../../');
    this.allowedRoots = allowedRoots || [path.join(projectRoot, 'workspace')];

    // Автоматически создаем разрешённые директории
    this.initializeDirectories();
  }

  /**
   * Инициализация разрешённых директорий
   */
  private initializeDirectories(): void {
    for (const root of this.allowedRoots) {
      ensureDir(root);
    }
  }

  /**
   * Проверить, что путь находится в разрешённой директории
   */
  public validatePath(targetPath: string): string {
    let normalizedPath = path.normalize(targetPath);

    // Если путь относительный, конвертируем в абсолютный относительно первого allowedRoot
    if (!path.isAbsolute(normalizedPath)) {
      let cleanPath = targetPath.replace(/\\/g, '/');
      if (cleanPath.startsWith('workspace/')) {
        cleanPath = cleanPath.substring(10);
      }
      normalizedPath = path.normalize(path.join(this.allowedRoots[0], cleanPath));
    }

    const isAllowed = this.allowedRoots.some(root => {
      const normalizedRoot = path.normalize(root);
      const relative = path.relative(normalizedRoot, normalizedPath);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    });

    if (!isAllowed) {
      throw new Error(`Access denied: path ${targetPath} is outside allowed directories`);
    }

    return normalizedPath;
  }

  /**
   * Прочитать файл
   */
  async readFile(filePath: string, options: ReadFileOptions = {}): Promise<string> {
    const validatedPath = this.validatePath(filePath);

    const stats = await fs.stat(validatedPath);
    if (stats.isDirectory()) {
      throw new Error(`Path ${filePath} is a directory, not a file`);
    }

    const limit = config.AI_MAX_FILE_READ_SIZE || 1024 * 1024; // Use config value or fallback to 1MB
    if (stats.size > limit) {
      const handle = await fs.open(validatedPath, 'r');
      try {
        const buffer = Buffer.alloc(limit);
        await handle.read(buffer, 0, limit, 0);
        const text = buffer.toString(options.encoding || 'utf-8');
        return `${text}\n\n[WARNING: File was truncated. Total size is ${stats.size} bytes, but only the first ${limit} bytes were read to prevent OOM/token burn.]`;
      } finally {
        await handle.close();
      }
    }

    if (options.limit && stats.size > options.limit) {
      throw new Error(`File ${validatedPath} exceeds size limit of ${options.limit} bytes`);
    }

    return await fs.readFile(validatedPath, options.encoding || 'utf-8');
  }

  /**
   * Записать файл
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const validatedPath = this.validatePath(filePath);

    const dir = path.dirname(validatedPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(validatedPath, content, 'utf-8');
  }

  /**
   * Удалить файл
   */
  async deleteFile(filePath: string): Promise<void> {
    const validatedPath = this.validatePath(filePath);

    const stats = await fs.stat(validatedPath);
    if (stats.isDirectory()) {
      throw new Error(`Path ${validatedPath} is a directory, use deleteDirectory instead`);
    }

    await fs.unlink(validatedPath);
  }

  /**
   * Листинг директории
   */
  async listDirectory(dirPath: string): Promise<FileInfo[]> {
    const validatedPath = this.validatePath(dirPath);

    const stats = await fs.stat(validatedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path ${validatedPath} is not a directory`);
    }

    const entries = await fs.readdir(validatedPath, { withFileTypes: true });

    return entries.map(entry => {
      const fullPath = path.join(validatedPath, entry.name);
      return {
        name: entry.name,
        path: fullPath,
        size: 0, // заполним ниже
        isDirectory: entry.isDirectory(),
        modifiedAt: new Date()
      };
    });
  }

  /**
   * Создать директорию
   */
  async createDirectory(dirPath: string, recursive: boolean = true): Promise<void> {
    const validatedPath = this.validatePath(dirPath);
    await fs.mkdir(validatedPath, { recursive });
  }

  /**
   * Удалить директорию
   */
  async deleteDirectory(dirPath: string, recursive: boolean = false): Promise<void> {
    const validatedPath = this.validatePath(dirPath);

    const stats = await fs.stat(validatedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path ${validatedPath} is not a directory`);
    }

    if (recursive) {
      await fs.rm(validatedPath, { recursive: true, force: true });
    } else {
      await fs.rmdir(validatedPath);
    }
  }

  /**
   * Проверить существование файла
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const validatedPath = this.validatePath(filePath);
      const stats = await fs.stat(validatedPath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Проверить существование директории
   */
  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const validatedPath = this.validatePath(dirPath);
      const stats = await fs.stat(validatedPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Получить информацию о файле/директории
   */
  async getStats(itemPath: string): Promise<FileInfo> {
    const validatedPath = this.validatePath(itemPath);

    const stats = await fs.stat(validatedPath);
    return {
      name: path.basename(validatedPath),
      path: validatedPath,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      modifiedAt: stats.mtime
    };
  }

  /**
   * Копировать файл
   */
  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    const validatedSource = this.validatePath(sourcePath);
    const validatedDest = this.validatePath(destPath);

    const destDir = path.dirname(validatedDest);
    await fs.mkdir(destDir, { recursive: true });

    await fs.copyFile(validatedSource, validatedDest);
  }

  /**
   * Переместить/переименовать файл
   */
  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    const validatedSource = this.validatePath(sourcePath);
    const validatedDest = this.validatePath(destPath);

    const destDir = path.dirname(validatedDest);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(validatedSource, validatedDest);
  }

  /**
   * Save an uploaded file into session workspace folder safely
   */
  async saveUploadedFile(
    sessionId: string,
    originalFilename?: string,
    buffer?: Buffer,
    mimetype?: string
  ): Promise<UploadedFileInfo> {
    const sessionFolderName = sessionId.startsWith('session_') || sessionId.startsWith('telegram_')
      ? sessionId
      : `session_${sessionId}`;

    const projectRoot = path.join(__dirname, '../../../');
    const sessionDir = path.join(projectRoot, 'workspace', sessionFolderName);
    await fs.mkdir(sessionDir, { recursive: true });

    const rawName = originalFilename || 'uploaded_document';
    const cleanName = path.basename(rawName).replace(/[^\w\d_.\-\s\u0400-\u04FF]/g, '_');
    const targetFilePath = path.join(sessionDir, cleanName);

    if (buffer) {
      await fs.writeFile(targetFilePath, buffer);
    }

    const stats = await fs.stat(targetFilePath);
    const relativeWorkspacePath = `${sessionFolderName}/${cleanName}`;

    return {
      name: rawName,
      savedName: cleanName,
      path: relativeWorkspacePath,
      size: stats.size,
      mimetype
    };
  }

  /**
   * Open workspace root directory in operating system's native file explorer
   */
  async openWorkspaceInExplorer(): Promise<string> {
    const projectRoot = path.join(__dirname, '../../../');
    const workspacePath = path.resolve(projectRoot, 'workspace');
    await fs.mkdir(workspacePath, { recursive: true });

    const platform = process.platform;
    let command = '';
    if (platform === 'win32') {
      command = `start "" "${workspacePath}"`;
    } else if (platform === 'darwin') {
      command = `open "${workspacePath}"`;
    } else {
      command = `xdg-open "${workspacePath}"`;
    }

    return new Promise((resolve) => {
      exec(command, (err) => {
        if (err && platform === 'win32') {
          exec(`explorer "${workspacePath}"`, () => resolve(workspacePath));
        } else {
          resolve(workspacePath);
        }
      });
    });
  }
}
