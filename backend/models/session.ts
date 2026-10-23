/**
 * Session - Chat Session Model
 * Author: Norayr Petrosyan
 */

export interface Session {
  id: string;
  agent_id: string;
  title?: string;
  created_at: Date;
}

export interface CreateSession {
  id: string;
  agent_id?: string;
  title?: string;
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
    const rows = await this.db.select('sessions');
    return rows as Session[];
  }

  async findLast(): Promise<Session | null> {
    const rows = await this.db.query('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1');
    return rows.rows[0] as Session || null;
  }

  async deleteById(id: string): Promise<number> {
    return await this.db.delete('sessions', { id });
  }

  async updateTitle(id: string, title: string): Promise<number> {
    return await this.db.update('sessions', { title }, { id });
  }

  async updateAgentId(oldAgentId: string, newAgentId: string): Promise<number> {
    return await this.db.update('sessions', { agent_id: newAgentId }, { agent_id: oldAgentId });
  }
}