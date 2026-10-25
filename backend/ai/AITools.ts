/**
 * AITools.ts - Tools/functions for AI
 * Responsible for executing functions that AI can call
 * Author: Norayr Petrosyan
 */

import fsSync from 'fs';
import path from 'path';
import { FileSystemManager } from "../services/FileSystemManager.js";
import { sessionWorkspace } from '../services/SessionWorkspace.js';
import { WebPageContent } from "../services/WebPageContent.js";
import { imageService } from "../services/imageService.js";
import { MemoryManager } from "./MemoryManager.js";
import { browserService } from "../services/BrowserService.js";
import { OfficeDocumentService, ExcelSheetData, DocxDocumentData, ExcelEditOperation } from "../services/OfficeDocumentService.js";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
}

export interface ToolExecutionContext {
  toolCall: ToolCall;
  sessionId?: string;
  readHistory: Map<string, Set<string>>;
  fsManager: FileSystemManager;
  webPage: WebPageContent;
  officeService: OfficeDocumentService;
  memoryManager?: MemoryManager;
  signal?: AbortSignal;
  workspaceFolder?: string | null;
}

export interface ToolMiddleware {
  name: string;
  onBeforeExecute?: (ctx: ToolExecutionContext) => Promise<ToolResult | void>;
  onAfterExecute?: (ctx: ToolExecutionContext, result: ToolResult) => Promise<ToolResult>;
  onError?: (ctx: ToolExecutionContext, error: Error) => Promise<ToolResult | void>;
}

/**
 * Helper to extract path argument taking all aliases, casing, and nested structures into account
 */
export function extractPathArgument(args?: Record<string, unknown>): string | undefined {
  if (!args || typeof args !== 'object') return undefined;

  // 1. Direct candidate keys check
  const candidateKeys = [
    'path', 'filePath', 'file_path', 'filepath',
    'targetPath', 'target_path', 'targetpath',
    'filename', 'fileName', 'file_name',
    'file', 'name', 'target',
    'outputPath', 'output_path', 'output',
    'destination', 'dest',
    'relative_path', 'relativePath', 'rel_path',
    'doc_name', 'document_name', 'uri', 'location'
  ];

  for (const key of candidateKeys) {
    const val = (args as any)[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }

  // 2. Check nested containers if present (e.g. args.input.path, args.params.filePath)
  const containerKeys = ['input', 'params', 'arguments', 'data', 'payload', 'options', 'body', 'file'];
  for (const containerKey of containerKeys) {
    const container = (args as any)[containerKey];
    if (container && typeof container === 'object' && !Array.isArray(container)) {
      const nestedPath = extractPathArgument(container as Record<string, unknown>);
      if (nestedPath) return nestedPath;
    }
  }

  return undefined;
}

/**
 * Middleware: requireReadBeforeWrite Security Policy
 */
const RequireReadBeforeWriteMiddleware: ToolMiddleware = {
  name: 'RequireReadBeforeWrite',
  async onBeforeExecute(ctx) {
    if (ctx.toolCall.name === 'write_file') {
      let p = extractPathArgument(ctx.toolCall.arguments);
      if (!p) {
        const sId = ctx.sessionId || 'default';
        const sessionFolder = sId.startsWith('session_') || sId.startsWith('telegram_') ? sId : `session_${sId}`;
        const contentStr = typeof ctx.toolCall.arguments?.content === 'string' ? ctx.toolCall.arguments.content : '';

        if (ctx.toolCall.arguments?.sheets || Array.isArray(ctx.toolCall.arguments?.sheets)) {
          p = `${sessionFolder}/spreadsheet.xlsx`;
        } else if (ctx.toolCall.arguments?.html || contentStr.includes('<!DOCTYPE html') || contentStr.includes('<html')) {
          p = `${sessionFolder}/document.html`;
        } else if (contentStr.includes('# Goal') || contentStr.includes('PLAN') || contentStr.includes('# Strategy')) {
          p = `${sessionFolder}/PLAN.md`;
        } else if (contentStr.startsWith('# ') || contentStr.includes('\n# ')) {
          p = `${sessionFolder}/document.md`;
        } else {
          p = `${sessionFolder}/output.txt`;
        }

        if (!ctx.toolCall.arguments) ctx.toolCall.arguments = {};
        ctx.toolCall.arguments.path = p;
      }
      const normalized = ctx.fsManager.validatePath(p);
      const fileExists = fsSync.existsSync(normalized);
      const sId = ctx.sessionId || 'default';
      const sessionReads = ctx.readHistory.get(sId);

      if (fileExists && (!sessionReads || !sessionReads.has(normalized))) {
        throw new Error(`Read ${p} before overwriting it in this session`);
      }
    }
  },
  async onAfterExecute(ctx, result) {
    const { name, arguments: args } = ctx.toolCall;
    const p = extractPathArgument(args);
    if (name === 'read_file' && p && !(typeof result.result === 'string' && result.result.startsWith('Error'))) {
      try {
        const normalized = ctx.fsManager.validatePath(p);
        const sId = ctx.sessionId || 'default';
        if (!ctx.readHistory.has(sId)) {
          ctx.readHistory.set(sId, new Set());
        }
        ctx.readHistory.get(sId)!.add(normalized);
      } catch {
        // Ignore path validation errors if execution didn't throw
      }
    }
    if (name === 'write_file' && p) {
      ctx.readHistory.get(ctx.sessionId || 'default')?.delete(ctx.fsManager.validatePath(p));
    }
    return result;
  }
};

/**
 * Middleware: Truncate large tool output strings to prevent context window pollution
 */
const OutputTruncationMiddleware: ToolMiddleware = {
  name: 'OutputTruncation',
  async onAfterExecute(_ctx, toolResult) {
    const maxChars = 100000;
    const serialized = typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result);
    if (serialized && serialized.length > maxChars) {
      const truncated = serialized.slice(0, maxChars);
      return {
        ...toolResult,
        result: `${truncated}\n\n[TRUNCATED: Output exceeded ${maxChars} characters limit. (${serialized.length} characters total)]`
      };
    }
    return toolResult;
  }
};

