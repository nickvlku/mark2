# Mark2 Code Review

This document summarizes a code review focused on **code quality**, **security**, **performance**, and **single points of failure (SPOFs)** to prepare the codebase for open source.

---

## 1. Code Quality

### 1.1 Adapter usage — ✅ Good

- **CLIAdapter** is used idiomatically: the engine registers adapters by `toolId`, and phase handlers receive the adapter and call `buildCommand`, `getEnvironment`, and `getPromptFilePath?.(params)`.
- All phase handlers (design, coding, testing, code-review, etc.) use the same pattern. No bypass of adapters.

### 1.2 Phase handler duplication — ⚠️ Refactor opportunity

Each phase handler (design, coding, testing, code-review, fix-review, final-testing, manual-testing) repeats the same block:

```ts
const command = adapter.buildCommand(params);
const env = adapter.getEnvironment(params);
const promptFile = adapter.getPromptFilePath?.(params);
const tmuxSession = await tmuxManager.spawnAgent({ ... });
```

**Recommendation:** Extract a shared helper, e.g. `spawnAgentForPhase(task, agent, adapter, phase, promptParts, clonePath, mark2Dir, ...)` that builds `AgentInvocationParams`, calls the adapter, and invokes `tmuxManager.spawnAgent`. Phase handlers would only differ in how they get `clonePath` and `promptParts`.

### 1.3 Agents vs roles — ⚠️ Intentional but duplicated structure

- **CreateAgentDialog** and **CreateRoleDialog** are similar (name, role_prompt, phases, timeout) but agents add `cli_tool`/`model` and roles add `description`/`suggested_phases`. The divergence is intentional; consider a shared base form component or hooks for validation/state if the overlap grows.
- **PhaseDefaultsSection** exists in both `components/agents/` and `components/roles/` with different data shapes (legacy `default_agent` vs new `role`/`cli_tool`/`model`). The comment in the agents version acknowledges this. For long-term maintainability, consider a single `PhaseDefaultsSection` that accepts a generic “phase default” type and a render prop or mode for agents vs roles.

### 1.4 WebSocket implementation — ⚠️ Dead / duplicate code

- **server.ts** owns the WebSocket server (inline `wss`, `sendToTask`, subscribe/unsubscribe handling).
- **src/lib/ws/server.ts** defines a `WSServer` class and `getWSServer()` that are **never used**; the app uses the implementation in `server.ts` and wires library code via `setBroadcaster(sendToTask)` in `broadcaster.ts`.

**Recommendation:** Either remove `src/lib/ws/server.ts` (WSServer) as dead code, or refactor so that `server.ts` uses `WSServer` and a single place owns the WebSocket logic. The current split can confuse contributors.

### 1.5 README

- **README.md** is still the default Next.js template (Getting Started, Deploy on Vercel). For open source, replace with project-specific docs: what Mark2 is, how to install/run, `.mark2` layout, and link to TECH_SPEC/PRD.

---

## 2. Security

### 2.1 Command / shell injection

| Location | Risk | Recommendation |
|----------|------|----------------|
| **MCP server `mark2_git_commit`** (`src/lib/mcp/server.ts`) | `execSync(\`git commit -m "${message.replace(/"/g, '\\"')}"\`)` — escape is insufficient; a commit message containing `"; rm -rf / #` can break out of the quoted string and run arbitrary shell commands. | Use `spawnSync('git', ['commit', '-m', message], { cwd: cloneDir })` (or a helper that passes arguments as an array) so the message is never interpreted by the shell. |
| **POST /api/tasks/[id]/server** (`src/app/api/tasks/[id]/server/route.ts`) | `body.command` is interpolated into `fullCommand = \`cd "${clonePath}" && ${envPrefix} ${command}\`` and then sent via `tmux send-keys`. A client can send e.g. `"; rm -rf . #` and run arbitrary commands in the dev server TMUX session (within the clone). | For local-only use this may be acceptable; document clearly. To harden: whitelist allowed commands (e.g. `npm run dev`, `pnpm dev`, `yarn dev`) or pass the command as a single token so it is not parsed by the shell. |
| **artifacts/open** (`src/app/api/tasks/[id]/artifacts/open/route.ts`) | `resolvedPath` is passed to `exec(\`${editor.cmd} "${resolvedPath}"\`)`. A path containing a double quote could break the shell. | Use `spawn(editor.cmd, [resolvedPath], { stdio: 'inherit' })` so the path is a single argument and not parsed by the shell. |
| **session POST** (`src/app/api/tasks/[id]/session/route.ts`) | `tmuxCmd` is built from `session.tmux_session` (DB/server-controlled). On Linux the command is passed unquoted into a shell string (e.g. `kitty ${tmuxCmd}`). If session names ever contained spaces or metacharacters, this could be unsafe. | Session names are currently `mark2_${taskId}_${agentName}_${phase}` and thus constrained. For defense in depth, escape or pass `tmuxCmd` as a single argument. |

### 2.2 Path traversal and ID validation

