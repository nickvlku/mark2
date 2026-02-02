# Mark2 State Management

Mark2 uses an **orphan branch** approach with **lock-based coordination** to enable multi-developer workflows without polluting your main branch's git history.

## Overview

Instead of storing task state in `.mark2/` on your main branch (which leads to frequent merge conflicts and history pollution), Mark2 stores state on a separate orphan branch called `mark2-state`. This branch has no common ancestor with your main branch and only contains Mark2 state files.

## Key Concepts

### Orphan Branch

An orphan branch is a git branch that has no common history with other branches. The `mark2-state` branch contains:

```
tasks/
  TASK-1.yaml
  TASK-1.activity.yaml
  TASK-1.lock          # Lock file when task is in progress
  TASK-2.yaml
  ...
stories/
  STORY-1.yaml
  ...
config.yaml
agents.yaml
roles.yaml
context.json
```

### Local Directory Structure

Your local `.mark2/` directory is now entirely gitignored and contains only local/ephemeral data:

```
.mark2/
  mark2.db             # SQLite index (rebuilt from state branch)
  mark2.db-shm/wal
  clones/              # Task working directories
  storage/             # Artifacts, prompts, sessions
  server.pid
  server.log
  .state/              # Worktree checkout of mark2-state branch
```

The `.state/` subdirectory is a git worktree that stays checked out to the `mark2-state` branch, providing local access to the state files.

### Lock Files

When a developer picks up a task (transitions from `pending` → `design`), a lock file is created:

```json
{
  "locked_by": "Nick Voluik",
  "email": "nick@example.com",
  "locked_at": "2024-01-15T10:30:00Z",
  "machine": "nicks-macbook"
}
```

This lock is immediately pushed to the remote, preventing other developers from picking up the same task.

**Lock timing:**
- **Acquired:** When task moves from `pending` → `design` (first work phase)
- **Released:** When task reaches `done` or is archived

**Lock ownership:** Based on git config `user.email`

**Lock expiration:** After a configurable timeout (default: 5 days), locks can be force-acquired by another developer.

## Multi-Developer Workflow

### Starting Work

1. Run `mark2 sync` to pull the latest state
2. View the board to see available tasks (unlocked tasks in `pending`)
3. Pick up a task by moving it to `design`
4. Mark2 automatically acquires a lock and pushes it

### During Work

- Your lock prevents others from picking up the same task
- Other developers can see your lock on the task (shown in UI and `mark2 locks`)
- Continue working on your task across multiple sessions

### Completing Work

1. Move task to `done`
2. Mark2 automatically releases the lock
3. Changes are pushed to the state branch

### Handling Lock Conflicts

If you try to pick up a locked task:

```
Error: Task is locked by Jane Doe (jane@example.com) since 1/15/2024
```

**Options:**
- Pick a different task
- Wait for the developer to complete their work
- If the lock is expired (>5 days), use `mark2 lock TASK-N --force`

## CLI Commands

### Sync Commands

```bash
# Pull latest state from remote
mark2 sync

# Push local changes to remote
mark2 sync --push
```

### Lock Commands

```bash
# View all current locks
mark2 locks

# Manually acquire a lock
mark2 lock TASK-1

# Force acquire an expired lock
mark2 lock TASK-1 --force

# Release a lock you own
mark2 unlock TASK-1
```

## Configuration

Add to `.mark2/config.yaml` (or in the state branch's `config.yaml`):

```yaml
state_sync:
  lock_timeout_days: 5        # Days before lock can be force-taken
  auto_pull_on_start: true    # Pull state on mark2 start
```

## How It Works

### On `mark2 init`

1. Creates the `mark2-state` orphan branch if it doesn't exist
2. Migrates any existing state from `.mark2/` to the orphan branch
3. Sets up the `.state/` worktree
4. Adds `.mark2/` to `.gitignore` (everything is now local)

### On Server Start

1. Ensures the `.state/` worktree exists
2. Pulls latest from remote (if `auto_pull_on_start` is enabled)
3. Rebuilds SQLite database from the state files

### On Task Operations

1. Task creation: Write to `.state/`, push to remote
2. Task updates: Write to `.state/`, update SQLite
3. Phase transitions: Handle lock acquisition/release, push changes
4. Task deletion: Remove from `.state/`, push deletion

## Conflict Resolution

### Rare Conflicts

Because locks prevent concurrent work on the same task, conflicts are rare. They can occur if:

- Two developers start working on the same task simultaneously before locks sync
- Network issues prevent timely lock synchronization

### When Conflicts Occur

1. Mark2 will show: "Merge conflict - manual resolution required"
2. Navigate to `.mark2/.state/`
3. Resolve conflicts in the affected YAML files
4. Run `mark2 sync --push` to push the resolution

### Prevention

- Always run `mark2 sync` before picking up new tasks
- Use the UI which shows real-time lock status
- Configure shorter lock timeouts for active teams

## Migration from Old Setup

If you have an existing Mark2 installation with state in `.mark2/`:

1. Run `mark2 init` again
2. Mark2 detects existing state and offers to migrate
3. State is copied to the orphan branch
4. Old state files are cleaned up
5. `.gitignore` is updated

Your git history is preserved - the migration only moves files to the new branch.

## Benefits

1. **Clean History:** Task state changes don't clutter your main branch
2. **No Merge Conflicts:** Lock-based coordination prevents concurrent edits
3. **Multi-Developer:** Each developer can work on different tasks simultaneously
4. **Sync When Needed:** Only sync on task pickup/completion, not every change
5. **Visibility:** See who's working on what via `mark2 locks` or the UI
6. **Safety:** Expired locks can be recovered; locks are based on git identity
