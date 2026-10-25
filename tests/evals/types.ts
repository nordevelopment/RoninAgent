/**
 * Types for behavioral evals (tests/evals).
 * Author: Norayr Petrosyan
 *
 * Unlike vitest unit tests (which mock AIClient to check code logic),
 * evals run the real ChatManager loop against the real model to catch
 * regressions in prompts, tool selection and guardrails.
 */

export interface ToolResultAssertion {
  /** Tool name this assertion applies to */
  tool: string;
  /** If that tool was called, its result must contain this substring */
  mustContain?: string;
  /** If that tool was called, its result must NOT contain this substring */
  mustNotContain?: string;
}

export interface EvalExpectation {
  /** Tool name that must be called at least once during the run */
  toolCalled?: string;
  /** Tool names that must NOT be called during the run */
  toolNotCalled?: string[];
  /** Assertion on the result of a specific tool call, if it happened */
  toolResult?: ToolResultAssertion;
  /** Substrings (case-insensitive) required in the final assistant response */
  responseContains?: string[];
  /** Substrings (case-insensitive) forbidden in the final assistant response */
  responseNotContains?: string[];
}

export interface EvalCase {
  id: string;
  description: string;
  input: string;
  /** Memories to seed before sending the input, to test recall (RAG) */
  memorySetup?: { key: string; value: string; category?: string }[];
  expect: EvalExpectation;
}

export interface RecordedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface EvalCaseResult {
  id: string;
  description: string;
  status: 'pass' | 'fail' | 'error';
  reasons: string[];
  responseContent?: string;
  toolCalls: RecordedToolCall[];
  durationMs: number;
}

export interface EvalRunSummary {
  runAt: string;
  model: string;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  results: EvalCaseResult[];
}
