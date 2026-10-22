import { describe, it, expect } from 'vitest';
import {
  computeBudget,
  parseContextLimit,
  roughMessageTokens,
  roughTokens,
  estimateTokens,
  splitIntoTurns,
  repairToolPairs,
  fitContext,
  IMAGE_TOKENS,
  type ContextState
} from '../backend/ai/ContextWindow.js';
import type { AIMessages } from '../backend/ai/AIClient.js';
import type { StoredMessage } from '../backend/ai/ChatHistoryManager.js';

class History {
  readonly messages: StoredMessage[] = [];
  private nextId = 1;
  private callSeq = 0;

  push(message: AIMessages): StoredMessage {
    const stored = { ...message, id: this.nextId++ };
    this.messages.push(stored);
    return stored;
  }

  user(text: string, imageUrl?: string): StoredMessage {
    if (imageUrl) {
      return this.push({
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      });
    }
    return this.push({ role: 'user', content: text });
  }

  assistant(text: string): StoredMessage {
    return this.push({ role: 'assistant', content: text });
  }

  /** One assistant message with one or more tool calls, followed by their results */
  toolStep(...calls: { name: string; args: Record<string, unknown>; result: string | number }[]): string[] {
    const ids = calls.map(() => `call_${++this.callSeq}`);
    this.push({
      role: 'assistant',
      content: '',
      tool_calls: calls.map((call, i) => ({
        id: ids[i],
        type: 'function' as const,
        function: { name: call.name, arguments: JSON.stringify(call.args) }
      }))
    });
    calls.forEach((call, i) => {
      this.push({
        role: 'tool',
        tool_call_id: ids[i],
        content: typeof call.result === 'number' ? 'x'.repeat(call.result) : call.result
      });
    });
    return ids;
  }

  fetchSteps(count: number, resultChars: number): void {
    for (let i = 0; i < count; i++) {
      this.toolStep({ name: 'fetch_web_page', args: { url: `https://example.com/page/${i}` }, result: resultChars });
    }
  }
}

function expectValidPairs(messages: AIMessages[]): void {
  if (messages.length > 0) {
    expect(messages[0].role).not.toBe('tool');
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === 'tool') {
      let owner = i - 1;
      while (owner >= 0 && messages[owner].role === 'tool') owner--;
      expect(owner).toBeGreaterThanOrEqual(0);
      expect(messages[owner].role).toBe('assistant');
      expect(messages[owner].tool_calls?.map(call => call.id)).toContain(message.tool_call_id);
    }
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const resultIds: string[] = [];
      for (let j = i + 1; j < messages.length && messages[j].role === 'tool'; j++) {
        resultIds.push(messages[j].tool_call_id!);
      }
      expect(resultIds.sort()).toEqual(message.tool_calls.map(call => call.id).sort());
    }
  }
}

const isElided = (message: AIMessages) =>
  typeof message.content === 'string' && message.content.startsWith('[Tool result removed to save context');

const fullToolResults = (messages: AIMessages[]) =>
  messages.filter(message => message.role === 'tool' && !isElided(message));

describe('computeBudget', () => {
  it('subtracts the answer reserve and a 5% safety margin', () => {
    expect(computeBudget(128_000, 32_000)).toBe(128_000 - 32_000 - 6_400);
  });

  it('never lets the answer reserve take more than half of the context', () => {
    expect(computeBudget(32_000, 32_000)).toBe(32_000 - 16_000 - 1_600);
  });
});

describe('parseContextLimit', () => {
  it('reads the limit from common provider messages', () => {
    expect(parseContextLimit("This model's maximum context length is 131072 tokens. However, you requested 140000 tokens.")).toBe(131_072);
    expect(parseContextLimit('prompt is too long: 210000 tokens > 200000 maximum')).toBe(200_000);
    expect(parseContextLimit('Input exceeds the context window of 1,048,576 tokens')).toBe(1_048_576);
  });

  it('returns undefined when no plausible limit is named', () => {
    expect(parseContextLimit('Rate limit exceeded')).toBeUndefined();
    expect(parseContextLimit('maximum of 100 tokens')).toBeUndefined();
  });
});

