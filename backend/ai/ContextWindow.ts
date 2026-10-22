/**
 * ContextWindow.ts - Fits chat history into the model context window
 * Pure functions, no I/O. Design: CONTEXT_WINDOW_PLAN.md, section 4.
 * Author: Norayr Petrosyan
 */
import type { AIMessages } from './AIClient.js';
import type { StoredMessage } from './ChatHistoryManager.js';

type ContentItem = Exclude<AIMessages['content'], string | null>[number];

/** Measured on the previous request: what we estimated vs what the provider counted */
export interface ContextAnchor {
  roughTokens: number;
  actualPromptTokens: number;
}

/**
 * Per-session compression state. Watermarks are message ids and only move forward,
 * so the start of the request stays byte-identical between steps and the provider
 * prompt cache keeps hitting.
 */
export interface ContextState {
  model: string;
  /** Tool results with id below this are replaced by a short note */
  elideToolResultsBeforeId: number;
  /** Images in user messages with id below this are replaced by a text marker */
  elideImagesBeforeId: number;
  /** Whole turns starting below this id are dropped */
  dropTurnsBeforeId: number;
  anchor?: ContextAnchor;
}

export interface FitContextInput {
  /** Full session history in insertion order, without the system message */
  messages: StoredMessage[];
  /** Rough tokens of everything sent besides the history: system prompt, skills, tool schemas */
  fixedTokens: number;
  budget: number;
  model: string;
  state?: ContextState;
  /** Retry after a context overflow: compress harder than usual */
  aggressive?: boolean;
}

export interface FitContextResult {
  messages: StoredMessage[];
  /** Watermarks to keep for the next step; the anchor is still the previous one */
  state: ContextState;
  /** Rough size of the whole fitted request; becomes the anchor together with usage.prompt_tokens */
  roughTokens: number;
  estimatedTokens: number;
  /** Even maximum compression did not reach the budget (the current turn alone is too big) */
  overBudget: boolean;
}

export interface Turn {
  /** Index of the first message (inclusive) */
  start: number;
  /** Index after the last message (exclusive) */
  end: number;
  /** Index of the user message that opens the turn; -1 for messages before the first user message */
  userIndex: number;
}

export const DEFAULT_CONTEXT_LENGTH = 64_000;
export const IMAGE_TOKENS = 1_200;

// Conservative on purpose: Cyrillic text and JSON tokenize denser than English prose
const CHARS_PER_TOKEN = 2.5;
const MESSAGE_OVERHEAD_TOKENS = 4;
const SAFETY_MARGIN_RATIO = 0.05;
const TARGET_RATIO = 0.7;
const AGGRESSIVE_TARGET_RATIO = 0.5;
const KEEP_FULL_TOOL_RESULTS = 3;
const AGGRESSIVE_KEEP_FULL_TOOL_RESULTS = 1;
const KEEP_IMAGE_USER_TURNS = 2;
const LONG_ARGUMENT_CHARS = 1_000;
const MIN_TRUNCATED_RESULT_CHARS = 500;
const MIN_ANCHOR_RATIO = 0.25;
const MAX_ANCHOR_RATIO = 4;
const DESCRIBED_ARGUMENT_KEYS = ['path', 'url', 'source', 'query', 'key', 'prompt'];
const MAX_DESCRIBED_ARGUMENT_CHARS = 120;
const MIN_PLAUSIBLE_CONTEXT_LENGTH = 1_000;

const INTERRUPTED_TOOL_RESULT = '[No result: the tool call was interrupted before it finished.]';

const CONTEXT_LIMIT_PATTERNS = [
  /maximum context length is\s*([\d,]+)/i,
  /context (?:length|window|limit)(?: is| of)\s*([\d,]+)/i,
  />\s*([\d,]+)\s*maximum/i,
  /maximum (?:of )?([\d,]+) tokens/i
];

/**
 * Space for the prompt: context length minus the reserved answer and a safety margin.
 * The answer reserve is capped at half of the context so an oversized AI_MAX_TOKENS
 * cannot leave the prompt with no room at all.
 */
export function computeBudget(contextLength: number, maxOutputTokens: number): number {
  const outputReserve = Math.min(Math.max(0, maxOutputTokens), Math.floor(contextLength / 2));
  const safetyMargin = Math.ceil(contextLength * SAFETY_MARGIN_RATIO);
  return Math.max(0, contextLength - outputReserve - safetyMargin);
}

/** Extracts the real context limit from a provider overflow message, if it names one */
export function parseContextLimit(message: string): number | undefined {
  for (const pattern of CONTEXT_LIMIT_PATTERNS) {
    const match = message.match(pattern);
    if (!match) continue;
    const value = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value >= MIN_PLAUSIBLE_CONTEXT_LENGTH) {
      return value;
    }
  }
  return undefined;
}

