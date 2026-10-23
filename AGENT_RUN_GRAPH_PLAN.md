# Plan: Agent Run Graph (view only, with a toggle)

> **Status:** Idea. Nothing is implemented.
> **Date:** 2026-10-24
> **Later step (not in this plan):** the "inverted model" — the agent builds a workflow graph once, the user checks it, the graph runs without the LLM. This plan is the base for it (nodes, icons, layout, panel).

---

## 1. The idea

The user sends a task. Next to the chat, a panel shows **what the agent does, live**, as a graph:

```
[Request]
    |
[web_search]                    step 1
    |
[read_page: Ozon] [read_page: WB]   step 2
    |
[generate_excel]                step 3
    |
[Answer]
```

- Every tool call is a node: icon, name, status, time, result size.
- Click a node → see its arguments and result.
- **View only.** The user can not change anything in the graph. It shows, it does not control.
- **Toggle.** Off by default. Off → the chat looks as it does now. On → the panel opens next to the chat.

### Why

| Goal | How the graph helps |
|---|---|
| Debugging | You see the loop, the timeout, the failed tool — without reading logs |
| Trust | You see *where* the answer came from |
| Money | You see which step used the most tokens |
| Showcase | A GIF of the graph in the README sells the project better than text |

---

## 2. What we have now (facts from the code)

- `ChatManager.sendMessage` has an `onProgress` callback with 3 events: `tool_start`, `tool_done`, `skills_loaded` ([ChatManager.ts:260](backend/ai/ChatManager.ts)).
- `routes.ts` sends them to the browser as SSE (`event: <name>\ndata: <json>`), then `final` or `error` ([routes.ts:260](backend/routes.ts)).
- Event payloads today:
  - `tool_start` → `{ name, arguments }`
  - `tool_done` → `{ name, result }` (also on error: `result: { error }`)
- The frontend turns these events into **system text messages** in the chat ([chat.ts:419](frontend/src/stores/chat.ts)).
- History in DB: `messages` has `role`, `content`, `tool_calls`, `tool_call_id`, `created_at`. So a graph for an **old** chat can be rebuilt from DB.
- `TaskService` and `TelegramBot` call `sendMessage` **without** `onProgress`. Background tasks have no live events, but their sessions are in DB.
- Per step token usage exists: `requestStep` returns `usage` ([ChatManager.ts:110](backend/ai/ChatManager.ts)).
- UI preferences are stored in `localStorage` with the `paia_` prefix (see `stores/theme.ts`). Styles: global CSS variables in `darkstyleui.css` + `scoped` styles in components. Icons: inline SVG, no icon library.

### Gaps in the current events

| # | Gap | Effect on the graph |
|---|---|---|
| G1 | No `toolCall.id` in events | Two calls of the same tool can not be matched to their results reliably |
| G2 | No step index | We can not group calls into rows (steps) |
| G3 | No timing | No duration on nodes |
| G4 | No usage event | No tokens on the graph |
| G5 | A call blocked by the loop detector sends **no event** (`continue` before `tool_start`) | The most interesting case (a loop) is invisible |
| G6 | Stop by user: `tool_start` without `tool_done` | A node stays "running" forever |
| G7 | Step limit summary (the extra request with `tool_choice: 'none'`) sends no event | The last step is invisible |
| G8 | No run id | If the user switches the session while a run is active, events can not be tied to the right run |

### Important truth about tokens

Tokens belong to an **LLM step** (the model decides what to call), not to a tool. A tool result costs tokens only in the **next** step's prompt. So:

- the **step** shows tokens (`usage` of that request);
- the **tool node** shows result **size** (chars) and duration.

Do not show "tokens per tool" — it would be a fake number.

### Important truth about "parallel" calls

When the model returns several `tool_calls` in one step, `ChatManager` runs them **one by one** (a `for` loop). The graph shows them in one row because they belong to one step, but the label must not say "parallel".

---

## 3. Phase 0 — prerequisite bug (fix first, separate commit)