describe('rough token counting', () => {
  it('counts text at 2.5 chars per token plus a per-message overhead', () => {
    expect(roughMessageTokens({ role: 'user', content: 'a'.repeat(250) })).toBe(100 + 4);
  });

  it('counts each image as a flat amount regardless of its url', () => {
    const message: AIMessages = {
      role: 'user',
      content: [
        { type: 'text', text: 'a'.repeat(25) },
        { type: 'image_url', image_url: { url: '/workspace/s/images/1.jpg' } }
      ]
    };
    expect(roughMessageTokens(message)).toBe(10 + IMAGE_TOKENS + 4);
  });

  it('counts tool call names and arguments', () => {
    const withCall: AIMessages = {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c', type: 'function', function: { name: 'write_file', arguments: 'a'.repeat(1000) } }]
    };
    expect(roughMessageTokens(withCall)).toBeGreaterThan(400);
    expect(roughTokens([withCall, withCall])).toBe(2 * roughMessageTokens(withCall));
  });
});

describe('estimateTokens', () => {
  it('uses the rough count when there is no anchor', () => {
    expect(estimateTokens(5_000)).toBe(5_000);
  });

  it('is actual + rough(new) - rough(old) when rough matched the provider', () => {
    const anchor = { roughTokens: 10_000, actualPromptTokens: 10_000 };
    expect(estimateTokens(12_000, anchor)).toBe(12_000);
    expect(estimateTokens(7_000, anchor)).toBe(7_000);
  });

  it('counts growth at least at rough size and shrinking at most at the measured ratio', () => {
    // rough over-counts: provider saw 0.8 of our estimate
    const over = { roughTokens: 10_000, actualPromptTokens: 8_000 };
    expect(estimateTokens(12_000, over)).toBe(8_000 + 2_000);
    expect(estimateTokens(6_000, over)).toBe(8_000 - 4_000 * 0.8);

    // rough under-counts: provider saw 1.5 of our estimate
    const under = { roughTokens: 10_000, actualPromptTokens: 15_000 };
    expect(estimateTokens(12_000, under)).toBe(15_000 + 2_000 * 1.5);
    expect(estimateTokens(8_000, under)).toBe(15_000 - 2_000);
  });
});

describe('splitIntoTurns', () => {
  it('starts a turn at every user message and groups leading non-user messages', () => {
    const history = new History();
    history.assistant('welcome');
    history.user('task');
    history.toolStep({ name: 'read_file', args: { path: 'a.txt' }, result: 'data' });
    history.user('next');

    expect(splitIntoTurns(history.messages)).toEqual([
      { start: 0, end: 1, userIndex: -1 },
      { start: 1, end: 4, userIndex: 1 },
      { start: 4, end: 5, userIndex: 4 }
    ]);
  });

  it('returns no turns for an empty history', () => {
    expect(splitIntoTurns([])).toEqual([]);
  });
});

describe('repairToolPairs', () => {
  it('drops orphan tool results and duplicate results', () => {
    const messages: StoredMessage[] = [
      { id: 1, role: 'tool', tool_call_id: 'lost', content: 'orphan' },
      { id: 2, role: 'user', content: 'task' },
      { id: 3, role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { id: 4, role: 'tool', tool_call_id: 'c1', content: 'first' },
      { id: 5, role: 'tool', tool_call_id: 'c1', content: 'duplicate' },
      { id: 6, role: 'assistant', content: 'done' },
      { id: 7, role: 'tool', tool_call_id: 'c1', content: 'after a plain answer' }
    ];

    const repaired = repairToolPairs(messages);
    expect(repaired.map(m => m.id)).toEqual([2, 3, 4, 6]);
    expectValidPairs(repaired);
  });

  it('adds a result for every call that was interrupted before it ran', () => {
    const messages: StoredMessage[] = [
      { id: 1, role: 'user', content: 'task' },
      {
        id: 2,
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{}' } },
          { id: 'c2', type: 'function', function: { name: 'read_file', arguments: '{}' } }
        ]
      },
      { id: 3, role: 'tool', tool_call_id: 'c1', content: 'ran' },
      { id: 4, role: 'user', content: 'are you there?' }
    ];

    const repaired = repairToolPairs(messages);
    expectValidPairs(repaired);
    expect(repaired[3]).toMatchObject({ id: 3, role: 'tool', tool_call_id: 'c2' });
    expect(repaired[3].content).toContain('interrupted');
    expect(repaired[4].id).toBe(4);
  });
});