export function roughTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function roughMessageTokens(message: AIMessages): number {
  let chars = 0;
  let images = 0;

  if (typeof message.content === 'string') {
    chars += message.content.length;
  } else if (Array.isArray(message.content)) {
    for (const item of message.content) {
      if (item.type === 'image_url') {
        images++;
      } else {
        chars += item.text?.length ?? 0;
      }
    }
  }

  for (const call of message.tool_calls ?? []) {
    chars += call.id.length + call.function.name.length + (call.function.arguments?.length ?? 0);
  }
  chars += message.tool_call_id?.length ?? 0;

  return Math.ceil(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKENS + MESSAGE_OVERHEAD_TOKENS;
}

export function roughTokens(messages: AIMessages[]): number {
  return messages.reduce((sum, message) => sum + roughMessageTokens(message), 0);
}

/**
 * Exact prompt size of the previous request plus the rough size of what changed since.
 * The change is scaled by the measured actual/rough ratio in the pessimistic direction:
 * growth is never counted smaller than rough, shrinking never bigger than measured.
 * Without that, eliding 100k rough tokens of English text (really ~60k) would look
 * like a much bigger win than it is and the request would still overflow.
 */
export function estimateTokens(currentRoughTokens: number, anchor?: ContextAnchor): number {
  const ratio = anchorRatio(anchor);
  if (!anchor || ratio === undefined) {
    return currentRoughTokens;
  }
  const delta = currentRoughTokens - anchor.roughTokens;
  const scaled = delta >= 0 ? delta * Math.max(1, ratio) : delta * Math.min(1, ratio);
  return Math.max(0, Math.ceil(anchor.actualPromptTokens + scaled));
}

function anchorRatio(anchor?: ContextAnchor): number | undefined {
  if (!anchor || anchor.roughTokens <= 0 || anchor.actualPromptTokens <= 0) return undefined;
  return Math.min(MAX_ANCHOR_RATIO, Math.max(MIN_ANCHOR_RATIO, anchor.actualPromptTokens / anchor.roughTokens));
}

/** Groups messages into turns: a user message and everything after it until the next user message */
export function splitIntoTurns(messages: AIMessages[]): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < messages.length; i++) {
    const isUser = messages[i].role === 'user';
    if (isUser || turns.length === 0) {
      turns.push({ start: i, end: i + 1, userIndex: isUser ? i : -1 });
    } else {
      turns[turns.length - 1].end = i + 1;
    }
  }
  return turns;
}

/**
 * Makes every assistant tool call have exactly one result right after it, and drops results
 * without a call. A stop between saving tool_calls and running the tools leaves calls
 * without results, and providers reject such history with HTTP 400 on every next request.
 * Inserted results reuse the id of the message before them so ids stay non-decreasing.
 */
export function repairToolPairs(messages: StoredMessage[]): StoredMessage[] {
  const repaired: StoredMessage[] = [];
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];

    if (message.role === 'tool') {
      // A result not directly preceded by its call group is an orphan
      index++;
      continue;
    }

    repaired.push(message);
    index++;

    if (message.role !== 'assistant' || !message.tool_calls?.length) {
      continue;
    }

    const pending = new Set(message.tool_calls.map(call => call.id));
    while (index < messages.length && messages[index].role === 'tool') {
      const result = messages[index];
      if (result.tool_call_id && pending.has(result.tool_call_id)) {
        pending.delete(result.tool_call_id);
        repaired.push(result);
      }
      index++;
    }

    for (const call of message.tool_calls) {
      if (pending.has(call.id)) {
        repaired.push({
          id: repaired[repaired.length - 1].id,
          role: 'tool',
          tool_call_id: call.id,
          content: INTERRUPTED_TOOL_RESULT
        });
      }
    }
  }

  return repaired;
}

function describeToolCall(name: string, rawArguments: string | undefined): string {
  let target = '';
  try {
    const args = JSON.parse(rawArguments || '{}');
    if (args && typeof args === 'object') {
      const key = DESCRIBED_ARGUMENT_KEYS.find(k => typeof args[k] === 'string' && args[k].length > 0);
      if (key) {
        const value: string = args[key];
        target = value.length > MAX_DESCRIBED_ARGUMENT_CHARS ? `${value.slice(0, MAX_DESCRIBED_ARGUMENT_CHARS)}...` : value;
      }
    }
  } catch {
    // Unparseable arguments: the tool name alone still tells the model what was there
  }
  return target ? `${name} ${target}` : name;
}

function contentLength(content: AIMessages['content']): number {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum, item) => sum + (item.text?.length ?? 0), 0);
}