`fetchHistory` in [chat.ts:203](frontend/src/stores/chat.ts) uses `data.history`, but the line `const data = await res.json();` was removed in commit `f0af961`. Result: `ReferenceError`, caught by `try/catch` and only logged. **Chat history does not load in the UI when you open an old session.** Phase 3 depends on the history endpoint, so fix this first.

---

## 4. Phase 1 — event protocol (backend)

Extend events. Only **add** fields, do not rename or remove: the current chat UI keeps working.

```ts
// backend/ai/runEvents.ts
export type RunEvent =
  | { type: 'run_start';   runId: string; startedAt: string }
  | { type: 'step_start';  runId: string; step: number }
  | { type: 'step_done';   runId: string; step: number; durationMs: number; usage?: TokenUsage; toolCallIds: string[] }
  | { type: 'tool_start';  runId: string; step: number; id: string; name: string; arguments: unknown; startedAt: string }
  | { type: 'tool_done';   runId: string; step: number; id: string; name: string; result: unknown; ok: boolean; durationMs: number; resultChars: number }
  | { type: 'tool_blocked';runId: string; step: number; id: string; name: string; reason: 'loop' }
  | { type: 'summary';     runId: string; step: number; usage?: TokenUsage }   // step limit reached
  | { type: 'run_end';     runId: string; status: 'done' | 'stopped' | 'error' | 'step_limit'; durationMs: number };
```

Rules:

- `runId` = `crypto.randomUUID()` at the start of `sendMessage`. Sent in every event.
- `run_end` is sent from the `finally` block, so it is **always** sent: on success, stop, error, and step limit. This fixes G6 on the client side: all nodes still "running" at `run_end` become "cancelled".
- `tool_done.ok = false` when the result has `error`.
- `onProgress` must never break the agent: wrap the call so an exception in the callback (closed socket) is logged and ignored.
- Keep the `onProgress(event, data)` signature, widen the event name type to the new list. `routes.ts` does not change: it sends every event as is.

Tests (extend `tests/chatManagerLoop.test.ts`, `tests/chatStop.test.ts`):

- order of events for a 2-step run with 2 tools in step 1;
- `tool_blocked` is sent by the loop detector;
- stop during a tool: `run_end { status: 'stopped' }` is sent, and there is no `tool_done` after it;
- step limit: `summary` + `run_end { status: 'step_limit' }`;
- an exception inside `onProgress` does not stop the run.

---

## 5. Phase 2 — live graph (frontend)

### 5.1 Store: `stores/runGraph.ts`

- **Events are collected always.** The toggle only changes rendering. If we collect only when the panel is open, the user opens it in the middle of a run and sees an empty graph.
- State is keyed by `sessionId` → list of runs → steps → nodes. Events with an unknown `runId` for the current session start a new run.
- `isVisible` toggle, saved in `localStorage` (`paia_run_graph`), same pattern as `theme.ts`, with `try/catch`.
- Memory:
  - store a **preview** of `arguments` and `result` (first 2,000 chars) plus `resultChars`, not the full object. A `tool_done` result can be 100k chars;
  - keep node data in `shallowRef` / `markRaw` — deep reactivity on big objects is slow and not needed;
  - keep only the last N runs per session in memory (for example 20).
- `chat.ts` calls `runGraph.handleEvent(eventName, data)` in the same place where it handles `tool_start` / `tool_done` now. One SSE parser, two consumers.

### 5.2 Components

```
frontend/src/components/runGraph/
  RunGraphPanel.vue      // panel: header, run selector, scroll area
  RunGraphCanvas.vue     // rows of nodes + SVG connectors
  RunGraphNode.vue       // one node: icon, name, status, time, size
  RunGraphDetails.vue    // selected node: arguments, result preview, error
  toolIcons.ts           // tool name -> inline SVG icon + category
```

- `RunGraphPanel` is loaded with `defineAsyncComponent(() => import(...))`. When the toggle is off, the code is not downloaded. This keeps the app "zero-bloat".
- Toggle button in the `chat-header` (`header-right`), next to "Task Manager".
- Layout in `ChatView`: when on → two columns (chat | panel ~380px, resizable later). Below 768px → bottom sheet instead of a column.

