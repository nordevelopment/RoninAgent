/**
 * Session - Chat Session Model
 * Author: Norayr Petrosyan
 */

export interface Session {
  id: string;
  agent_id: string;
  title?: string;
  workspace_folder?: string | null;
  created_at: Date;
}

export interface CreateSession {
  id: string;
  agent_id?: string;
  title?: string;
  workspace_folder?: string | null;
}

import { DatabaseClient } from '../database/DatabaseClient.js';

export class Session {
  constructor(private db: DatabaseClient) { }

  async create(dto: CreateSession): Promise<number> {
    return await this.db.insert('sessions', dto as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<Session | null> {
    const rows = await this.db.select('sessions', { id });
    return rows[0] as Session || null;
  }

  async findAll(): Promise<Session[]> {
    const rows = await this.db.query(`
      SELECT s.*, (
        SELECT m.content FROM messages m
        WHERE m.session_id = s.id AND m.role = 'user'
        ORDER BY m.id LIMIT 1
      ) AS first_user_message
      FROM sessions s
      WHERE s.id LIKE 'session_%'
        AND EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.role = 'user')
      ORDER BY s.created_at DESC, s.rowid DESC
    `);
    return rows.rows as Session[];
  }

  async findLast(): Promise<Session | null> {
    const rows = await this.db.query(`
      SELECT s.* FROM sessions s
      WHERE s.id LIKE 'session_%'
        AND EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.role = 'user')
      ORDER BY s.created_at DESC, s.rowid DESC LIMIT 1
    `);
    return rows.rows[0] as Session || null;
  }

  async deleteById(id: string): Promise<number> {
    return await this.db.delete('sessions', { id });
  }

  async isWorkspaceFolderUsedByAnotherSession(folder: string, sessionId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM sessions WHERE workspace_folder = ? AND id <> ? LIMIT 1',
      [folder, sessionId]
    );
    return result.rows.length > 0;
  }

  async updateTitle(id: string, title: string): Promise<number> {
    return await this.db.update('sessions', { title }, { id });
  }

  async updateWorkspaceFolder(id: string, folder: string | null): Promise<number> {
    return await this.db.update('sessions', { workspace_folder: folder }, { id });
  }

  async updateAgentId(oldAgentId: string, newAgentId: string): Promise<number> {
    return await this.db.update('sessions', { agent_id: newAgentId }, { agent_id: oldAgentId });
  }
}
