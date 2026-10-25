import { randomUUID } from 'crypto';
import { DatabaseClient } from '../database/DatabaseClient.js';

export type RunStatus = 'running' | 'done' | 'partial' | 'stopped' | 'failed' | 'interrupted';

export class RunStore {
  constructor(private db: DatabaseClient) {}

  async start(sessionId: string, origin: string): Promise<string> {
    const id = randomUUID();
    await this.db.insert('agent_runs', { id, session_id: sessionId, origin, status: 'running' });
    return id;
  }

  async step(id: string, step: number, promptTokens = 0, completionTokens = 0, durationMs = 0): Promise<void> {
    await this.db.run(
      'INSERT INTO agent_run_steps (run_id, step, prompt_tokens, completion_tokens, duration_ms) VALUES (?, ?, ?, ?, ?)',
      [id, step, promptTokens, completionTokens, durationMs]
    );
    await this.db.run(
      'UPDATE agent_runs SET step = ?, prompt_tokens = prompt_tokens + ?, completion_tokens = completion_tokens + ? WHERE id = ?',
      [step, promptTokens, completionTokens, id]
    );
  }

  async toolStart(runId: string, callId: string, step: number, name: string, args: unknown): Promise<void> {
    await this.db.insert('agent_run_tools', {
      run_id: runId, call_id: callId, step, name, arguments: JSON.stringify(args), status: 'running'
    });
  }

  async toolEnd(runId: string, callId: string, status: string, result: unknown): Promise<void> {
    await this.db.run(
      'UPDATE agent_run_tools SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP WHERE run_id = ? AND call_id = ?',
      [status, JSON.stringify(result), runId, callId]
    );
  }

  async finish(id: string, status: RunStatus, result?: string): Promise<void> {
    await this.db.run(
      'UPDATE agent_runs SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, result ?? null, id]
    );
  }

  async latest(sessionId: string): Promise<{ id: string; status: RunStatus; step: number; result: string | null } | null> {
    const result = await this.db.query(
      'SELECT id, status, step, result FROM agent_runs WHERE session_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1',
      [sessionId]
    );
    return (result.rows[0] as any) || null;
  }

  async details(id: string, sessionId: string): Promise<{ run: unknown; steps: unknown[]; tools: unknown[] } | null> {
    const run = (await this.db.query('SELECT * FROM agent_runs WHERE id = ? AND session_id = ?', [id, sessionId])).rows[0];
    if (!run) return null;
    const steps = (await this.db.query('SELECT * FROM agent_run_steps WHERE run_id = ? ORDER BY step', [id])).rows;
    const tools = (await this.db.query('SELECT * FROM agent_run_tools WHERE run_id = ? ORDER BY step, started_at', [id])).rows;
    return { run, steps, tools };
  }

  async recover(): Promise<void> {
    await this.db.run("UPDATE agent_runs SET status = 'interrupted', finished_at = CURRENT_TIMESTAMP WHERE status = 'running'");
    await this.db.run("UPDATE agent_run_tools SET status = 'interrupted', finished_at = CURRENT_TIMESTAMP WHERE status = 'running'");
    await this.db.run("UPDATE agent_approvals SET status = 'interrupted', decided_at = CURRENT_TIMESTAMP WHERE status = 'pending'");
  }
}
