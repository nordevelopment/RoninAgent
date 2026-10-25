import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import Fastify from 'fastify';
import { FileSystemManager } from '../backend/services/FileSystemManager.js';
import { AITools } from '../backend/ai/AITools.js';
import { DatabaseClient } from '../backend/database/DatabaseClient.js';
import { RunStore } from '../backend/ai/RunStore.js';
import { ApprovalRegistry } from '../backend/ai/ApprovalRegistry.js';
import { SessionManager } from '../backend/ai/SessionManager.js';
import { TaskModel } from '../backend/models/task.js';
import { ChatManager } from '../backend/ai/ChatManager.js';
import { AIClient } from '../backend/ai/AIClient.js';
import { ChatHistoryManager } from '../backend/ai/ChatHistoryManager.js';
import { MemoryManager } from '../backend/ai/MemoryManager.js';
import { config } from '../backend/config.js';
import { isPrivateIp } from '../backend/utils/urlValidator.js';
import { registerRoutes } from '../backend/routes.js';

const tempRoots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-runtime-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'chosen'));
  return { root, manager: new FileSystemManager([root]) };
}

describe('agent runtime boundaries', () => {
  it('creates a workspace on the first turn, keeps a chosen folder, and removes only the session-owned folder', async () => {
    const { root, manager } = workspace();
    const db = new DatabaseClient(':memory:');
    try {
      await db.initialize();
      const sessions = new SessionManager(db);
      const aiClient = new AIClient();
      vi.spyOn(aiClient, 'sendMessage').mockResolvedValue({ content: 'Done', toolCalls: [] });
      const tools = new AITools(manager);
      tools.setWorkspaceResolver(async id => (await sessions.getSession(id))?.workspace_folder || null);
      const chat = new ChatManager({
        aiClient, historyManager: new ChatHistoryManager(db), sessionManager: sessions,
        tools, memoryManager: new MemoryManager(db), fsManager: manager
      });
      const automatic = 'session_auto';
      await sessions.createSession(automatic);
      expect(fs.existsSync(path.join(root, automatic))).toBe(false);
      await chat.sendMessage('Hello', automatic);
      expect((await sessions.getSession(automatic))?.workspace_folder).toBe(automatic);
      expect(fs.statSync(path.join(root, automatic)).isDirectory()).toBe(true);
      fs.writeFileSync(path.join(root, automatic, 'note.txt'), 'owned');
      await sessions.setWorkspaceFolder(automatic, 'chosen');

      const chosen = 'session_chosen';
      await sessions.createSession(chosen);
      await sessions.setWorkspaceFolder(chosen, 'chosen');
      await chat.sendMessage('Hello', chosen);
      expect((await sessions.getSession(chosen))?.workspace_folder).toBe('chosen');
      expect(fs.existsSync(path.join(root, chosen))).toBe(false);
      fs.writeFileSync(path.join(root, 'chosen', 'keep.txt'), 'user data');

      expect(await chat.deleteSession(automatic)).toBe(1);
      expect(fs.existsSync(path.join(root, automatic))).toBe(false);
      expect(await sessions.getSession(automatic)).toBeNull();
      expect(await chat.deleteSession(chosen)).toBe(1);
      expect(fs.readFileSync(path.join(root, 'chosen', 'keep.txt'), 'utf8')).toBe('user data');
    } finally { db.close(); }
  });

  it('does not delete a generated folder while another session uses it', async () => {
    const { root, manager } = workspace();
    const db = new DatabaseClient(':memory:');
    try {
      await db.initialize();
      const sessions = new SessionManager(db);
      await sessions.createSession('session_owner');
      await sessions.createSession('session_other');
      await sessions.setWorkspaceFolder('session_owner', 'session_owner');
      await sessions.setWorkspaceFolder('session_other', path.join(root, 'session_owner'));
      fs.mkdirSync(path.join(root, 'session_owner'));
      const chat = new ChatManager({
        aiClient: new AIClient(), historyManager: new ChatHistoryManager(db), sessionManager: sessions,
        tools: new AITools(manager), memoryManager: new MemoryManager(db), fsManager: manager
      });
      await expect(chat.deleteSession('session_owner')).rejects.toThrow(/Another session uses/);
      expect(await sessions.getSession('session_owner')).not.toBeNull();
      expect(fs.existsSync(path.join(root, 'session_owner'))).toBe(true);
    } finally { db.close(); }
  });

  it('rejects symbolic links and deletion of the workspace root', async () => {
    const { root, manager } = workspace();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-outside-'));
    tempRoots.push(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    const link = path.join(root, 'chosen', 'link');
    try { fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '')) return;
      throw error;
    }
    expect(() => manager.validatePath('chosen/link/secret.txt')).toThrow(/symbolic link/i);
    await expect(manager.deleteDirectory('.', true)).rejects.toThrow(/workspace root/i);
    expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });

  it('requires a selected folder, prevents cross-folder access and enforces actual reads before overwrite', async () => {
    const { root, manager } = workspace();
    fs.mkdirSync(path.join(root, 'other'));
    fs.writeFileSync(path.join(root, 'chosen', 'existing.txt'), 'old');
    const tools = new AITools(manager);
    tools.setWorkspaceResolver(async () => null);
    const noFolder = await tools.executeTool({ name: 'write_file', arguments: { path: 'new.txt', content: 'x' } }, 's');
    expect(noFolder.result).toContain('Select a workspace folder');
    tools.setWorkspaceResolver(async () => 'chosen');
    const cross = await tools.executeTool({ name: 'read_file', arguments: { path: 'workspace/other/file.txt' } }, 's');
    expect(cross.result).toContain('outside the selected session folder');
    const denied = await tools.executeTool({ name: 'write_file', arguments: { path: 'existing.txt', content: 'new' } }, 's');
    expect(denied.result).toContain('before overwriting it in this session');
    expect((await tools.executeTool({ name: 'read_file', arguments: { path: 'existing.txt' } }, 's')).result).toBe('old');
    expect((await tools.executeTool({ name: 'write_file', arguments: { path: 'existing.txt', content: 'new' } }, 's')).result).toBe('File written successfully.');
    expect(fs.readFileSync(path.join(root, 'chosen', 'existing.txt'), 'utf8')).toBe('new');
    expect((await tools.executeTool({ name: 'write_file', arguments: { path: 'existing.txt', content: 'again' } }, 's')).result).toContain('before overwriting');
    const rootDelete = await tools.executeTool({ name: 'delete_item', arguments: { path: 'workspace/chosen', recursive: true } }, 's');
    expect(rootDelete.result).toContain('cannot delete the selected session folder');
  });

  it('uses an explicitly selected folder outside workspace for tools and uploads', async () => {
    const { root, manager } = workspace();
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-selected-'));
    tempRoots.push(external);
    const tools = new AITools(manager);
    tools.setWorkspaceResolver(async () => external);

    const write = await tools.executeTool({ name: 'write_file', arguments: { path: 'inside.txt', content: 'selected' } }, 's');
    expect(write.result).toBe('File written successfully.');
    expect(fs.readFileSync(path.join(external, 'inside.txt'), 'utf8')).toBe('selected');
    expect(fs.existsSync(path.join(root, 'inside.txt'))).toBe(false);

    const cross = await tools.executeTool({ name: 'read_file', arguments: { path: path.join(root, 'chosen', 'secret.txt') } }, 's');
    expect(cross.result).toContain('outside allowed directories');
    const uploaded = await manager.saveUploadedFile('note.txt', Buffer.from('upload'), 'text/plain', external);
    expect(uploaded.path).toBe(path.join(external, 'note.txt'));
    expect(fs.readFileSync(uploaded.path, 'utf8')).toBe('upload');

    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#18a5a5' } }).jpeg().toBuffer();
    const aiClient = new AIClient();
    const processed = await aiClient.processImage(
      { base64: `data:image/jpeg;base64,${image.toString('base64')}`, url: '' },
      'session_external', undefined, external
    );
    expect(processed.filePath).toMatch(/^\/api\/workspace\/assets\/session_external\/images\/\d+\.jpg$/);
    expect(fs.readdirSync(path.join(external, 'images'))).toHaveLength(1);
    expect(fs.existsSync(path.join(root, 'session_external'))).toBe(false);
  });

  it('selects an external session folder through the API and serves only its images', async () => {
    const { root, manager } = workspace();
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-route-folder-'));
    tempRoots.push(external);
    const db = new DatabaseClient(':memory:');
    const app = Fastify();
    try {
      await db.initialize();
      const sessions = new SessionManager(db);
      await sessions.createSession('session_route');
      const chat = new ChatManager({
        aiClient: new AIClient(), historyManager: new ChatHistoryManager(db), sessionManager: sessions,
        tools: new AITools(manager), memoryManager: new MemoryManager(db), fsManager: manager
      });
      app.addHook('onRequest', async request => { request.sessionId = 'session_route'; });
      await registerRoutes(app, chat, {} as any, {} as any, {} as any, manager);

      const selected = await app.inject({ method: 'POST', url: '/api/workspace/select', payload: { folder: external } });
      expect(selected.statusCode).toBe(200);
      expect((await sessions.getSession('session_route'))?.workspace_folder).toBe(fs.realpathSync(external));
      expect((await app.inject({ method: 'GET', url: '/api/workspace/current' })).json().selected).toBe(fs.realpathSync(external));
      expect((await app.inject({ method: 'POST', url: '/api/workspace/select', payload: { folder: 'chosen' } })).statusCode).toBe(400);

      fs.mkdirSync(path.join(external, 'images'));
      fs.writeFileSync(path.join(external, 'images', 'test.png'), Buffer.from('image'));
      const asset = await app.inject({ method: 'GET', url: '/api/workspace/assets/session_route/images/test.png' });
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toBe('image');
      expect((await app.inject({ method: 'GET', url: '/api/workspace/assets/another_session/images/test.png' })).statusCode).toBe(404);
      expect(fs.existsSync(path.join(root, 'images'))).toBe(false);
    } finally {
      await app.close();
      db.close();
    }
  });

  it('refuses a tool call when the run has already been cancelled', async () => {
    const { root, manager } = workspace();
    const tools = new AITools(manager);
    tools.setWorkspaceResolver(async () => 'chosen');
    const controller = new AbortController();
    controller.abort();
    const result = await tools.executeTool(
      { name: 'write_file', arguments: { path: 'cancelled.txt', content: 'late write' } },
      's', { signal: controller.signal }
    );
    expect(result.result).toContain('cancelled');
    expect(fs.existsSync(path.join(root, 'chosen', 'cancelled.txt'))).toBe(false);
  });

  it('persists runs, scopes approval decisions and marks interrupted work without replaying tools', async () => {
    const db = new DatabaseClient(':memory:');
    try {
      await db.initialize();
      const sessions = new SessionManager(db);
      await sessions.createSession('s');
      const runs = new RunStore(db);
      const registry = new ApprovalRegistry(db);
      const runId = await runs.start('s', 'web');
      await runs.toolStart(runId, 'call', 1, 'delete_item', { path: 'x' });
      const controller = new AbortController();
      const pending = registry.request(
        { runId, sessionId: 's', callId: 'call', name: 'delete_item', arguments: { path: 'x' } },
        request => {
          expect(registry.resolve(request.id, 'wrong-session', true)).toBe(false);
          expect(registry.resolve(request.id, 's', false)).toBe(true);
        }, controller.signal
      );
      expect(await pending).toBe(false);
      await runs.recover();
      expect((await runs.latest('s'))?.status).toBe('interrupted');
      const steps = await db.query('SELECT status FROM agent_run_tools WHERE run_id = ?', [runId]);
      expect((steps.rows[0] as any).status).toBe('interrupted');
    } finally { db.close(); }
  });

  it('claims a scheduled task once and fails an orphaned running task on restart', async () => {
    const db = new DatabaseClient(':memory:');
    try {
      await db.initialize();
      const tasks = new TaskModel(db);
      const id = await tasks.create({ title: 'test', is_auto: 1 });
      expect((await tasks.claimReadyTasks(new Date().toISOString(), true)).map(task => task.id)).toEqual([id]);
      expect(await tasks.claimReadyTasks(new Date().toISOString(), true)).toEqual([]);
      await tasks.failInterruptedTasks();
      expect((await tasks.findById(id))?.status).toBe('failed');
    } finally { db.close(); }
  });

  it('waits for a server-side decision before deleting and records a denied run as partial', async () => {
    const { root, manager } = workspace();
    const target = path.join(root, 'chosen', 'victim.txt');
    fs.writeFileSync(target, 'keep');
    const db = new DatabaseClient(':memory:');
    try {
      await db.initialize();
      const sessions = new SessionManager(db);
      await sessions.createSession('s');
      await sessions.setWorkspaceFolder('s', 'chosen');
      await sessions.updateSessionTitle('s', 'Approval test');
      const aiClient = new AIClient();
      let calls = 0;
      vi.spyOn(aiClient, 'sendMessage').mockImplementation(async () => ++calls === 1
        ? { content: '', toolCalls: [{ id: 'delete-call', type: 'function', function: { name: 'delete_item', arguments: JSON.stringify({ path: 'victim.txt' }) } }] }
        : { content: 'I could not delete the file.', toolCalls: [] });
      const tools = new AITools(manager);
      tools.setWorkspaceResolver(async () => 'chosen');
      const runStore = new RunStore(db);
      const approvals = new ApprovalRegistry(db);
      const chat = new ChatManager({
        aiClient, historyManager: new ChatHistoryManager(db), sessionManager: sessions,
        tools, memoryManager: new MemoryManager(db), runStore, approvals
      });
      const response = await chat.sendMessage('Delete victim.txt', 's', undefined, (event, data) => {
        if (event === 'approval_required') {
          expect(fs.existsSync(target)).toBe(true);
          expect(approvals.resolve(data.id, 's', false)).toBe(true);
        }
      });
      expect(response.status).toBe('partial');
      expect(fs.readFileSync(target, 'utf8')).toBe('keep');
      expect((await runStore.latest('s'))?.status).toBe('partial');
      const approval = await db.query('SELECT status FROM agent_approvals WHERE run_id = ?', [response.runId]);
      expect((approval.rows[0] as any).status).toBe('denied');
    } finally { db.close(); }
  });

  it('keeps global and session memories distinct and retrieves memories without vectors', async () => {
    const db = new DatabaseClient(':memory:');
    try {
      await db.initialize();
      const sessions = new SessionManager(db);
      await sessions.createSession('s');
      const memory = new MemoryManager(db);
      vi.spyOn(memory as any, 'getEmbedding').mockResolvedValue([]);
      await memory.saveMemory('s', 'favorite_color', 'blue', 'preference');
      await memory.saveMemory('s', 'draft', 'secret note', 'context', 'session');
      expect((await memory.searchMemories('other', 'secret note')).length).toBe(0);
      expect((await memory.searchMemories('s', 'secret note'))[0].memory.session_id).toBe('s');
      expect((await memory.searchMemories('other', 'blue'))[0].memory.session_id).toBe('global');
      const dimension = config.AI_EMBEDDING_DIM || 4096;
      const vector = Buffer.from(new Float32Array(Array(dimension).fill(0.1)).buffer);
      for (let i = 0; i < 3; i++) {
        const id = await db.insert('memories', {
          session_id: 'global', key: `vector_${i}`, value: 'unrelated', category: 'fact', content: 'unrelated'
        });
        await db.run(`INSERT INTO ${db.vectorTableName} (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)`, [id, vector]);
      }
      vi.spyOn(memory as any, 'getEmbedding').mockResolvedValue(Array(dimension).fill(0.1));
      expect((await memory.searchMemories('s', 'blue', 2))[0].memory.key).toBe('favorite_color');
      await memory.deleteMemoryByKey('s', 'draft', 'session');
      vi.spyOn(memory as any, 'getEmbedding').mockResolvedValue([]);
      expect((await memory.searchMemories('s', 'secret note')).length).toBe(0);
    } finally { db.close(); }
  });

  it('preserves the old vector table when the embedding dimension changes', async () => {
    const db = new DatabaseClient(':memory:');
    const previous = config.AI_EMBEDDING_DIM;
    try {
      config.AI_EMBEDDING_DIM = 4096;
      await db.initialize();
      await db.run('INSERT INTO vec_memories (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)', [10, Buffer.alloc(4096 * 4)]);
      config.AI_EMBEDDING_DIM = 1536;
      await db.initialize();
      expect(db.vectorTableName).toBe('vec_memories_dim_1536');
      expect((await db.query('SELECT rowid FROM vec_memories WHERE rowid = 10')).rows).toHaveLength(1);
      const memoryId = await db.insert('memories', {
        session_id: 'global', key: 'reindex', value: 'example', category: 'fact', content: 'reindex: example'
      });
      const memory = new MemoryManager(db);
      vi.spyOn(memory as any, 'getEmbedding').mockResolvedValue(Array(1536).fill(0.1));
      expect(await memory.reindexMissingVectors()).toEqual({ indexed: 1, skipped: 0 });
      expect((await db.query('SELECT rowid FROM vec_memories_dim_1536 WHERE rowid = ?', [memoryId])).rows).toHaveLength(1);
    } finally { config.AI_EMBEDDING_DIM = previous; db.close(); }
  });

  it('blocks private IPv4 mapped IPv6 addresses', () => {
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true);
    expect(isPrivateIp('::ffff:808:808')).toBe(false);
  });
});
