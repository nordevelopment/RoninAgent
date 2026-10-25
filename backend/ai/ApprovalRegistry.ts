import { randomUUID } from 'crypto';
import { DatabaseClient } from '../database/DatabaseClient.js';

export interface ApprovalRequest {
  id: string;
  runId: string;
  sessionId: string;
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export class ApprovalRegistry {
  private pending = new Map<string, { sessionId: string; resolve: (allowed: boolean) => void }>();

  constructor(private db: DatabaseClient) {}

  async request(
    input: Omit<ApprovalRequest, 'id'>,
    notify: (request: ApprovalRequest) => void | Promise<void>,
    signal: AbortSignal,
    timeoutMs = 120_000
  ): Promise<boolean> {
    if (signal.aborted) return false;
    const request = { ...input, id: randomUUID() };
    await this.db.insert('agent_approvals', {
      id: request.id, run_id: request.runId, session_id: request.sessionId,
      call_id: request.callId, name: request.name,
      arguments: JSON.stringify(request.arguments), status: 'pending'
    });

    return new Promise<boolean>((resolve) => {
      let finished = false;
      const complete = (allowed: boolean, status: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.pending.delete(request.id);
        void this.db.run(
          'UPDATE agent_approvals SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?',
          [status, request.id, 'pending']
        ).then(() => resolve(allowed), () => resolve(false));
      };
      const abort = () => complete(false, 'cancelled');
      const timer = setTimeout(() => complete(false, 'timeout'), timeoutMs);
      this.pending.set(request.id, { sessionId: request.sessionId, resolve: allowed => complete(allowed, allowed ? 'approved' : 'denied') });
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve().then(() => notify(request)).catch(() => complete(false, 'delivery_failed'));
    });
  }

  resolve(id: string, sessionId: string, allow: boolean): boolean {
    const request = this.pending.get(id);
    if (!request || request.sessionId !== sessionId) return false;
    request.resolve(allow);
    return true;
  }
}
