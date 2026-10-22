# Plan: Smart Context Window + Better Step Limit

> **Status:** approved idea, not started. Code does not change until we start a phase.
> **Date:** 2026-10-22
> **Replaces:** item F2 in [docs/plans/01-harness-fixes.md](docs/plans/01-harness-fixes.md). Item F3 there (per-tool output limits) is still useful and works well together with this plan.

---

## 1. The problem (why we do this)

Before each request to the model, `ChatManager` takes the **last 30 messages** of the history:

```ts
// backend/ai/ChatManager.ts:249
const history = fullHistory.slice(-config.AI_MAX_HISTORY_MESSAGES);
```

This was a temporary solution. It has real bugs.

**Example.** The user writes: *"Find 5 laptops on Wildberries under 300k and make an Excel table."*

```
1  user:      "Find laptops ... make Excel"      <- the task
2  assistant: call fetch_web_page
3  tool:      [WB page, 80,000 chars]
4  assistant: call fetch_web_page
5  tool:      [another page, 90,000 chars]
...
32 tool:      [...]
```

At step 32 the window is messages 3..32. What goes wrong:

| # | Bug | Result |
|---|---|---|
| B1 | The user task (message 1) falls out of the window | The model forgets the goal in the middle of the work |
| B2 | Dynamic skills are matched on the "last user message" in the window ([AIClient.ts:356](backend/ai/AIClient.ts)) | When the task falls out, skills disappear or match an old message |
| B3 | The window can start with a `tool` message without its `assistant.tool_calls` pair | Provider returns HTTP 400 |
| B4 | The limit counts **messages**, not **tokens**. One tool result can be 100,000 chars ([AITools.ts:146](backend/ai/AITools.ts)) | 30 messages can be 250k+ tokens -> context overflow |
| B5 | On an API error, `AIClient` returns `content: 'Error: ...'` as a normal answer | The error is saved in history as the assistant answer. No retry |
| B6 | Every image in the window is read from disk and sent as base64 on **every** step | ~1k tokens per image, every step |
| B7 | `SELECT * FROM messages WHERE session_id = ?` has no `ORDER BY` and no index ([DatabaseClient.ts:94](backend/database/DatabaseClient.ts)) | Message order is not guaranteed by SQL |
| B8 | `usage` from the API response is never read (the field exists in `AIResponse`, but is never filled) | We throw away the exact token count |

The step limit (`AI_MAX_THINKING_STEPS = 30`) is also small because of B1–B4: long tasks broke anyway.

---

## 2. What we get (the result)

After this plan:

- The model **always sees the user's task**, also in long tasks (50+ steps).
- The request **never overflows** the model context (or we retry once and fix it).
- **No more HTTP 400** from broken `tool_calls` / `tool` pairs.
- **API errors are not saved** as assistant answers.
- **Fewer tokens = less money:** old tool results and old images become short notes.
- **Provider prompt cache keeps working** (we do not change the start of the request on every step).
- Long tasks: step limit goes up (30 -> 60), plus a **loop detector**, plus a **summary at the limit** instead of "Try again later".
- `AI_MAX_HISTORY_MESSAGES` is **removed**. No more magic number.

---

## 3. The idea in 6 rules

1. **Count tokens, not messages.**
2. **Use the provider's real token count** (`usage.prompt_tokens`) as the base. Estimate only the new part. No tokenizer library.
3. **Never remove user messages** while it is possible. They are small. The last user message (current task) is never removed.
4. **Old tool results become a short note** first. The last 3 tool results stay full.
5. **Drop old turns only as a whole** (user + assistant + tool together). Never break a `tool_calls` / `tool` pair.
6. **Compress in big steps (to ~70% of the budget), not by one message per step.** This keeps the request start stable, so the provider cache works.

---

## 4. How it works

### 4.1 Words we use

- **Turn** = one user message + all `assistant` and `tool` messages after it, until the next user message.
- **Current turn** = the last turn (the agent works on it now).
- **Budget** = how many tokens we can send in the request.
- **Elide** = replace a tool result with a short note.

### 4.2 Budget

```
budget = contextLength - AI_MAX_TOKENS - safetyMargin
```

- `AI_MAX_TOKENS` = space reserved for the model answer (already in config).
- `safetyMargin` = 5% of `contextLength`.
- `contextLength` comes from (first found wins):
  1. `AI_CONTEXT_WINDOW` in `.env` / config (new, optional, manual override).
  2. A value learned from an overflow error message (see 4.6), cached per model.
  3. OpenRouter `/models` -> `context_length` (we already have [OpenRouterService.ts](backend/services/OpenRouterService.ts), cached 1h). Only when `AI_API_URL` is OpenRouter.
  4. Default: `64_000` (safe for most models).

### 4.3 Token count: exact base + estimate of the difference

The provider tells us the exact `prompt_tokens`, but only **after** the request. We must decide **before** the request. So:

