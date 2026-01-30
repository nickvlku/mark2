# Plan: Restructure Mark2 Task Storage

## Problem Statement

Currently, Mark2 has several issues with how task-related files are stored:

1. **Worktree Pollution**: Test results, playwright reports, `.mark2/` prompt files, and other artifacts land directly in git worktrees
2. **Merge Conflicts**: Multiple worktrees touching the same generated files creates merge conflicts
3. **No Clear Ownership**: Task-specific data is mixed with project-wide configuration
4. **Lost Context**: If we gitignore task data, we lose valuable debugging context and can't use artifacts as context for dependent tasks
5. **Portability Issues**: Hardcoded paths don't work across different engineers' machines

## Current State

```
project/
  .mark2/
    config.yaml           # Project config
    roles.yaml            # Role definitions
    mark2.db              # SQLite database
    tasks/
      TASK-33.yaml        # Task definition
      TASK-33.activity.yaml
  .worktrees/
    TASK-33/
      design/             # Git worktree
        .mark2/           # PROBLEM: Prompt files here
          prompt-coding.md
        design.md         # PROBLEM: Artifact in worktree
        test-results/     # PROBLEM: Test output in worktree
        playwright-report/# PROBLEM: Large reports in worktree
```

## Proposed Solution

### New Directory Structure

Use a git submodule for `.mark2/` with task-isolated storage directories:

```
project/
  .mark2/                           # Git submodule (separate history)
    config.yaml                     # Project-wide config
    roles.yaml                      # Project-wide role definitions
    mark2.db                        # SQLite (gitignored)
    mark2.db-shm                    # SQLite WAL (gitignored)
    mark2.db-wal                    # SQLite WAL (gitignored)
    tasks/                          # Task definitions (tracked)
      TASK-33.yaml
      TASK-33.activity.yaml
    storage/                        # Per-task data (tracked selectively)
      TASK-33/
        prompts/                    # Generated prompts (tracked)
          design.md
          coding.md
          testing.md
        artifacts/                  # Phase outputs (tracked)
          design.md                 # Design document
          test-results.md           # Test summary
          review.md                 # Code review notes
        sessions/                   # Terminal logs (tracked, compressed)
          design-final.log.gz
          coding-final.log.gz
        test-runs/                  # GITIGNORED - transient
        playwright-reports/         # GITIGNORED - large, regeneratable
  .worktrees/
    TASK-33/
      design/                       # Git worktree - CODE ONLY
        src/
        package.json
        # No .mark2/, no artifacts, no test outputs
```

### Key Design Decisions

#### 1. Submodule for `.mark2/`

**Why submodule:**
- Independent git history for orchestration data
- Can clone code repo without mark2 history (skip submodule)
- Can backup/archive mark2 data separately
- Clean separation of concerns

**Worktree compatibility:**
- Each worktree gets its own submodule checkout
- Task isolation via `storage/{taskId}/` directories prevents conflicts
- Each task only writes to its own directory

**Setup during `mark2 init`:**
```bash
# For new projects
git submodule add <mark2-data-repo-url> .mark2

# For existing projects
git submodule init && git submodule update

# Or create local-only (no remote)
mkdir .mark2 && cd .mark2 && git init
```

#### 2. No ENV Variables for Paths

All paths derived at runtime relative to project root:
```typescript
const storageDir = path.join(projectRoot, '.mark2', 'storage', taskId);
```

No config needed, no portability issues.

#### 3. Selective Gitignore

Inside `.mark2/.gitignore`:
```gitignore
# Database files (recreatable)
*.db
*.db-shm
*.db-wal

# Transient test data (regeneratable)
storage/*/test-runs/
storage/*/playwright-reports/
storage/*/*.tmp

# Keep everything else tracked
```

#### 4. Artifact Path Changes

**Before:** Artifacts stored relative to worktree
```yaml
artifacts:
  - name: design-document
    path: design.md  # Relative to worktree
```

**After:** Artifacts stored in `.mark2/storage/{taskId}/artifacts/`
```yaml
artifacts:
  - name: design-document
    path: artifacts/design.md  # Relative to task storage dir
```

Artifact API resolves: `.mark2/storage/{taskId}/{artifact.path}`

#### 5. Worktrees Contain Code Only

