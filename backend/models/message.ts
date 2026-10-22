/**
 * Message - Chat Message Model
 * Author: Norayr Petrosyan
 */
import { DatabaseClient } from '../database/DatabaseClient.js';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: number;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: string;
  created_at: Date;
}

export interface CreateMessage {
  session_id: string;
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: string;
}


export class Message {
  constructor(private db: DatabaseClient) { }

  /**
   * Создать сообщение
   */
  async create(dto: CreateMessage): Promise<number> {
    return await this.db.insert('messages', dto as unknown as Record<string, unknown>);
  }

  /**
   * Получить сообщения по session_id в порядке добавления
   */
  async findBySessionId(sessionId: string): Promise<Message[]> {
    const result = await this.db.query(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC',
      [sessionId]
    );
    return result.rows as Message[];
  }

  /**
   * Удалить сообщения по session_id
   */
  async deleteBySessionId(sessionId: string): Promise<number> {
    return await this.db.delete('messages', { session_id: sessionId });
  }

  /**
   * Удалить сообщение по id
   */
  async deleteById(id: number): Promise<number> {
    return await this.db.delete('messages', { id });
  }
}