- **Task/Story IDs in paths:** Many routes use `params.id` (task or story ID) in `path.join(mark2Dir, 'clones', id)` or similar. The Zod schemas enforce `TASK-\d+` / `STORY-\d+` for persisted entities, but **API route params are not validated**. A request with `id: "../../../etc"` could, in theory, lead to path resolution outside `.mark2` depending on how paths are combined and checked.
- **Artifact paths:** `resolveArtifactPath(projectRoot, taskId, relativePath)` does not sanitize `..` in `relativePath`. Callers (artifacts route, open route) mitigate by checking `resolved.startsWith(storageRoot)` before reading, so path traversal attempts typically result in 404. The design is safe but fragile if new callers use `resolveArtifactPath` without the same checks.

**Recommendations:**

1. Add a shared validator for route params, e.g. `assertTaskId(id: string): asserts id is TASK-\d+` and use it in all `/api/tasks/[id]/...` handlers that use `id` in file paths or shell commands.
2. Optionally sanitize `relativePath` in `resolveArtifactPath` (reject or normalize segments containing `..`) so the helper never returns a path outside the task storage root.

### 2.3 Authentication / scoping

- No authentication on REST or WebSocket. This is appropriate for a **local-only** tool. The TECH_SPEC mentions agent tokens and `X-Mark2-Agent` for agent-scoped API calls; ensure that is implemented and documented so that when/if the server is ever exposed, the model is clear.

---

## 3. Performance and bottlenecks

### 3.1 Database

- **SQLite** with WAL is used as a single process; no N+1 patterns stood out in the reviewed code. Services use `getDb()` and run discrete queries. For very large task/activity sets, consider pagination or limits where you currently load full lists (e.g. activity entries, artifact lists).

### 3.2 End-token watcher

- **Polling interval** is 2s; **baseline wait** is 20s before starting to look for tokens. This is acceptable for responsiveness vs. CPU. If you add many concurrent tasks, consider a single polling loop that checks all watched sessions in one pass instead of one `setInterval` per session (current design is one interval per session).

### 3.3 Reindex

- Full reindex reads all YAML files under `.mark2/tasks` and `.mark2/stories`. For hundreds of tasks this could be slow; consider incremental reindex (only changed files) if not already used on hot paths.

### 3.4 Sync file I/O

- Several places use `fs.readFileSync` / `fs.existsSync` (e.g. artifact service, prompt assembler, storage helpers). For a single-user local server this is fine; if you ever need to scale or avoid blocking the event loop under load, consider async `fs.promises` where it’s easy (e.g. in API routes).

---

## 4. Single points of failure (SPOFs)

Documented here for clarity; acceptable for a local, single-machine setup.

| SPOF | Description | Mitigation / note |
|------|-------------|-------------------|
| **Single Node process** | Next.js server, API, WebSocket, MCP, and orchestration engine run in one process. A crash or exception can take down everything. | Restart via process manager (e.g. systemd, PM2). Document recovery (reindex, orphaned TMUX sessions). |
| **SQLite** | One database file per `.mark2`; no replication. First `getDb()` call (with or without `mark2Dir`) wins and is cached. | If the server is started from project root, `process.cwd()/.mark2` and `config.mark2Dir` usually match. If they can differ (e.g. config from env), consider initializing the DB explicitly from a single “project root” so all callers share the same DB. |
| **TMUX** | Orchestration depends on TMUX for agent sessions. If TMUX is not installed or sessions are killed externally, agents can’t be started or monitored. | Document TMUX as a hard dependency; `mark2 status` / kill-sessions help operators clean up. |
| **Git** | Clones, worktrees, merge, and rebase assume a sane Git state. Corrupted repos or conflicting processes can leave tasks in a bad state. | Rely on reindex and worktree cleanup; document manual recovery (e.g. remove clone, re-run phase). |
| **WebSocket** | Single WS server in `server.ts`. If the server restarts, clients must reconnect; no durable queue. | Acceptable for local UI; document that a refresh reconnects. |

---

## 5. Summary of recommended actions

**High priority (security / correctness)** — ✅ Implemented

1. **MCP git commit:** Use `spawnSync('git', ['commit', '-m', message], { cwd })` (or equivalent) so the commit message is never passed through a shell. — **Done** (`src/lib/mcp/server.ts`)
2. **Artifacts open:** Use `spawn(editor.cmd, [resolvedPath], ...)` instead of `exec(\`... "${resolvedPath}"\`)`. — **Done** (`src/app/api/tasks/[id]/artifacts/open/route.ts`)
3. **Task/Story ID validation:** Validate `params.id` in API routes that use it in paths or commands (e.g. `/^TASK-\d+$/`, `/^STORY-\d+$/`) and return 400/404 for invalid IDs. — **Done** (`src/lib/utils/route-validation.ts` + all task/story `[id]` routes)

**Medium priority (quality / maintainability)**

4. **Phase handlers:** Extract shared “build params → adapter → spawn” logic to reduce duplication.
5. **WebSocket:** Remove or consolidate `src/lib/ws/server.ts` so there is one clear WebSocket implementation.
6. **resolveArtifactPath:** Reject `..` and absolute paths so the function never returns paths outside the task root. — **Done** (`src/lib/utils/storage.ts`)

**Lower priority (polish for open source)**

7. **README:** Replace with project-specific documentation.
8. **Dev server command:** Document that `body.command` in POST `/api/tasks/[id]/server` is trusted; optionally restrict to a whitelist.
9. **PhaseDefaultsSection / Create*Dialog:** Consider shared components or modes for agents vs roles if the forms evolve further.

---

*Review conducted against the codebase as of the stated date; re-validate after significant changes.*