function contentText(content: AIMessages['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(item => item.text ?? '').join('\n');
}

function elideToolResult(message: StoredMessage, description: string): StoredMessage {
  const length = contentLength(message.content);
  const note = `[Tool result removed to save context: ${description}, ${length} chars. Call the tool again if you need it.]`;
  // Small results (and interruption notes) are cheaper to keep than to describe
  if (note.length >= length) return message;
  return { ...message, content: note };
}

function truncateToolResult(message: StoredMessage, keepChars: number): StoredMessage {
  const text = contentText(message.content);
  if (keepChars >= text.length) return message;
  return {
    ...message,
    content: `${text.slice(0, keepChars)}\n\n[Tool result truncated to save context: showing the first ${keepChars} of ${text.length} chars.]`
  };
}

/**
 * Shortens long string values inside tool call arguments (e.g. write_file content).
 * The arguments stay valid JSON with the same keys: some providers parse them and reject
 * anything else, and the model still sees which file it wrote.
 */
function shrinkToolCallArguments(message: StoredMessage): StoredMessage {
  if (!message.tool_calls?.length) return message;

  let changed = false;
  const shrinkValue = (value: unknown): unknown => {
    if (typeof value === 'string' && value.length > LONG_ARGUMENT_CHARS) {
      changed = true;
      return `[removed to save context: ${value.length} chars]`;
    }
    if (Array.isArray(value)) return value.map(shrinkValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shrinkValue(v)]));
    }
    return value;
  };

  const toolCalls = message.tool_calls.map(call => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.function.arguments || '{}');
    } catch {
      return call;
    }
    const shrunk = shrinkValue(parsed);
    return { ...call, function: { ...call.function, arguments: JSON.stringify(shrunk) } };
  });

  return changed ? { ...message, tool_calls: toolCalls } : message;
}

function elideImages(message: StoredMessage): StoredMessage {
  if (!Array.isArray(message.content) || !message.content.some(item => item.type === 'image_url')) {
    return message;
  }
  const content: ContentItem[] = message.content.map(item => {
    if (item.type !== 'image_url') return item;
    const url = item.image_url?.url ?? '';
    // A data: URL would put the whole base64 payload back as text
    const marker = url && !url.startsWith('data:') ? `[image: ${url}]` : '[image removed to save context]';
    return { type: 'text', text: marker };
  });
  return { ...message, content };
}

function freshState(model: string): ContextState {
  return { model, elideToolResultsBeforeId: 0, elideImagesBeforeId: 0, dropTurnsBeforeId: 0 };
}

/**
 * Returns the history to send: under budget it only applies the existing watermarks;
 * over budget it moves them forward until the estimate is at the target (70% of the budget,
 * 50% in aggressive mode), in this order:
 *   A. elide old tool results (the last 3 stay full, 1 in aggressive mode)
 *   B. replace images older than the last 2 user turns with text markers
 *   C. drop the oldest whole turns (never the current one)
 *   D. current turn still too big: keep only the last tool result full, then head-cut it
 * The input array and its messages are never mutated.
 */