```
estimate(newRequest) = actualPromptTokens(lastRequest)
                     + rough(newRequest) - rough(lastRequest)
```

- `rough(x)` = cheap estimate: `chars / 2.5` + `1_200` per image. (2.5 is conservative: Russian text uses more tokens than English.)
- Most of the number is exact. Only the difference is estimated, so the error stays small.
- This also works after eliding: removed text makes the difference negative.
- No previous request (first request in a session, after restart, after model change): use `rough(newRequest)` only.

`rough()` counts the **whole** request: system prompt + active skills + tool schemas + messages.

### 4.4 Fitting the history (when the estimate is over budget)

If `estimate <= budget` -> send as is. Do nothing.

If `estimate > budget` -> compress until `estimate <= 0.7 * budget`, in this order:

| Level | What we do | What stays |
|---|---|---|
| A | Elide old tool results (oldest first). | Last 3 tool results stay full |
| B | Old images -> text `[image: /workspace/.../123.jpg]` | Images of the last 2 user turns |
| C | Drop oldest **whole turns** | Current turn always stays |
| D | Current turn is still too big: keep only the last 1 tool result full; cut a single huge tool result (head + marker) | User message of the current turn always stays |

Elided tool result looks like this (the `tool_call_id` stays, so the pair is not broken):

```json
{ "role": "tool", "tool_call_id": "call_abc",
  "content": "[Tool result removed to save context: fetch_web_page https://www.wildberries.ru/..., 80213 chars. Call the tool again if you need it.]" }
```

The tool name and the path/URL come from the matching `assistant.tool_calls` (by `tool_call_id`).

### 4.5 Stable start of the request (watermarks)

If we recompute from zero on every step, we elide one more message on every step. Then the request start changes on every step, and the provider prompt cache is lost every time.

So we keep a small state per session:

```ts
interface ContextState {
  model: string;
  elideToolResultsBeforeId: number; // level A watermark (message id)
  dropTurnsBeforeId: number;        // level C watermark (message id)
  anchor?: { roughTokens: number; actualPromptTokens: number };
}
```

- Watermarks only move **forward**, and only when we are over budget.
- When they move, they move far (target 70%), so the next 5–15 steps need no change.
- State lives in memory: `Map<sessionId, ContextState>` in `ChatManager`, max 200 entries (oldest removed first), deleted on session delete / clear history.
- After a server restart the state is empty -> computed again once (one cache miss, safe).

### 4.6 Overflow retry

If the provider still says "context too long":

1. `AIClient` returns `error: { kind: 'context_overflow', message }` (not a normal answer).
2. If the message has the real limit (for example `maximum context length is 131072 tokens`), save it for this model (source 2 in 4.2).
3. Retry **once** in aggressive mode: target 50% of budget, keep only the last 1 tool result full.
4. Still fails -> show the error to the user. **Do not save it in history.**

Overflow detection: HTTP 400/413 + message matches
`/context length|context_length_exceeded|maximum context|too many tokens|prompt is too long|reduce the length/i`.

---

## 5. Step limit changes

`AI_MAX_THINKING_STEPS` stays. Its job is now **protection from loops and cost**, not context.

1. **Default 30 -> 60.** Remove the different fallback `|| 25` in [ChatManager.ts:239](backend/ai/ChatManager.ts) (config says 30, code says 25).
2. **Loop detector.** In one turn, if the model calls the same tool with the same arguments for the 3rd time, we do not run it. We return this tool result instead:
   `"You already called <tool> with the same arguments 2 times in this task. The result will not change. Use the previous result or try a different approach."`
   (Arguments are compared after JSON normalization with sorted keys.)
3. **Summary at the limit.** Now the user gets *"The thinking iteration limit has been exceeded, Try again later."* and all work is lost. New: one last request **without tools** and with the note
   `"Step limit reached. Do not call tools. Briefly write what is done, what is left, and how to continue."`
   This answer is saved as the assistant message. The user can then write "continue".

---

## 6. Code changes by file

| File | Change |
|---|---|
| `backend/ai/ContextWindow.ts` | **New.** Pure functions: `splitIntoTurns`, `roughTokens`, `estimateTokens`, `fitContext`. No I/O. Easy to test |
| `backend/ai/AIClient.ts` | Read `usage` (`prompt_tokens`, `completion_tokens`). Return `error: { kind: 'context_overflow' \| 'cancelled' \| 'api', message }` instead of `content: 'Error: ...'`. Call `fitContext` **after** building the system prompt + skills and **before** converting images to base64 (so old images are never read from disk). Accept and return `ContextState` |
| `backend/ai/ChatManager.ts` | Remove `slice(-AI_MAX_HISTORY_MESSAGES)`. Pass full history + `ContextState`. Overflow retry. Do not save `error` answers in history. Loop detector. Summary at step limit. `Map<sessionId, ContextState>` with cleanup |
| `backend/ai/ChatHistoryManager.ts` | Return message `id` with each message (needed for watermarks) |
| `backend/models/message.ts` | `findBySessionId`: own SQL with `ORDER BY id ASC` |
| `backend/database/schema.sql` | `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);` (schema runs on every start, so old DBs get it too) |
| `backend/config.ts` | Remove `AI_MAX_HISTORY_MESSAGES`. Add optional `AI_CONTEXT_WINDOW`. `AI_MAX_THINKING_STEPS` default 60 |
| `.env.example` | Add commented `AI_CONTEXT_WINDOW=` with a short explanation |
| `tests/contextWindow.test.ts` | **New.** See section 7 |
| `tests/chatManagerLoop.test.ts`, `tests/aiClient.test.ts` | Update for `usage`, `error`, and no-save of errors |