/**
 * Middleware: Graceful fallback for dynamic web scraping errors
 */
const GracefulFallbackMiddleware: ToolMiddleware = {
  name: 'GracefulFallback',
  async onError(ctx, error) {
    if (ctx.toolCall.name === 'fetch_web_page') {
      const isDynamic = (ctx.toolCall.arguments.dynamic ?? true) === true;
      if (isDynamic && !ctx.signal?.aborted) {
        try {
          const staticContent = await ctx.webPage.fetchPage({
            url: ctx.toolCall.arguments.url as string,
            dynamic: false,
            signal: ctx.signal
          });
          return {
            name: ctx.toolCall.name,
            result: `[FALLBACK_STATIC_FETCH]: Dynamic rendering failed (${error.message}). Switched to static fetch:\n\n${staticContent}`
          };
        } catch {
          // If fallback fails too, let default error handler process it
          return undefined;
        }
      }
    }
    return undefined;
  }
};

export class AITools {
  private fsManager: FileSystemManager;
  private webPage: WebPageContent;
  private officeService: OfficeDocumentService;
  private memoryManager?: MemoryManager;
  private workspaceResolver?: (sessionId: string) => Promise<string | null>;

  setWorkspaceResolver(resolver: (sessionId: string) => Promise<string | null>): void {
    this.workspaceResolver = resolver;
  }