### 5.3 Renderer: own SVG/CSS, no graph library

The graph has a fixed shape: **rows = steps, nodes in a row = tool calls of that step**. No free layout is needed, so no layout engine (dagre) and no Vue Flow.

- Rows: flex layout. Connectors: one absolute SVG layer, paths from the bottom of a row to the top of the next.
- 60 steps → long vertical list → normal vertical scroll in the panel.
- Auto scroll to the active node while the run is going; stop auto scroll when the user scrolls up.

Why not Vue Flow (`@vue-flow/core` 1.48.2, last release 2026-01-28): pan, zoom and drag are not needed for a view-only list of steps, and it is ~1.3 MB unpacked of extra dependency. Take it later only if the inverted model needs a free canvas.

### 5.4 Node states

| State | Look |
|---|---|
| `running` | accent border, pulse |
| `done` | success border |
| `error` | danger border, error text in details |
| `blocked` | warning border, label "loop" |
| `cancelled` | muted, dashed border |

Use only existing CSS variables, so both themes (Deep Ocean / Clean Light) work. No inline styles except dynamic values (connector coordinates).

### 5.5 Option: hide tool messages in the chat

When the graph is on, the system messages `EXECUTING TOOL: ...` / `TOOL ... COMPLETED` duplicate it. A setting: "Hide tool steps in the chat when the graph is open". Off by default.

---

## 6. Phase 3 — graph for old chats and background tasks

### 6.1 Pure function: `backend/ai/RunGraph.ts`

`buildRunGraph(messages: Message[]): RunGraph` — no DB, no I/O, like `ContextWindow.ts`.

- A new run starts at each `user` message.
- Each `assistant` message with `tool_calls` = one step. Its `tool_calls` = the nodes of the row.
- A `tool` message is matched to its node by `tool_call_id`.
- Duration ≈ `created_at` of the `tool` message − `created_at` of the `assistant` message (rough, mark it as "approx." in the UI).
- Missing `tool` result (stop before execution, see B9 in `CONTEXT_WINDOW_PLAN.md`) → node `cancelled`.
- Loop detector results are saved as `tool` messages with a known error text → node `blocked`.

Unit tests: normal run, multi-tool step, missing result, blocked call, empty session, broken JSON in `tool_calls`.

### 6.2 Endpoint

`GET /api/sessions/:id/run-graph` → `RunGraph` with previews only (same 2,000 chars limit). It is a separate endpoint: `get_history` stays as it is.

### 6.3 Background tasks

`TaskService` runs a task in its own session. On the task card in `TasksView` add "Show graph" → opens the panel with that session's graph. This is the main way to see what the agent did while you were away.

---

## 7. Phase 4 — polish

- Run selector in the panel (the last N runs of the session).
- Totals in the panel header: steps, tools, duration, tokens.
- Copy arguments / result from the details.
- README: GIF of a real run.

---

## 8. Risks and traps

| Risk | What we do |
|---|---|
| Big results in memory (100k chars per `tool_done`) | Preview only, `shallowRef`, limit runs per session |
| Node stuck in "running" after stop / network drop | `run_end` from `finally`; on SSE `error` or stream close, the client closes the open run itself |
| User switches session during a run | Everything is keyed by `sessionId` + `runId` |
| `onProgress` throws (client closed the tab) | Wrapped, logged, ignored — the agent continues |
| Sensitive data in arguments (paths, tokens in URLs) | Same data is already in the chat and in the DB; no new exposure. Do not log previews on the server |
| Fake numbers | Tokens only on steps; history durations marked "approx." |
| Bundle size | Panel is lazy loaded; no graph library |

---

## 9. Definition of done

- Toggle on/off, state saved after reload.
- Live graph for a chat run: steps, nodes, statuses, durations, step tokens, loop blocks, stop.
- Graph for an old session and for a background task from history.
- Both themes, mobile bottom sheet.
- Tests: backend event order (Phase 1), `buildRunGraph` (Phase 3). `npm test` and `vue-tsc` pass.
- Off by default: with the toggle off, the chat behaves exactly as before.