describe('fitContext', () => {
  it('returns the history unchanged when it fits', () => {
    const history = new History();
    history.user('hello');
    history.assistant('hi');
    history.user('read the file');
    history.toolStep({ name: 'read_file', args: { path: 'a.txt' }, result: 2_000 });

    const result = fitContext({ messages: history.messages, fixedTokens: 1_000, budget: 50_000, model: 'm' });
    expect(result.messages).toEqual(history.messages);
    expect(result.state).toMatchObject({ model: 'm', elideToolResultsBeforeId: 0, elideImagesBeforeId: 0, dropTurnsBeforeId: 0 });
    expect(result.roughTokens).toBe(1_000 + roughTokens(history.messages));
    expect(result.overBudget).toBe(false);
  });

  it('handles an empty history', () => {
    const result = fitContext({ messages: [], fixedTokens: 500, budget: 10_000, model: 'm' });
    expect(result.messages).toEqual([]);
    expect(result.roughTokens).toBe(500);
    expect(result.overBudget).toBe(false);
  });

  it('does not mutate the input', () => {
    const history = new History();
    history.user('task');
    history.fetchSteps(10, 10_000);
    const snapshot = structuredClone(history.messages);

    fitContext({ messages: history.messages, fixedTokens: 0, budget: 10_000, model: 'm' });
    expect(history.messages).toEqual(snapshot);
  });

  it('keeps the task when it is the first message of a long turn', () => {
    const history = new History();
    const task = history.user('Find 5 laptops under 300k and make an Excel table');
    history.fetchSteps(20, 5_000);

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 20_000, model: 'm' });
    expect(result.messages[0]).toEqual(task);
    expect(result.estimatedTokens).toBeLessThanOrEqual(20_000 * 0.7);
    expectValidPairs(result.messages);
  });

  it('keeps all user messages while eliding tool results is enough (task in message 5)', () => {
    const history = new History();
    const users = [history.user('hi')];
    history.assistant('hello');
    users.push(history.user('what is the weather?'));
    history.assistant('sunny');
    users.push(history.user('Find 5 laptops under 300k and make an Excel table'));
    history.fetchSteps(20, 5_000);

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 20_000, model: 'm' });
    for (const user of users) {
      expect(result.messages).toContainEqual(user);
    }
    expect(result.state.dropTurnsBeforeId).toBe(0);
    expectValidPairs(result.messages);
  });

  it('keeps both parts of a task split across two user messages', () => {
    const history = new History();
    const first = history.user('Find 5 laptops under 300k');
    history.fetchSteps(8, 5_000);
    const second = history.user('Also put the prices into an Excel table');
    history.fetchSteps(8, 5_000);

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 15_000, model: 'm' });
    expect(result.messages).toContainEqual(first);
    expect(result.messages).toContainEqual(second);
    expectValidPairs(result.messages);
  });

  it('elides oldest tool results first and keeps the last 3 full', () => {
    const history = new History();
    history.user('task');
    history.fetchSteps(10, 5_000);

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 12_000, model: 'm' });
    const toolResults = result.messages.filter(m => m.role === 'tool');
    expect(toolResults).toHaveLength(10);
    expect(toolResults.slice(-3).every(m => !isElided(m))).toBe(true);
    expect(isElided(toolResults[0])).toBe(true);
    expect(result.state.elideToolResultsBeforeId).toBeGreaterThan(0);
  });

  it('keeps tool_call_id, tool name and target in the elision note', () => {
    const history = new History();
    history.user('task');
    const [callId] = history.toolStep({ name: 'fetch_web_page', args: { url: 'https://www.wildberries.ru/catalog/laptops' }, result: 80_000 });
    history.toolStep({ name: 'read_file', args: { path: 'notes/a.md' }, result: 'short' });
    history.toolStep({ name: 'read_file', args: { path: 'notes/b.md' }, result: 'short' });
    history.toolStep({ name: 'read_file', args: { path: 'notes/c.md' }, result: 'short' });

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 20_000, model: 'm' });
    const elided = result.messages.find(m => m.role === 'tool' && m.tool_call_id === callId)!;
    expect(elided.content).toBe(
      '[Tool result removed to save context: fetch_web_page https://www.wildberries.ru/catalog/laptops, 80000 chars. Call the tool again if you need it.]'
    );
  });

  it('keeps small tool results instead of replacing them with a longer note', () => {
    const history = new History();
    history.user('task');
    history.toolStep({ name: 'write_file', args: { path: 'a.md' }, result: '{"success":true}' });
    history.fetchSteps(5, 10_000);

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 12_000, model: 'm' });
    expect(result.messages[2].content).toBe('{"success":true}');
  });

  it('keeps all results of one assistant message with several tool calls together', () => {
    const history = new History();
    history.user('old task');
    history.toolStep(
      { name: 'read_file', args: { path: 'a' }, result: 5_000 },
      { name: 'read_file', args: { path: 'b' }, result: 5_000 },
      { name: 'read_file', args: { path: 'c' }, result: 5_000 }
    );
    history.assistant('x'.repeat(20_000));
    history.user('current task');
    history.toolStep(
      { name: 'read_file', args: { path: 'd' }, result: 5_000 },
      { name: 'read_file', args: { path: 'e' }, result: 5_000 }
    );

    for (const budget of [1_000, 5_000, 9_000, 15_000, 40_000]) {
      const result = fitContext({ messages: history.messages, fixedTokens: 0, budget, model: 'm' });
      expectValidPairs(result.messages);
    }
  });

  it('shortens long tool call arguments once their results are elided', () => {
    const history = new History();
    history.user('task');
    history.toolStep({ name: 'write_file', args: { path: 'report.md', content: 'y'.repeat(30_000) }, result: 'ok but long enough to be worth eliding '.repeat(5) });
    history.fetchSteps(4, 5_000);

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 12_000, model: 'm' });
    const call = result.messages[1].tool_calls![0];
    const args = JSON.parse(call.function.arguments);
    expect(args.path).toBe('report.md');
    expect(args.content).toBe('[removed to save context: 30000 chars]');
  });

  it('replaces old images with text markers and keeps images of the last 2 user turns', () => {
    const history = new History();
    for (let i = 1; i <= 4; i++) {
      history.user('look', `/workspace/s/images/${i}.jpg`);
      history.assistant('ok');
    }

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 4_000, model: 'm' });
    const userContents = result.messages.filter(m => m.role === 'user').map(m => m.content as { type: string; text?: string }[]);
    expect(userContents).toHaveLength(4);
    expect(userContents[0][1]).toEqual({ type: 'text', text: '[image: /workspace/s/images/1.jpg]' });
    expect(userContents[1][1]).toEqual({ type: 'text', text: '[image: /workspace/s/images/2.jpg]' });
    expect(userContents[2][1].type).toBe('image_url');
    expect(userContents[3][1].type).toBe('image_url');
    expect(result.state.dropTurnsBeforeId).toBe(0);
  });

  it('never puts base64 data back into the context as text', () => {
    const history = new History();
    history.user('look', `data:image/jpeg;base64,${'A'.repeat(10_000)}`);
    for (let i = 0; i < 3; i++) {
      history.user('look', `/workspace/s/images/${i}.jpg`);
    }

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 4_000, model: 'm' });
    const first = result.messages[0].content as { type: string; text?: string }[];
    expect(first[1]).toEqual({ type: 'text', text: '[image removed to save context]' });
  });

  it('drops oldest whole turns when eliding is not enough and never drops the current turn', () => {
    const history = new History();
    for (let i = 0; i < 6; i++) {
      history.user(`question ${i}`);
      history.assistant('z'.repeat(10_000));
    }
    const current = history.user('current question');

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 10_000, model: 'm' });
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[result.messages.length - 1]).toEqual(current);
    expect(result.messages.length).toBeLessThan(history.messages.length);
    expect(result.state.dropTurnsBeforeId).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeLessThanOrEqual(10_000 * 0.7);
    expectValidPairs(result.messages);
  });

  it('keeps the start of the request stable on the next step (watermarks)', () => {
    const history = new History();
    history.user('task');
    history.fetchSteps(20, 5_000);

    const first = fitContext({ messages: history.messages, fixedTokens: 2_000, budget: 20_000, model: 'm' });
    const state: ContextState = {
      ...first.state,
      anchor: { roughTokens: first.roughTokens, actualPromptTokens: first.roughTokens }
    };

    history.toolStep({ name: 'read_file', args: { path: 'small.txt' }, result: 'small' });
    const second = fitContext({ messages: history.messages, fixedTokens: 2_000, budget: 20_000, model: 'm', state });

    expect(second.state).toEqual(state);
    expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages);
  });

  it('uses the anchor: a provider count above the rough estimate triggers compression', () => {
    const history = new History();
    history.user('task');
    history.fetchSteps(10, 5_000);
    const rough = roughTokens(history.messages);
    const budget = rough + 1_000;

    expect(fitContext({ messages: history.messages, fixedTokens: 0, budget, model: 'm' }).state.elideToolResultsBeforeId).toBe(0);

    const state: ContextState = {
      model: 'm',
      elideToolResultsBeforeId: 0,
      elideImagesBeforeId: 0,
      dropTurnsBeforeId: 0,
      anchor: { roughTokens: rough, actualPromptTokens: Math.round(rough * 1.2) }
    };
    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget, model: 'm', state });
    expect(result.state.elideToolResultsBeforeId).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeLessThanOrEqual(budget * 0.7);
  });

  it('compresses harder in aggressive mode: 50% target, down to 1 full tool result', () => {
    const history = new History();
    history.user('task');
    history.fetchSteps(10, 2_000);

    const normal = fitContext({ messages: history.messages, fixedTokens: 0, budget: 6_000, model: 'm' });
    const aggressive = fitContext({ messages: history.messages, fixedTokens: 0, budget: 6_000, model: 'm', aggressive: true });
    expect(aggressive.estimatedTokens).toBeLessThanOrEqual(6_000 * 0.5);
    expect(fullToolResults(aggressive.messages).length).toBeLessThan(fullToolResults(normal.messages).length);
    expectValidPairs(aggressive.messages);

    const tight = fitContext({ messages: history.messages, fixedTokens: 0, budget: 2_000, model: 'm', aggressive: true });
    expect(fullToolResults(tight.messages)).toHaveLength(1);
  });

  it('cuts the current turn down when it alone is bigger than the budget (level D)', () => {
    const history = new History();
    const task = history.user('task');
    history.fetchSteps(5, 50_000);

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 10_000, model: 'm' });
    expect(result.messages[0]).toEqual(task);
    const full = fullToolResults(result.messages);
    expect(full).toHaveLength(1);
    expect(full[0].content).toContain('[Tool result truncated to save context');
    expect(result.estimatedTokens).toBeLessThanOrEqual(10_000);
    expect(result.overBudget).toBe(false);
    expectValidPairs(result.messages);
  });

  it('reports overBudget but still keeps the user message when it alone is too big', () => {
    const history = new History();
    const task = history.user('q'.repeat(100_000));

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 10_000, model: 'm' });
    expect(result.messages).toEqual([task]);
    expect(result.overBudget).toBe(true);
  });

  it('starts over when the model changes or the watermarks are past the history', () => {
    const history = new History();
    history.user('task');
    history.toolStep({ name: 'read_file', args: { path: 'a' }, result: 5_000 });

    const stale: ContextState = {
      model: 'm',
      elideToolResultsBeforeId: 100,
      elideImagesBeforeId: 0,
      dropTurnsBeforeId: 0,
      anchor: { roughTokens: 1_000, actualPromptTokens: 1_000 }
    };

    const otherModel = fitContext({ messages: history.messages, fixedTokens: 0, budget: 50_000, model: 'other', state: { ...stale, elideToolResultsBeforeId: 2 } });
    expect(otherModel.state).toEqual({ model: 'other', elideToolResultsBeforeId: 0, elideImagesBeforeId: 0, dropTurnsBeforeId: 0 });

    const cleared = fitContext({ messages: history.messages, fixedTokens: 0, budget: 50_000, model: 'm', state: stale });
    expect(cleared.state.elideToolResultsBeforeId).toBe(0);
    expect(cleared.state.anchor).toBeUndefined();
    expect(cleared.messages).toEqual(history.messages);
  });

  it('repairs interrupted tool calls before fitting', () => {
    const history = new History();
    history.user('task');
    history.push({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'stopped', type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } }]
    });
    history.user('continue');

    const result = fitContext({ messages: history.messages, fixedTokens: 0, budget: 50_000, model: 'm' });
    expectValidPairs(result.messages);
    expect(result.messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'stopped' });
  });

  it('always returns a valid history for any budget', () => {
    const history = new History();
    history.assistant('welcome');
    for (let t = 0; t < 4; t++) {
      history.user(`task ${t}`, t % 2 === 0 ? `/workspace/s/images/${t}.jpg` : undefined);
      history.toolStep(
        { name: 'read_file', args: { path: `f${t}a` }, result: 3_000 + t * 1_000 },
        { name: 'read_file', args: { path: `f${t}b` }, result: 1_000 }
      );
      history.fetchSteps(2, 4_000);
      history.assistant('w'.repeat(2_000));
    }
    const current = history.user('current');
    history.fetchSteps(3, 6_000);

    for (const budget of [500, 2_000, 5_000, 10_000, 20_000, 50_000, 200_000]) {
      for (const aggressive of [false, true]) {
        const result = fitContext({ messages: history.messages, fixedTokens: 300, budget, model: 'm', aggressive });
        expectValidPairs(result.messages);
        expect(result.messages).toContainEqual(current);
        expect(result.roughTokens).toBe(300 + roughTokens(result.messages));
      }
    }
  });
});
