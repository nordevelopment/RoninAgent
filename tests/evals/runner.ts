/**
 * Eval runner for RoninAgent's chat agent loop.
 * Author: Norayr Petrosyan
 *
 * Runs tests/evals/dataset.ts through the REAL ChatManager stack (real
 * model calls, real tool execution) against a disposable, sandboxed
 * workspace per case. This checks agent *behavior* (tool selection,
 * guardrails, recall), which unit tests can't cover because they mock
 * AIClient.
 *
 * Requires a working AI_API_KEY (.env or config.json) — this hits the
 * real API and costs real tokens, so it is not part of `npm test`.
 *
 * Usage: npm run evals
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { config } from '../../backend/config.js';
import { DatabaseClient } from '../../backend/database/DatabaseClient.js';
import { AIClient } from '../../backend/ai/AIClient.js';
import { ChatHistoryManager } from '../../backend/ai/ChatHistoryManager.js';
import { SessionManager } from '../../backend/ai/SessionManager.js';
import { MemoryManager } from '../../backend/ai/MemoryManager.js';
import { AITools } from '../../backend/ai/AITools.js';
import { ChatManager } from '../../backend/ai/ChatManager.js';
import { FileSystemManager } from '../../backend/services/FileSystemManager.js';
import { WebPageContent } from '../../backend/services/WebPageContent.js';
import { OfficeDocumentService } from '../../backend/services/OfficeDocumentService.js';

import { evalCases } from './dataset.js';
import type { EvalCase, EvalCaseResult, EvalRunSummary, RecordedToolCall } from './types.js';

async function runCase(evalCase: EvalCase): Promise<EvalCaseResult> {
  const startedAt = Date.now();
  const reasons: string[] = [];
  const toolCalls: RecordedToolCall[] = [];
  const sessionId = `task_eval_${evalCase.id}_${Date.now()}`;
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-eval-'));

  const db = new DatabaseClient(':memory:');

  try {
    await db.initialize();

    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);
    const fsManager = new FileSystemManager([workspaceDir]);
    const webPage = new WebPageContent();
    const officeService = new OfficeDocumentService();
    const tools = new AITools(fsManager, webPage, officeService, memoryManager);

    const chatManager = new ChatManager({
      aiClient,
      historyManager,
      tools,
      memoryManager,
      sessionManager
    });

    await sessionManager.createSession(sessionId);

    for (const memory of evalCase.memorySetup ?? []) {
      await memoryManager.saveMemory(sessionId, memory.key, memory.value, memory.category);
    }

    const response = await chatManager.sendMessage(
      evalCase.input,
      sessionId,
      undefined,
      async (event, data) => {
        if (event === 'tool_start') {
          toolCalls.push({ name: data.name, arguments: data.arguments });
        } else if (event === 'tool_done') {
          const pending = [...toolCalls].reverse().find(c => c.name === data.name && c.result === undefined);
          if (pending) pending.result = data.result;
        }
      }
    );

    const { toolCalled, toolNotCalled, toolResult, responseContains, responseNotContains } = evalCase.expect;
    const responseText = (response.content || '').toLowerCase();

    if (toolCalled && !toolCalls.some(c => c.name === toolCalled)) {
      reasons.push(`expected tool "${toolCalled}" to be called, but it wasn't`);
    }

    for (const forbidden of toolNotCalled ?? []) {
      if (toolCalls.some(c => c.name === forbidden)) {
        reasons.push(`tool "${forbidden}" was called but should not have been`);
      }
    }

    if (toolResult) {
      const called = toolCalls.filter(c => c.name === toolResult.tool);
      for (const call of called) {
        const resultText = typeof call.result === 'string' ? call.result : JSON.stringify(call.result);
        if (toolResult.mustContain && !resultText.includes(toolResult.mustContain)) {
          reasons.push(`result of "${toolResult.tool}" did not contain "${toolResult.mustContain}": ${resultText.slice(0, 200)}`);
        }
        if (toolResult.mustNotContain && resultText.includes(toolResult.mustNotContain)) {
          reasons.push(`result of "${toolResult.tool}" unexpectedly contained "${toolResult.mustNotContain}": ${resultText.slice(0, 200)}`);
        }
      }
    }

    for (const needle of responseContains ?? []) {
      if (!responseText.includes(needle.toLowerCase())) {
        reasons.push(`response did not contain "${needle}"`);
      }
    }

    for (const needle of responseNotContains ?? []) {
      if (responseText.includes(needle.toLowerCase())) {
        reasons.push(`response unexpectedly contained "${needle}"`);
      }
    }

    return {
      id: evalCase.id,
      description: evalCase.description,
      status: reasons.length === 0 ? 'pass' : 'fail',
      reasons,
      responseContent: response.content,
      toolCalls,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      id: evalCase.id,
      description: evalCase.description,
      status: 'error',
      reasons: [`eval crashed: ${(error as Error).message}`],
      toolCalls,
      durationMs: Date.now() - startedAt
    };
  } finally {
    db.close();
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
}

async function main() {
  if (!config.AI_API_KEY) {
    console.error('AI_API_KEY is not set (.env or config.json). Evals call the real model and cannot run without it.');
    process.exit(1);
  }

  console.log(`Running ${evalCases.length} eval case(s) against model "${config.AI_DEFAULT_MODEL}"...\n`);

  const results: EvalCaseResult[] = [];
  for (const evalCase of evalCases) {
    process.stdout.write(`  ${evalCase.id} ... `);
    const result = await runCase(evalCase);
    results.push(result);

    const marker = result.status === 'pass' ? 'PASS' : result.status === 'fail' ? 'FAIL' : 'ERROR';
    console.log(`${marker} (${result.durationMs}ms)`);
    for (const reason of result.reasons) {
      console.log(`      - ${reason}`);
    }
  }

  const summary: EvalRunSummary = {
    runAt: new Date().toISOString(),
    model: String(config.AI_DEFAULT_MODEL),
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    errored: results.filter(r => r.status === 'error').length,
    results
  };

  console.log(`\n${summary.passed}/${summary.total} passed` +
    (summary.failed ? `, ${summary.failed} failed` : '') +
    (summary.errored ? `, ${summary.errored} errored` : ''));

  const resultsDir = path.join(process.cwd(), 'tests', 'evals', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const fileName = `${summary.runAt.replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(resultsDir, fileName), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Results written to tests/evals/results/${fileName}`);

  process.exit(summary.failed > 0 || summary.errored > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Eval runner crashed:', error);
  process.exit(1);
});
