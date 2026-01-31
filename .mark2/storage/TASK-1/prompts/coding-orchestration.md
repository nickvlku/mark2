# ORCHESTRATION INSTRUCTIONS

Current phase: coding
Task ID: TASK-1


## CRITICAL: File Operations

You are running in an isolated git clone for this task.

**For file operations**, use Claude Code's native tools:
- Read: to read files
- Write: to create new files
- Edit: to modify existing files
- Glob: to find files by pattern
- Grep: to search file contents
- Bash: for npm, running tests, dev server, etc.

**For Mark2 operations**, use the mark2_* MCP tools:
- mark2_save_artifact: save and register deliverables
- mark2_git_commit, mark2_git_push, mark2_git_sync: git operations
- mark2_signal_complete: signal phase completion
- mark2_get_paths: get storage paths

**Other MCP tools** (like Playwright for browser testing) are fine to use.

**EXCEPTION**: Do NOT use Serena MCP tools (plugin:serena) for file operations. Serena may be
configured for a different project and will write files to the WRONG location.


## File Locations

**Artifacts**: Save design documents, test results, review notes, and other deliverables to the artifacts directory.
  - Use `mark2_get_paths` to get the exact path, or use `mark2_save_artifact` to save and register in one step.

**Working Directory**: Make all code changes in the current working directory (an isolated git clone).
  - This is where source code, package.json, and other project files live.
  - Use Mark2 MCP tools for git operations (see Git Operations below).

**Important**: Do NOT create `.mark2/` folders in the working directory. Do NOT write test outputs,
artifacts, or temporary files to the working directory. Only source code changes belong there.


## Git Operations (CRITICAL)

You MUST use the Mark2 MCP tools for all git operations. DO NOT run git commands directly.
These tools handle commit, push, and sync operations safely within your isolated clone.

**Check git status:**
  Use `mark2_git_status` with task_id to see modified files and current branch.

**Commit changes:**
  Use `mark2_git_commit` with task_id and message to stage and commit all changes.

**Push to remote:**
  Use `mark2_git_push` with task_id to push your branch.

**Sync with latest from main:**
  Use `mark2_git_sync` with task_id to rebase on the latest main branch.

IMPORTANT: Always commit your changes before signaling phase completion. Push is optional but recommended.


## Signaling Phase Completion

When you have completed all work for this phase, use the `mark2_signal_complete` MCP tool.
Use the Task ID shown at the top of this prompt.

  mark2_signal_complete(task_id: "<YOUR_TASK_ID>", token: "<END_TOKEN>")

This triggers the phase transition automatically. Do NOT emit end tokens as plain text.

You are in the CODING phase. Your job is to:
1. Implement the changes described in the design document
2. Follow the project's coding conventions and style
3. Write clean, well-documented code
4. Ensure the code compiles/builds without errors
5. Commit your changes: mark2_git_commit(task_id, message: "...")

When done, signal: mark2_signal_complete(task_id, token: "[CODING_COMPLETED]")

Valid completion tokens for this phase: [CODING_COMPLETED]

IMPORTANT: Use mark2_signal_complete with one of the valid tokens when done.
Do not signal completion until you have fully completed your work for this phase.