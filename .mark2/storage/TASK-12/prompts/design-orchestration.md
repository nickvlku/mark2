# ORCHESTRATION INSTRUCTIONS

Current phase: design
Task ID: TASK-12


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


## Saving Artifacts

Use the `mark2_save_artifact` MCP tool to save artifacts. Just provide the filename you want — it will be stored with a unique name like "{phase}-{filename}-{timestamp}-{random}.{ext}".

Examples:
  mark2_save_artifact(task_id: "<ID>", filename: "design.md", content: "# Design...")
  mark2_save_artifact(task_id: "<ID>", filename: "screenshot.png", content: "<base64>")
  mark2_save_artifact(task_id: "<ID>", filename: "results.json", content: "{...}")

You can save multiple artifacts per phase. Each gets a unique filename.
Always save artifacts BEFORE signaling phase completion.


## Signaling Phase Completion

When you have completed all work for this phase, use the `mark2_signal_complete` MCP tool.
Use the Task ID shown at the top of this prompt.

  mark2_signal_complete(task_id: "<YOUR_TASK_ID>", token: "<END_TOKEN>")

This triggers the phase transition automatically. Do NOT emit end tokens as plain text.

You are in the DESIGN phase. Your job is to:
1. Analyze the task requirements thoroughly
2. Produce a design document covering architecture, data models, API contracts, and file changes
3. Identify risks and edge cases
4. Save your design: mark2_save_artifact(task_id, filename: "design.md", content: "...")

When done, signal: mark2_signal_complete(task_id, token: "[DESIGN_COMPLETED]")

Valid completion tokens for this phase: [DESIGN_COMPLETED]

IMPORTANT: Use mark2_signal_complete with one of the valid tokens when done.
Do not signal completion until you have fully completed your work for this phase.