Agents write artifacts to storage dir, not worktree:
- Prompts: `.mark2/storage/{taskId}/prompts/`
- Artifacts: `.mark2/storage/{taskId}/artifacts/`
- Sessions: `.mark2/storage/{taskId}/sessions/`

Worktrees contain ONLY:
- Source code changes
- Package.json / config changes
- Anything that would be in a normal PR

#### 6. Session Log Handling

- During phase: Stream to WebSocket (current behavior)
- After phase complete: Save final N lines to `sessions/{phase}-final.log.gz`
- Compressed to save space
- Kept for debugging, not real-time viewing

#### 7. Retention Policy

Implement `mark2 cleanup` command:
- Delete test-runs older than N days
- Delete playwright-reports older than N days
- Compress session logs older than N days
- Keep artifacts indefinitely (they're small, valuable)

### Migration Path

1. **Phase 1: New storage structure**
   - Create `.mark2/storage/` directory structure
   - Update orchestration to write prompts/artifacts there
   - Update artifact API to read from new location
   - Worktrees stop getting polluted

2. **Phase 2: Submodule conversion**
   - Convert `.mark2/` to submodule
   - Update `mark2 init` to handle submodule setup
   - Document submodule workflow

3. **Phase 3: Cleanup tooling**
   - Add `mark2 cleanup` command
   - Add `mark2 archive` command for completed tasks
   - Add retention policy configuration

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/orchestration/prompt-assembler.ts` | Write prompts to storage dir |
| `src/lib/orchestration/phase-handlers/*.ts` | Update artifact paths |
| `src/lib/services/artifact-service.ts` | Resolve paths from storage dir |
| `src/app/api/tasks/[id]/artifacts/route.ts` | Update path resolution |
| `src/lib/adapters/claude-code.ts` | Write prompt to storage dir |
| `cli/commands/init.ts` | Set up storage structure, optional submodule |
| `cli/commands/cleanup.ts` | NEW: Retention policy enforcement |

### New Files

| File | Purpose |
|------|---------|
| `src/lib/utils/storage.ts` | Storage path resolution utilities |
| `cli/commands/cleanup.ts` | Cleanup/retention command |
| `cli/commands/archive.ts` | Archive completed tasks |

### API Changes

#### Artifact Resolution
```typescript
// Before
const artifactPath = path.join(worktreePath, artifact.path);

// After
const artifactPath = path.join(
  projectRoot, '.mark2', 'storage', taskId, artifact.path
);
```

#### Environment Variables for Agents
```typescript
// Add to agent invocation
env: {
  MARK2_STORAGE_DIR: path.join(projectRoot, '.mark2', 'storage', taskId),
  MARK2_ARTIFACTS_DIR: path.join(projectRoot, '.mark2', 'storage', taskId, 'artifacts'),
  // ... existing vars
}
```

### Prompt Updates

Add to orchestration prompts:
```markdown
## File Locations

- Save artifacts (design.md, test-results.md, etc.) to: $MARK2_ARTIFACTS_DIR/
- Your working directory for code changes is the current directory
- Do NOT create .mark2/ folders or write test outputs to the working directory
```

### Edge Cases

1. **Dependent tasks**: Task B depends on Task A's design doc
   - Resolved: Design doc persists in `.mark2/storage/TASK-A/artifacts/design.md`
   - Can be read by any task via artifact API

2. **Task loops back**: Coding fails tests, loops back
   - Resolved: All artifacts in storage dir, not affected by worktree state

3. **Concurrent agents (bakeoff)**: Two agents on same task
   - Resolved: Use `storage/{taskId}/{agentName}/` for bakeoff scenarios

4. **Worktree deletion**: Task completes, worktree cleaned up
   - Resolved: Artifacts safe in `.mark2/storage/`, independent of worktree

5. **Clone without history**: Engineer wants code without mark2 baggage
   - Resolved: `git clone --recurse-submodules=false` skips .mark2 submodule

### Success Criteria

1. Worktrees contain only code changes (no .mark2/, no test outputs)
2. Artifacts persist and are accessible after task completion
3. No merge conflicts from generated files
4. Works across different engineer machines without config changes
5. Old task data available for debugging and context
6. Large transient files (playwright) don't bloat git history

### Open Questions

1. Should we support non-submodule mode for simpler setups?
2. What's the default retention period for test-runs?
3. Should `mark2 archive` compress or just move to a separate branch?
4. How do we handle the migration of existing tasks with artifacts in worktrees?
