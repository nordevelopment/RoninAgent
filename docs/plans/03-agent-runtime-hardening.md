# RoninAgent agent runtime hardening plan

## Verified findings and corrections

1. `delete_item` runs without server-side approval. The UI only reports `tool_start`; it does not authorize the operation. The previous audit was correct.
2. Folder selection and per-session folders already worked for the user. The issue addressed here is enforcement: `FileSystemManager.validatePath` checked lexical containment only, so existing symlinks or junctions could redirect file operations, and explicit tool paths could still reach other locations in the shared `workspace/`. The previous audit and my subsequent descriptions wrongly presented folder choice as a new feature.
3. Messages and scheduled tasks are persisted, but an individual agent run, its pending approvals, and its step state are not. `ContextWindow.repairToolPairs` repairs the prompt after an interruption; it does not resume a tool. The previous audit was correct.
4. Stop cancels model HTTP requests, but `executeTool` does not receive its signal. The previous audit was correct.
5. Scheduled tasks can mark a step-limited summary as `done`, and `running` tasks have no startup recovery. The previous audit was correct. The existing claim operation is conditional but its select/update/fetch sequence is not one database transaction; it must not be described as fully atomic across processes.
6. `saveMemory` intentionally or accidentally stores under `global`, regardless of the supplied session ID. This is a product scope decision, not automatically a vulnerability in a single-user installation. We will make scope explicit and preserve existing global memories.
7. The tools have advertised JSON schemas but no runtime schema validator. The read-before-write middleware actually marks existing files as read without reading them. The previous audit understated this bug.
8. Static HTTP fetches disable redirects, but the headless browser can follow redirects and load page subresources after validating only the initial URL. The previous audit was correct.
9. The existing run graph and shell documents are proposals, not implemented features. LangGraph is not necessary for these changes; adopting it is explicitly out of scope.

## Goal

Make the existing TypeScript agent loop safe to operate, observable, and recoverable while keeping the local SQLite architecture and existing provider adapters.

## Implementation sequence

### 1. Workspace and tool policy

- Keep folder choice in the chat's plus menu. If none was chosen at the first message or upload, create and assign the session's own folder automatically. Enforce that effective folder on the server for every file tool, upload and generated image; scheduled and Telegram sessions retain their automatic folders.
- `workspace/` is only the default location. A user may explicitly choose an existing absolute folder on the backend machine; file tools and uploads are scoped to that folder. The plus menu shows the active folder and offers an OS picker or an absolute server path, without a `workspace/` subfolder list or a folder creation form.
- On chat deletion, remove the session record and its automatically generated `session_<id>` folder. Preserve manually selected folders because they may hold independent data. Reject deletion while another session points to the generated folder; do not delete a folder still in use.
- Resolve every file path against that folder, reject the workspace root and symbolic-link/junction traversal, and validate both source and destination of moves. Apply the same policy to document generation and uploads.
- Make the advertised read-before-write rule real. Validate tool names and arguments at runtime. Put destructive actions behind a server-side approval gate, scoped to a run, session, tool call and exact arguments. Deny when no interactive approval channel exists.

### 2. Execution lifecycle

- Add persisted run and tool-step records with run IDs, status, timing and usage. Emit correlated SSE progress events. Persist approvals before notifying the UI and support allow/deny responses.
- Pass cancellation into tool execution and network operations; stop a run without claiming an in-flight side effect was rolled back. Reject concurrent runs in the same session.
- Recover interrupted runs and scheduled tasks on startup into an explicit `interrupted` or `failed` state. Never replay a possibly completed side effect automatically. Permit a new user turn to continue from the recorded history.
- Treat a step-limit summary as partial work. Do not mark a one-shot scheduled task as complete when its goal has not been verified.

### 3. Memory and network boundaries

- Define explicit global/session memory scopes, migrate without deleting existing memories, and include non-vector memories in retrieval. Rebuild vectors safely when the embedding dimension changes.
- Restrict dynamic browser navigation and subresources to validated public HTTP(S) destinations. Limit network response sizes and mark retrieved content as untrusted in the agent context.

### 4. Verification

- Add focused tests for approval, folder enforcement, symlink escape, overwrites, run persistence/recovery, task status and memory scope.
- Run typecheck, tests and build. Inspect the working tree and report any remaining limits honestly.

## Acceptance criteria

No AI-controlled file mutation occurs without an assigned session workspace. Destructive actions require an explicit decision in interactive runs and are denied in unattended runs. Existing symlinks, browser redirects and subresource URLs are checked. Every run has a durable outcome, interrupted work is not silently considered complete, and existing chat, Telegram and scheduler entry points still function.

## Implementation notes and remaining limits

- Run recovery records interruption and requires a fresh turn. It does not replay in-flight calls, roll back completed side effects, or guarantee exactly-once execution.
- Filesystem path checks reject existing symlinks and junctions, but cannot eliminate a race if another process replaces a path between validation and use. Use OS-level isolation when the workspace is writable by an adversary.
- Browser requests are checked at interception time. DNS rebinding and browser protocols outside intercepted HTTP requests require a network sandbox for a hard SSRF guarantee. Static fetches refuse redirects.
- Tool argument validation checks the declared top-level types, required fields, bounds and enums; nested document payloads rely on their service validators. Cancellation is cooperative and cannot undo writes already committed.
- Live marketplace tests need external network access and are opt-in via `npm run test:live`.

## LangGraph decision

Keep the current loop. Its state transitions, checkpoint records, approval gate and scheduler now have explicit ownership in a small TypeScript runtime. Reconsider LangGraph only when workflows require durable branch/rejoin across multiple agents, versioned graph migrations or replayable human-in-the-loop checkpoints beyond this single-agent loop. An adapter could map a graph node to the existing tool policy and run store, but replacing the loop now would add migration and operational cost without fixing the remaining OS and network isolation limits.

## Completion check

- Implemented the workspace policy, approval records and UI, run lifecycle, startup recovery, task status handling, explicit memory scope and reindex command, network checks and focused tests.
- Verified locally with `npm run typecheck`, `npx vue-tsc --noEmit -p frontend/tsconfig.json`, `npm run lint`, `npm test` (120 passing) and `npm run build`.
- Live marketplace tests require network access and were not exercised in the restricted environment.

Reference for a later LangGraph decision: [official JavaScript guide](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph) describes stateful nodes, checkpoint boundaries, interrupts and the possibility of re-executing interrupted nodes. Adopting it would still require application-specific side-effect and isolation policy.