Callers of `chatManager.sendMessage` (routes, `TaskService`, `TelegramBot`) keep the same contract: `{ content, reasoning }`.

---

## 7. Tests (vitest)

`tests/contextWindow.test.ts`:

- Under budget -> history is not changed at all.
- Current user message is always in the result (task in message 1, in message 5, and task split across messages 5 and 21).
- Result never starts with a `tool` message; every `tool_call_id` has its `assistant.tool_calls` pair and back.
- One `assistant` with several `tool_calls` -> all results stay together.
- Elision keeps `tool_call_id`, tool name, and path/URL in the note.
- Last 3 tool results stay full.
- Old images become `[image: ...]`; images of the last 2 user turns stay.
- Watermarks: two calls in a row with one new small message -> **same** elided set (stable start).
- Anchor: `estimate = actual + rough(new) - rough(old)`.
- Aggressive mode reaches 50% target.
- Current turn bigger than budget -> level D, result still valid.
- Empty history.

`tests/chatManagerLoop.test.ts` (extend):

- Overflow -> one retry in aggressive mode -> success.
- Overflow twice -> user sees error, error **not** in history.
- Same tool + same args 3 times -> 3rd call is not run, model gets the loop message.
- Step limit -> last call has no tools, summary saved as assistant message.

Each phase is done only when `npm test` and `tsc` are green.

---

## 8. Order of work

- [x] **Phase 0 — small safe fixes** (B5, B7, B8) — done 2026-10-22, not committed yet
  - `ORDER BY id` + index, message `id` in history
  - read `usage`, structured `error` in `AIClient`, do not save errors in history
  - also: `AIClient` sends only API fields (`role`, `content`, `tool_calls`, `tool_call_id`), so the new `id` never reaches the provider
  - also: OpenRouter "HTTP 200 + `error` body" is now an error, not an empty answer
  - also: `TaskService` marks a task as failed when the AI request fails (before: "done" with an error text)
- [ ] **Phase 1 — `ContextWindow.ts`** (pure logic + full tests, not connected yet)
- [ ] **Phase 2 — connect it** (B1–B4, B6)
  - `AIClient` + `ChatManager` use `fitContext`, `ContextState` map, overflow retry
  - remove `AI_MAX_HISTORY_MESSAGES`, add `AI_CONTEXT_WINDOW`
- [ ] **Phase 3 — step limit**
  - default 60, loop detector, summary at limit

One commit per phase (only when you say "commit").

---

## 9. Not in this plan (maybe later)

- **Rolling summary** of very old turns with an LLM (stored in `sessions`, made in the background after a turn ends). Needed only for very long chats (hundreds of messages). Vector memory (`save_memory`) already covers part of this.
- `cache_control` for Anthropic models via OpenRouter (cheaper long tasks). Easy to add after this plan, because the request start is now stable.
- Save `ContextState` in the DB (now: memory only, lost on restart — this is OK).
- Two parallel requests in one session (Telegram) — this is F5 in `01-harness-fixes.md`.

---

## 10. Decisions (why this way)

| Option | Why not |
|---|---|
| Only fix the broken pairs in `slice(-30)` (old F2) | Fixes B3 only. Task still falls out, overflow still happens |
| Make 30 bigger (100) | Overflow happens faster |
| Only LLM summary | Extra paid and slow request on each overflow; summary can lose details; does not help inside one long turn (the problem there is big tool results) |
| Provider-side features (Anthropic context editing, OpenAI Responses compaction, OpenRouter `middle-out`) | Work only with one provider, or remove messages blindly. RoninAgent works with many providers |
| Tokenizer library (`tiktoken` etc.) | Every provider has a different tokenizer. Exact `usage` from the provider + rough difference is simpler and good enough |
| **Chosen: token budget + elide + whole turns + watermarks + usage anchor** | Deterministic, free, testable, cache-friendly, works with any provider |

---

## 11. Open questions

1. **`AI_MAX_TOKENS` default is 32,000.** For a 128k model this reserves 25% of the context for the answer. Suggestion: 16,000. Risk: reasoning models count thinking tokens in `max_tokens` on some providers, so too small a value can cut thinking. Change it or keep it?
2. **Step limit default:** 60 or 100?