  private enforceWorkspace(ctx: ToolExecutionContext): void {
    const name = ctx.toolCall.name;
    const fileTools = new Set([
      'read_file', 'read_excel', 'read_docx', 'read_pdf', 'write_file',
      'edit_excel', 'generate_pdf', 'generate_excel', 'generate_docx',
      'list_directory', 'create_directory', 'delete_item', 'move_or_rename', 'get_file_info', 'generate_image'
    ]);
    if (!fileTools.has(name)) return;
    if (!ctx.workspaceFolder) throw new Error('Select a workspace folder for this session before using file tools');
    const root = sessionWorkspace(ctx.workspaceFolder, ctx.fsManager).root;
    const args = ctx.toolCall.arguments;
    const check = (value: unknown, fallback?: string): string => {
      const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
      if (!raw) throw new Error(`A file path is required for ${name}`);
      const explicit = path.isAbsolute(raw) || /^workspace[\\/]/i.test(raw) || raw === 'workspace';
      const candidate = explicit ? raw : path.join(root, raw);
      const resolved = ctx.fsManager.validatePath(candidate);
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Access denied: path is outside the selected session folder');
      }
      return resolved;
    };
    if (name === 'generate_image') return;
    if (name === 'move_or_rename') {
      args.source = check(args.source ?? args.from ?? args.src ?? args.oldPath);
      args.destination = check(args.destination ?? args.to ?? args.dest ?? args.newPath);
      return;
    }
    const supplied = name === 'list_directory' ? args.path ?? args.dir ?? args.directory : extractPathArgument(args);
    const fallback = name === 'list_directory' ? root :
      name === 'generate_pdf' ? 'document.pdf' :
      name === 'generate_excel' ? 'spreadsheet.xlsx' :
      name === 'generate_docx' ? 'document.docx' :
      name === 'write_file' ? 'output.txt' : undefined;
    args.path = check(supplied, fallback);
    if (name === 'delete_item' && args.recursive && args.path === root) {
      throw new Error('Access denied: cannot delete the selected session folder');
    }
  }

  /**
   * Tracks files that have been read in each session to enforce
   * requireReadBeforeWrite workspace security policy.
   */
  private readHistory = new Map<string, Set<string>>();

  /**
   * Registered tool middlewares pipeline
   */
  private middlewares: ToolMiddleware[] = [
    RequireReadBeforeWriteMiddleware,
    OutputTruncationMiddleware,
    GracefulFallbackMiddleware
  ];

  constructor(memoryManager?: MemoryManager);
  constructor(
    fsManager?: FileSystemManager,
    webPage?: WebPageContent,
    officeService?: OfficeDocumentService,
    memoryManager?: MemoryManager
  );
  constructor(
    arg1?: MemoryManager | FileSystemManager,
    arg2?: WebPageContent,
    arg3?: OfficeDocumentService,
    arg4?: MemoryManager
  ) {
    if (arg1 instanceof FileSystemManager) {
      this.fsManager = arg1;
      this.webPage = arg2 || new WebPageContent();
      this.officeService = arg3 || new OfficeDocumentService();
      this.memoryManager = arg4;
    } else {
      this.memoryManager = arg1;
      this.fsManager = new FileSystemManager();
      this.webPage = new WebPageContent();
      this.officeService = new OfficeDocumentService();
    }
  }

  /**
   * Register a custom tool middleware
   */
  public registerMiddleware(middleware: ToolMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Clear session read history (useful for tests or session resets)
   */
  public clearReadHistory(sessionId?: string): void {
    if (sessionId) {
      this.readHistory.delete(sessionId);
    } else {
      this.readHistory.clear();
    }
  }

  async requiresApproval(toolCall: ToolCall, sessionId: string): Promise<boolean> {
    let manager = this.fsManager;
    let folder: string | null = null;
    if (this.workspaceResolver) {
      folder = await this.workspaceResolver(sessionId);
      if (folder) manager = sessionWorkspace(folder, this.fsManager).manager;
      this.enforceWorkspace({
        toolCall, sessionId, workspaceFolder: folder, fsManager: manager,
        webPage: this.webPage, officeService: this.officeService,
        memoryManager: this.memoryManager, readHistory: this.readHistory
      });
    }
    if (['delete_item', 'move_or_rename', 'delete_memory', 'edit_excel'].includes(toolCall.name)) return true;
    if (!['write_file', 'generate_pdf', 'generate_excel', 'generate_docx'].includes(toolCall.name)) return false;
    if (!folder) return false;
    const supplied = extractPathArgument(toolCall.arguments);
    if (!supplied) return false;
    const candidate = path.isAbsolute(supplied) || /^workspace[\\/]/i.test(supplied)
      ? supplied : path.join(folder, supplied);
    const checked = manager.validatePath(candidate);
    if (toolCall.name === 'write_file' && !this.readHistory.get(sessionId)?.has(checked)) return false;
    return fsSync.existsSync(checked);
  }

  /**
   * Execute a tool through the middleware lifecycle pipeline
   * @param toolCall - tool call from AI
   * @param sessionId - optional session identifier
   * @returns execution result
   */
  async executeTool(toolCall: ToolCall, sessionId?: string, options: { signal?: AbortSignal } = {}): Promise<ToolResult> {
    const ctx: ToolExecutionContext = {
      toolCall,
      sessionId,
      readHistory: this.readHistory,
      fsManager: this.fsManager,
      webPage: this.webPage,
      officeService: this.officeService,
      memoryManager: this.memoryManager,
      signal: options.signal
    };

    try {
      if (options.signal?.aborted) throw new Error('Tool execution cancelled');
      const schema = this.getAvailableTools().find(tool => tool.function.name === toolCall.name)?.function.parameters;
      if (!schema) {
        throw new Error(`Unknown tool: ${toolCall.name}`);
      }
      if (!toolCall.arguments || typeof toolCall.arguments !== 'object' || Array.isArray(toolCall.arguments)) {
        throw new Error('Tool arguments must be an object');
      }
      if (JSON.stringify(toolCall.arguments).length > 2_000_000) throw new Error('Tool arguments exceed the size limit');
      for (const [key, spec] of Object.entries(schema.properties as Record<string, any>)) {
        const value = toolCall.arguments[key];
        if (value === undefined || value === null) continue;
        if (spec.type === 'integer' && (!Number.isInteger(value) || (spec.minimum !== undefined && value < spec.minimum) || (spec.maximum !== undefined && value > spec.maximum))) {
          throw new Error(`Invalid ${key}: expected an integer within the allowed range`);
        }
        if (spec.type === 'array' && !Array.isArray(value)) throw new Error(`Invalid ${key}: expected an array`);
        if (['string', 'boolean'].includes(spec.type) && typeof value !== spec.type) {
          throw new Error(`Invalid ${key}: expected ${spec.type}`);
        }
        if (spec.enum && !spec.enum.includes(value)) throw new Error(`Invalid ${key}: unsupported value`);
      }
      for (const key of schema.required as string[]) {
        if (key === 'path' && ['write_file', 'generate_pdf', 'generate_docx', 'generate_excel'].includes(toolCall.name)) continue;
        if (toolCall.arguments[key] === undefined && !(key === 'path' && extractPathArgument(toolCall.arguments))) {
          throw new Error(key === 'path'
            ? `The 'path' argument is required for tool '${toolCall.name}'`
            : `Missing required argument: ${key}`);
        }
      }
      if (this.workspaceResolver) {
        ctx.workspaceFolder = await this.workspaceResolver(sessionId || '');
        if (ctx.workspaceFolder) ctx.fsManager = sessionWorkspace(ctx.workspaceFolder, this.fsManager).manager;
        this.enforceWorkspace(ctx);
      }
      // 1. Before Execute Hooks
      for (const mw of this.middlewares) {
        if (mw.onBeforeExecute) {
          const earlyResult = await mw.onBeforeExecute(ctx);
          if (earlyResult) {
            return earlyResult;
          }
        }
      }

      // 2. Core Tool Execution
      let result = await this.executeCoreTool(ctx);
      if (options.signal?.aborted) throw new Error('Tool execution cancelled');

      // 3. After Execute Hooks
      for (const mw of this.middlewares) {
        if (mw.onAfterExecute) {
          result = await mw.onAfterExecute(ctx, result);
        }
      }

      return result;
    } catch (error) {
      // 4. Error Recovery Hooks
      for (const mw of this.middlewares) {
        if (mw.onError) {
          try {
            const fallbackResult = await mw.onError(ctx, error as Error);
            if (fallbackResult) {
              return fallbackResult;
            }
          } catch {
            // Ignore error handler failures, continue down pipeline
          }
        }
      }

      return { name: toolCall.name, result: `Error executing tool: ${(error as Error).message}` };
    }
  }

  /**
   * Raw execution of core tool logic
   */
  private async executeCoreTool(ctx: ToolExecutionContext): Promise<ToolResult> {
    const { name, arguments: args } = ctx.toolCall;
    const { sessionId } = ctx;

    const getPath = (): string => {
      let target = extractPathArgument(args);
      if (!target) {
        const sId = sessionId || 'default';
        const sessionFolder = sId.startsWith('session_') || sId.startsWith('telegram_') ? sId : `session_${sId}`;
        if (name === 'write_file') {
          const contentStr = typeof args?.content === 'string' ? args.content : '';
          if (args?.sheets) target = `${sessionFolder}/spreadsheet.xlsx`;
          else if (args?.html || contentStr.includes('<!DOCTYPE html') || contentStr.includes('<html')) target = `${sessionFolder}/document.html`;
          else if (contentStr.includes('# Goal') || contentStr.includes('PLAN')) target = `${sessionFolder}/PLAN.md`;
          else if (contentStr.startsWith('# ') || contentStr.includes('\n# ')) target = `${sessionFolder}/document.md`;
          else target = `${sessionFolder}/output.txt`;
          if (args) args.path = target;
        } else if (name === 'generate_pdf') {
          target = `${sessionFolder}/document.pdf`;
          if (args) args.path = target;
        } else if (name === 'generate_excel') {
          target = `${sessionFolder}/spreadsheet.xlsx`;
          if (args) args.path = target;
        } else if (name === 'generate_docx') {
          target = `${sessionFolder}/document.docx`;
          if (args) args.path = target;
        } else if (name === 'read_file' || name === 'read_excel' || name === 'read_docx' || name === 'read_pdf') {
          throw new Error(`The 'path' argument is required for tool '${name}'. Please provide a valid file path.`);
        } else {
          target = `${sessionFolder}/output.txt`;
          if (args) args.path = target;
        }
      }
      return target;
    };

    let result: any;

    switch (name) {
      case 'read_file': {
        const p = getPath();
        const ext = path.extname(p).toLowerCase();
        const validP = ctx.fsManager.validatePath(p);
        if (ext === '.pdf') {
          result = await this.officeService.readPdf(validP, { maxPages: args?.maxPages as number | undefined });
        } else if (ext === '.docx' || ext === '.doc') {
          result = await this.officeService.readDocx(validP);
        } else if (ext === '.xlsx' || ext === '.xls') {
          result = await this.officeService.readExcel(validP, {
            sheetName: args?.sheetName as string | undefined,
            limitRows: args?.limitRows as number | undefined
          });
        } else {
          result = await ctx.fsManager.readFile(p, { encoding: args?.encoding as BufferEncoding });
        }
        break;
      }
      case 'read_excel': {
        const p = getPath();
        const validP = ctx.fsManager.validatePath(p);
        result = await this.officeService.readExcel(validP, {
          sheetName: args?.sheetName as string | undefined,
          limitRows: args?.limitRows as number | undefined
        });
        break;
      }
      case 'edit_excel': {
        const p = getPath();
        const validP = ctx.fsManager.validatePath(p);
        await this.officeService.editExcel(validP, args?.operations as ExcelEditOperation[]);
        result = `Excel spreadsheet ${p} updated successfully.`;
        break;
      }
      case 'read_docx': {
        const p = getPath();
        const validP = ctx.fsManager.validatePath(p);
        result = await this.officeService.readDocx(validP);
        break;
      }
      case 'read_pdf': {
        const p = getPath();
        const validP = ctx.fsManager.validatePath(p);
        result = await this.officeService.readPdf(validP, { maxPages: args?.maxPages as number | undefined });
        break;
      }
      case 'write_file': {
        const p = getPath();
        const ext = path.extname(p).toLowerCase();
        const validP = ctx.fsManager.validatePath(p);

        if (ext === '.pdf') {
          const htmlContent = (args?.html as string) || (args?.content as string) || '';
          await browserService.generatePdf(htmlContent, validP);
          result = `PDF successfully generated and saved to ${p}`;
        } else if (ext === '.docx' || ext === '.doc') {
          const content = (args?.content as string) || (args?.markdown as string) || (args?.document as DocxDocumentData) || '';
          await this.officeService.createDocx(validP, content);
          result = `Word document successfully generated and saved to ${p}`;
        } else if (ext === '.xlsx' || ext === '.xls') {
          const sheets = (args?.sheets as ExcelSheetData[]) || [];
          await this.officeService.createExcel(validP, sheets);
          result = `Excel spreadsheet successfully generated and saved to ${p}`;
        } else {
          await ctx.fsManager.writeFile(p, (args?.content as string) || '');
          result = "File written successfully.";
        }
        break;
      }
      case 'list_directory': {
        const targetDir = (args?.path || args?.filePath || args?.file_path || args?.dir || args?.directory || '') as string;
        result = await ctx.fsManager.listDirectory(targetDir);
        break;
      }
      case 'create_directory': {
        const p = getPath();
        await ctx.fsManager.createDirectory(p);
        result = `Directory ${p} created successfully.`;
        break;
      }
      case 'delete_item': {
        const p = getPath();
        if (args?.recursive) await ctx.fsManager.deleteDirectory(p, true);
        else await ctx.fsManager.deleteFile(p);
        result = "Object deleted successfully.";
        break;
      }
      case 'move_or_rename': {
        const source = (args?.source || args?.from || args?.src || args?.oldPath) as string;
        const destination = (args?.destination || args?.to || args?.dest || args?.newPath) as string;
        if (!source || !destination) {
          throw new Error("Both 'source' and 'destination' path arguments are required for move_or_rename.");
        }
        await ctx.fsManager.moveFile(source, destination);
        result = "Move/rename completed successfully.";
        break;
      }
      case 'get_file_info': {
        const p = getPath();
        result = await ctx.fsManager.getStats(p);
        break;
      }
      case 'fetch_web_page': {
        result = await this.webPage.fetchPage({
          url: args?.url as string,
          dynamic: args?.dynamic as boolean | undefined,
          signal: ctx.signal
        });
        break;
      }
      case 'generate_pdf': {
        let targetPath = getPath();
        if (!targetPath.toLowerCase().endsWith('.pdf')) {
          targetPath += '.pdf';
        }
        const pdfPath = ctx.fsManager.validatePath(targetPath);
        const htmlContent = (args?.html as string) || (args?.content as string) || '';
        await browserService.generatePdf(htmlContent, pdfPath);
        result = `PDF successfully generated and saved to ${targetPath}`;
        break;
      }
      case 'generate_excel': {
        const targetPath = getPath();
        const excelPath = ctx.fsManager.validatePath(targetPath);
        await this.officeService.createExcel(excelPath, (args?.sheets as ExcelSheetData[]) || []);
        result = `Excel spreadsheet successfully generated and saved to ${targetPath}`;
        break;
      }
      case 'generate_docx': {
        const targetPath = getPath();
        const docxPath = ctx.fsManager.validatePath(targetPath);
        const content = (args?.content as string) || (args?.markdown as string) || (args?.document as DocxDocumentData) || '';
        await this.officeService.createDocx(docxPath, content);
        result = `Word document successfully generated and saved to ${targetPath}`;
        break;
      }
      case 'generate_image':
        result = await imageService.generateImage(
          args.prompt as string,
          args.aspectRatio as string | undefined,
          args.steps as number | undefined,
          args.provider as 'together' | 'xai' | undefined,
          sessionId,
          ctx.workspaceFolder ?? undefined,
          ctx.signal
        );
        break;
      case 'save_memory':
        if (!this.memoryManager) throw new Error("MemoryManager is not configured on this agent.");
        if (!sessionId) throw new Error("Session ID is required for memory operations.");
        result = await this.memoryManager.saveMemory(
          sessionId,
          args.key as string,
          args.value as string,
          (args.category as string) || 'personal',
          args.scope === 'session' ? 'session' : 'global'
        );
        break;
      case 'search_memories': {
        if (!this.memoryManager) throw new Error("MemoryManager is not configured on this agent.");
        if (!sessionId) throw new Error("Session ID is required for memory operations.");
        const searchResults = await this.memoryManager.searchMemories(
          sessionId,
          args.query as string,
          (args.limit as number) || 5
        );
        result = searchResults.map(r => ({
          key: r.memory.key,
          value: r.memory.value,
          category: r.memory.category,
          similarity: r.similarity
        }));
        break;
      }
      case 'delete_memory':
        if (!this.memoryManager) throw new Error("MemoryManager is not configured on this agent.");
        if (!sessionId) throw new Error("Session ID is required for memory operations.");
        await this.memoryManager.deleteMemoryByKey(sessionId, args.key as string, args.scope === 'session' ? 'session' : 'global');
        result = `Memory with key '${args.key}' deleted successfully.`;
        break;
      default:
        throw new Error(`Tool ${name} is not implemented.`);
    }

    return { name, result };
  }

  /**
   * Get available tools in OpenAI Function Calling format
   * @returns Array of tool descriptions
   */
  getAvailableTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Reads the contents of a file. Automatically extracts clean text/markdown and structured data from text files (.txt, .md, .csv, .json, code), PDF documents (.pdf), Word documents (.docx), and Excel spreadsheets (.xlsx, .xls). Use paths inside the current session folder; relative paths start there.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the file relative to the workspace or the absolute path within the workspace' },
              sheetName: { type: 'string', description: 'Optional: Specific sheet name to read for Excel files (.xlsx)' },
              limitRows: { type: 'integer', description: 'Optional: Max rows to read per sheet for Excel files (default: 100)' },
              maxPages: { type: 'integer', description: 'Optional: Max pages to read for PDF files (default: all)' },
              encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: "Creates or overwrites any file or document in the current session folder. Automatically generates Word documents (.docx) from Markdown, PDF documents (.pdf) from styled HTML, Excel spreadsheets (.xlsx) from sheets data, or standard text/code files (.txt, .md, .py, .json, .csv). SECURITY POLICY: If the target file already exists on disk, you MUST call 'read_file' first in the current session to inspect its contents before overwriting it. Use paths inside the current session folder; relative paths start there.",
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Output path relative to workspace (e.g. session_xxx/report.docx, session_xxx/invoice.pdf, session_xxx/budget.xlsx, session_xxx/app.ts)' },
              content: { type: 'string', description: 'Content to write: Text/code for regular files; Markdown for Word documents (.docx); styled HTML for PDF documents (.pdf)' },
              sheets: {
                type: 'array',
                description: 'For Excel files (.xlsx): Array of sheets [{ name: "Sheet1", columns: [{ header: "Name", key: "name" }], rows: [{ name: "Alice" }] }]',
                items: { type: 'object' }
              }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'Shows a list of files and folders in the specified directory. All paths must stay inside the current session folder.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the directory relative to the workspace or the absolute path within the workspace' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_directory',
          description: 'Creates a directory inside the current session folder.',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'Directory path' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_item',
          description: 'Deletes a file or directory. All paths must stay inside the current session folder.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the object to delete (within workspace)' },
              recursive: { type: 'boolean', description: 'Whether to delete recursively (for directories)' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'move_or_rename',
          description: 'Moves or renames a file or directory. All paths must stay inside the current session folder.',
          parameters: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'From where (within workspace)' },
              destination: { type: 'string', description: 'To where (within workspace)' }
            },
            required: ['source', 'destination']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_file_info',
          description: 'Gets information about a file: size, modification date, type. All paths must stay inside the current session folder.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the object (within workspace)' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'fetch_web_page',
          description: 'Gets web page content by direct URL. Uses headless browser (Puppeteer) or static HTTP fetch to render pages, execute scripts and extract clean markdown content.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL of the page to retrieve' },
              dynamic: { type: 'boolean', description: 'Defaults to true (uses Puppeteer browser). Set to false only for raw API calls or static text.', default: true }
            },
            required: ['url']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'save_memory',
          description: 'Saves or updates an important fact about the user, preference, or context in long-term memory.',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Short snake_case unique key for the memory (e.g. user_name, favorite_pizza).' },
              value: { type: 'string', description: 'The description/value to remember.' },
              category: {
                type: 'string',
                enum: ['personal', 'preference', 'event', 'goal', 'task', 'information', 'intention', 'fact', 'context'],
                default: 'personal',
                description: 'Category classification.'
              },
              scope: { type: 'string', enum: ['global', 'session'], default: 'global', description: 'Global preference across chats, or fact limited to this session.' }
            },
            required: ['key', 'value']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_memories',
          description: 'Searches stored memories semantically or using keyword matches for relevant information.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The topic, keyword, or query to search for.' },
              limit: { type: 'integer', default: 5, description: 'Max results to return.' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_memory',
          description: 'Deletes a specific fact from memory using its key.',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'The exact key of the memory to delete.' },
              scope: { type: 'string', enum: ['global', 'session'], default: 'global' }
            },
            required: ['key']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_image',
          description: 'Generates an image from a text prompt using AI. Returns the relative path. IMPORTANT: You MUST display the generated image in your response using markdown syntax: ![Caption](relative_path).',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'The detailed description of the image to generate.' },
              aspectRatio: {
                type: 'string',
                enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
                default: '2:3',
                description: 'The aspect ratio of the generated image.'
              },
              steps: {
                type: 'integer',
                minimum: 1,
                maximum: 50,
                description: 'Optional number of steps (quality/time trade-off).'
              },
              provider: {
                type: 'string',
                enum: ['together', 'xai'],
                default: 'together',
                description: 'The image generation provider.'
              }
            },
            required: ['prompt']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'edit_excel',
          description: 'Updates an existing Excel spreadsheet (.xlsx) in the workspace by updating specific cells, adding rows, or adding sheets.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to Excel file in workspace (e.g. session_xxx/data.xlsx)' },
              operations: {
                type: 'array',
                description: 'List of update operations: [{ sheetName: "Sheet1", cellUpdates: [{ cell: "B2", value: 150 }], appendRows: [["New item", 200]] }]',
                items: { type: 'object' }
              }
            },
            required: ['path', 'operations']
          }
        }
      }
    ];
  }
}