export function fitContext(input: FitContextInput): FitContextResult {
  const { fixedTokens, budget, model, aggressive = false } = input;
  const messages = repairToolPairs(input.messages);
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;

  let state: ContextState = input.state && input.state.model === model ? { ...input.state } : freshState(model);
  // Watermarks past the end mean the history was cleared and ids may be reused
  if (
    state.elideToolResultsBeforeId > lastId + 1 ||
    state.elideImagesBeforeId > lastId + 1 ||
    state.dropTurnsBeforeId > lastId + 1
  ) {
    state = freshState(model);
  }

  const turns = splitIntoTurns(messages);
  if (turns.length === 0) {
    return { messages: [], state, roughTokens: fixedTokens, estimatedTokens: estimateTokens(fixedTokens, state.anchor), overBudget: false };
  }
  const currentTurn = turns[turns.length - 1];

  // Which assistant message each tool result belongs to, and the last result id of each call group
  const ownerOf = new Map<number, number>();
  const lastResultIdOf = new Map<number, number>();
  const descriptionOf = new Map<number, string>();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== 'assistant' || !message.tool_calls?.length) continue;
    const callsById = new Map(message.tool_calls.map(call => [call.id, call]));
    for (let j = i + 1; j < messages.length && messages[j].role === 'tool'; j++) {
      ownerOf.set(j, i);
      lastResultIdOf.set(i, messages[j].id);
      const call = callsById.get(messages[j].tool_call_id ?? '');
      descriptionOf.set(j, call ? describeToolCall(call.function.name, call.function.arguments) : 'tool');
    }
  }

  const dropped = new Array<boolean>(messages.length).fill(false);
  const shown: StoredMessage[] = messages.slice();
  const cost: number[] = new Array<number>(messages.length).fill(0);

  const render = (i: number): StoredMessage => {
    let message = messages[i];
    if (message.role === 'tool' && message.id < state.elideToolResultsBeforeId) {
      message = elideToolResult(message, descriptionOf.get(i) ?? 'tool');
    } else if (message.role === 'assistant' && (lastResultIdOf.get(i) ?? Infinity) < state.elideToolResultsBeforeId) {
      message = shrinkToolCallArguments(message);
    } else if (message.role === 'user' && message.id < state.elideImagesBeforeId) {
      message = elideImages(message);
    }
    return message;
  };

  let total = fixedTokens;
  const isTurnDropped = (turn: Turn) => turn !== currentTurn && messages[turn.start].id < state.dropTurnsBeforeId;
  for (const turn of turns) {
    const drop = isTurnDropped(turn);
    for (let i = turn.start; i < turn.end; i++) {
      dropped[i] = drop;
      if (drop) continue;
      shown[i] = render(i);
      cost[i] = roughMessageTokens(shown[i]);
      total += cost[i];
    }
  }

  const rerender = (i: number) => {
    if (dropped[i]) return;
    shown[i] = render(i);
    const next = roughMessageTokens(shown[i]);
    total += next - cost[i];
    cost[i] = next;
  };
  const estimate = () => estimateTokens(total, state.anchor);
  const target = Math.floor(budget * (aggressive ? AGGRESSIVE_TARGET_RATIO : TARGET_RATIO));
  const fitsTarget = () => estimate() <= target;

  const elideToolResultsKeeping = (keepFull: number) => {
    const fullResults: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (!dropped[i] && messages[i].role === 'tool' && messages[i].id >= state.elideToolResultsBeforeId) {
        fullResults.push(i);
      }
    }
    for (const i of fullResults.slice(0, Math.max(0, fullResults.length - keepFull))) {
      if (fitsTarget()) return;
      state.elideToolResultsBeforeId = messages[i].id + 1;
      // Equal ids (inserted interruption results) cross the watermark together
      for (let j = i; j < messages.length && messages[j].id <= messages[i].id; j++) {
        if (messages[j].role === 'tool') rerender(j);
      }
      const owner = ownerOf.get(i);
      if (owner !== undefined) rerender(owner);
    }
  };

  if (aggressive || estimate() > budget) {
    // Level A
    elideToolResultsKeeping(aggressive ? AGGRESSIVE_KEEP_FULL_TOOL_RESULTS : KEEP_FULL_TOOL_RESULTS);

    // Level B
    if (!fitsTarget()) {
      const userTurns = turns.filter(turn => turn.userIndex >= 0);
      const protectedFrom = userTurns.length > KEEP_IMAGE_USER_TURNS
        ? userTurns[userTurns.length - KEEP_IMAGE_USER_TURNS].userIndex
        : 0;
      for (const turn of userTurns) {
        if (turn.userIndex >= protectedFrom || fitsTarget()) break;
        if (dropped[turn.userIndex]) continue;
        state.elideImagesBeforeId = Math.max(state.elideImagesBeforeId, messages[turn.userIndex].id + 1);
        rerender(turn.userIndex);
      }
    }

    // Level C
    for (const turn of turns) {
      if (turn === currentTurn || fitsTarget()) break;
      if (dropped[turn.start]) continue;
      state.dropTurnsBeforeId = messages[turn.start].id + 1;
      for (let i = turn.start; i < turn.end; i++) {
        dropped[i] = true;
        total -= cost[i];
        cost[i] = 0;
      }
    }

    // Level D
    if (!fitsTarget()) {
      elideToolResultsKeeping(AGGRESSIVE_KEEP_FULL_TOOL_RESULTS);
    }
    if (!fitsTarget()) {
      let largest = -1;
      for (let i = currentTurn.start; i < currentTurn.end; i++) {
        if (messages[i].role === 'tool' && messages[i].id >= state.elideToolResultsBeforeId && (largest < 0 || cost[i] > cost[largest])) {
          largest = i;
        }
      }
      if (largest >= 0) {
        // Shrinking is counted at the measured ratio (see estimateTokens), so cut by the same scale
        const shrinkScale = Math.min(1, anchorRatio(state.anchor) ?? 1);
        const excessRough = Math.ceil((estimate() - target) / shrinkScale);
        const length = contentText(shown[largest].content).length;
        const keepChars = Math.max(MIN_TRUNCATED_RESULT_CHARS, length - Math.ceil(excessRough * CHARS_PER_TOKEN));
        shown[largest] = truncateToolResult(shown[largest], keepChars);
        const next = roughMessageTokens(shown[largest]);
        total += next - cost[largest];
        cost[largest] = next;
      }
    }
  }

  const fitted = shown.filter((_, i) => !dropped[i]);
  const estimatedTokens = estimate();
  return {
    messages: fitted,
    state,
    roughTokens: total,
    estimatedTokens,
    overBudget: estimatedTokens > budget
  };
}
