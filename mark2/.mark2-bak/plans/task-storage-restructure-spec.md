# Implementation Specification: Task Storage Restructure

**Version:** 1.0
**Status:** Draft
**Date:** 2026-01-28

---

## 1. Overview

### 1.1 Purpose

This specification defines the implementation of a restructured task storage system for Mark2. The new architecture isolates task-specific data in `.mark2/storage/{taskId}/` directories, keeping git worktrees clean and preventing merge conflicts from generated files.

### 1.2 Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G1 | Clean worktrees | Worktrees contain only source code changes |
| G2 | Artifact persistence | Artifacts accessible after task completion |
| G3 | No merge conflicts | Zero conflicts from Mark2-generated files |
| G4 | Portability | Works without machine-specific configuration |
| G5 | Debugging support | Historical task data retained and queryable |
| G6 | Storage efficiency | Transient files excluded from git history |

### 1.3 Scope

**In Scope:**
- Storage directory structure and path resolution
- Artifact storage and retrieval APIs
- Prompt and session log storage
- Environment variable injection for agents
- Phase 1 migration (new storage structure)

**Out of Scope (Future Phases):**
- Git submodule conversion (Phase 2)
- CLI cleanup commands (Phase 3)
- Retention policy enforcement (Phase 3)

---

## 2. Architecture

### 2.1 Directory Structure

```
project/
  .mark2/
    config.yaml                         # Project configuration
    roles.yaml                          # Role definitions
    agents.yaml                         # Agent definitions
    mark2.db                            # SQLite database
    tasks/
      {TASK-ID}.yaml                    # Task definition
      {TASK-ID}.activity.yaml           # Activity log
    storage/                            # NEW: Per-task isolated storage
      {TASK-ID}/
        prompts/
          design.md                     # Phase prompt files
          coding.md
          testing.md
          code-review.md
          manual-testing.md
        artifacts/
          design.md                     # Design document
          test-results.md               # Test summary
          review.md                     # Code review notes
        sessions/
          design-final.log.gz           # Compressed session logs
          coding-final.log.gz
        test-runs/                      # GITIGNORED
        playwright-reports/             # GITIGNORED
  .worktrees/
    {TASK-ID}/
      {phase}/                          # Git worktree - CODE ONLY
```

### 2.2 Storage Path Resolution

All paths are resolved at runtime relative to the project root. No environment variables or configuration required for path derivation.

```typescript
interface StoragePaths {
  root: string;           // .mark2/storage/{taskId}
  prompts: string;        // .mark2/storage/{taskId}/prompts
  artifacts: string;      // .mark2/storage/{taskId}/artifacts
  sessions: string;       // .mark2/storage/{taskId}/sessions
  testRuns: string;       // .mark2/storage/{taskId}/test-runs
  playwrightReports: string; // .mark2/storage/{taskId}/playwright-reports
}
```

### 2.3 Gitignore Configuration

File: `.mark2/.gitignore`

```gitignore
# Database files (local state, recreatable from tasks/*.yaml)
*.db
*.db-shm
*.db-wal

# Transient test data (regeneratable on demand)
storage/*/test-runs/
storage/*/playwright-reports/

# Temporary files
storage/*/*.tmp
storage/*/*.temp
```

---

## 3. Component Specifications

### 3.1 Storage Utility Module

**File:** `src/lib/utils/storage.ts`

```typescript
/**
 * Resolves storage paths for a given task.
 * All paths are absolute and derived from projectRoot.
 */
export function getTaskStoragePaths(projectRoot: string, taskId: string): StoragePaths;

/**
 * Ensures all storage directories exist for a task.
 * Creates directories with appropriate permissions.
 * Idempotent - safe to call multiple times.
 */
export async function ensureTaskStorageExists(projectRoot: string, taskId: string): Promise<void>;

/**
 * Resolves an artifact path from a relative path.
 * Input: "artifacts/design.md" or "design.md"
 * Output: "/absolute/path/.mark2/storage/TASK-33/artifacts/design.md"
 */
export function resolveArtifactPath(projectRoot: string, taskId: string, relativePath: string): string;

/**
 * Migrates an artifact from worktree location to storage location.
 * Used for backwards compatibility during migration period.
 */
export async function migrateArtifact(
  projectRoot: string,
  taskId: string,
  worktreePath: string,
  artifactRelativePath: string
): Promise<string>;
```

### 3.2 Prompt Assembler Changes

**File:** `src/lib/orchestration/prompt-assembler.ts`

**Current Behavior:**
- Writes prompts to worktree `.mark2/` directory

**New Behavior:**
- Writes prompts to `.mark2/storage/{taskId}/prompts/`
- Returns storage path instead of worktree path

```typescript
// Before
const promptPath = path.join(worktreePath, '.mark2', `prompt-${phase}.md`);

// After
const storagePaths = getTaskStoragePaths(projectRoot, taskId);
const promptPath = path.join(storagePaths.prompts, `${phase}.md`);
```

### 3.3 Phase Handler Changes

**Files:** `src/lib/orchestration/phase-handlers/*.ts`

Each phase handler must be updated to:

1. Write artifacts to storage directory, not worktree
2. Read artifacts from storage directory
3. Pass storage paths to agents via environment variables

**Artifact Path Resolution:**

```typescript
// Before
const designDoc = path.join(worktreePath, 'design.md');

// After
const storagePaths = getTaskStoragePaths(projectRoot, taskId);
const designDoc = path.join(storagePaths.artifacts, 'design.md');
```

### 3.4 Artifact API Changes

**File:** `src/app/api/tasks/[id]/artifacts/route.ts`

**GET /api/tasks/{id}/artifacts/{name}**

Path resolution logic:

```typescript
async function resolveArtifactPath(taskId: string, artifactName: string): Promise<string> {
  const projectRoot = await getProjectRoot();
  const task = await getTask(taskId);

  // Find artifact definition in task
  const artifact = task.artifacts?.find(a => a.name === artifactName);
  if (!artifact) {
    throw new NotFoundError(`Artifact '${artifactName}' not found`);
  }

  // Primary: Check storage location
  const storagePath = resolveArtifactPath(projectRoot, taskId, artifact.path);
  if (await fileExists(storagePath)) {
    return storagePath;
  }

  // Fallback: Check legacy worktree location (migration compatibility)
  if (task.worktreePath) {
    const legacyPath = path.join(task.worktreePath, artifact.path);
    if (await fileExists(legacyPath)) {
      // Optionally migrate on read
      return legacyPath;
    }
  }

  throw new NotFoundError(`Artifact file not found`);
}
```

### 3.5 Agent Adapter Changes

**File:** `src/lib/adapters/claude-code.ts`

**Environment Variables:**

Add new environment variables to agent invocation:

```typescript
const agentEnv = {
  // Existing variables
  MARK2_TASK_ID: taskId,
  MARK2_PHASE: phase,
  MARK2_WORKTREE_PATH: worktreePath,

  // NEW: Storage directories
  MARK2_STORAGE_DIR: storagePaths.root,
  MARK2_ARTIFACTS_DIR: storagePaths.artifacts,
  MARK2_PROMPTS_DIR: storagePaths.prompts,
  MARK2_SESSIONS_DIR: storagePaths.sessions,
};
```

**Prompt Injection:**

Append to all generated prompts:

```markdown
## File Locations

- **Artifacts**: Save design documents, test results, and other artifacts to: `$MARK2_ARTIFACTS_DIR/`
- **Working Directory**: Make code changes in the current working directory (the git worktree)
- **Important**: Do NOT create `.mark2/` folders or write test outputs in the working directory
```

### 3.6 Session Log Storage

**File:** `src/lib/orchestration/engine.ts`

**On Phase Completion:**

```typescript
async function saveSessionLog(
  projectRoot: string,
  taskId: string,
  phase: string,
  sessionContent: string
): Promise<void> {
  const storagePaths = getTaskStoragePaths(projectRoot, taskId);
  const logPath = path.join(storagePaths.sessions, `${phase}-final.log.gz`);

  // Compress and save
  const compressed = await gzip(sessionContent);
  await fs.writeFile(logPath, compressed);
}
```

**Retention:**
- Keep last N lines of session (configurable, default 10000)
- Compress with gzip before storage
- Session logs are informational, not required for operation

---

## 4. Data Models

### 4.1 Task YAML Schema Changes

**Current:**
```yaml
artifacts:
  - name: design-document
    path: design.md  # Relative to worktree
```

**New:**
```yaml
artifacts:
  - name: design-document
    path: artifacts/design.md  # Relative to storage dir
    # OR short form (assumes artifacts/ prefix)
    path: design.md
```

**Path Resolution Rules:**
1. If path starts with `artifacts/`, `prompts/`, or `sessions/`: use as-is relative to storage root
2. Otherwise: prefix with `artifacts/` (backwards compatible default)

### 4.2 Storage Paths Interface

```typescript
interface StoragePaths {
  /** Root storage directory: .mark2/storage/{taskId} */
  root: string;

  /** Prompt files: .mark2/storage/{taskId}/prompts */
  prompts: string;

  /** Artifact files: .mark2/storage/{taskId}/artifacts */
  artifacts: string;

  /** Session logs: .mark2/storage/{taskId}/sessions */
  sessions: string;

  /** Test run outputs (gitignored): .mark2/storage/{taskId}/test-runs */
  testRuns: string;

  /** Playwright reports (gitignored): .mark2/storage/{taskId}/playwright-reports */
  playwrightReports: string;
}
```

---

## 5. API Specifications

### 5.1 Artifact Endpoints

**GET /api/tasks/{taskId}/artifacts**

Returns list of artifacts with metadata.

```typescript
interface ArtifactListResponse {
  artifacts: Array<{
    name: string;
    path: string;
    exists: boolean;
    size?: number;
    modifiedAt?: string;
    location: 'storage' | 'worktree' | 'missing';
  }>;
}
```

**GET /api/tasks/{taskId}/artifacts/{name}**

Returns artifact content. Checks storage first, falls back to worktree.

**POST /api/tasks/{taskId}/artifacts/{name}**

Writes artifact to storage location. Body is raw artifact content.

### 5.2 Storage Management Endpoints

**POST /api/tasks/{taskId}/storage/init**

Creates storage directory structure for a task. Called automatically on task creation.

**GET /api/tasks/{taskId}/storage/stats**

Returns storage statistics:

```typescript
interface StorageStatsResponse {
  totalSize: number;
  promptsSize: number;
  artifactsSize: number;
  sessionsSize: number;
  testRunsSize: number;
  playwrightReportsSize: number;
  fileCount: number;
}
```

---

## 6. Migration Strategy

### 6.1 Phase 1: New Storage Structure (This Spec)

**Week 1-2:**
1. Implement `storage.ts` utility module
2. Update prompt assembler to write to storage
3. Update phase handlers to use storage paths
4. Update artifact API with fallback resolution

**Week 2-3:**
1. Update agent adapters with new env vars
2. Update prompt templates with file location instructions
3. Add integration tests for storage paths

**Backwards Compatibility:**
- Artifact API checks both storage and worktree locations
- Existing tasks continue to work with worktree artifacts
- New tasks use storage location exclusively

### 6.2 Migration Command (Future)

```bash
# Migrate existing task artifacts to storage
mark2 migrate-storage --task TASK-33

# Migrate all tasks
mark2 migrate-storage --all
```

---

## 7. Testing Requirements

### 7.1 Unit Tests

**File:** `tests/unit/utils/storage.test.ts`

| Test | Description |
|------|-------------|
| `getTaskStoragePaths returns correct paths` | Verify all path components |
| `ensureTaskStorageExists creates directories` | Check directory creation |
| `ensureTaskStorageExists is idempotent` | Multiple calls don't fail |
| `resolveArtifactPath handles relative paths` | Test various path formats |
| `resolveArtifactPath handles absolute paths` | Should reject or handle |

### 7.2 Integration Tests

**File:** `tests/integration/storage.test.ts`

| Test | Description |
|------|-------------|
| `Prompts written to storage directory` | End-to-end prompt assembly |
| `Artifacts readable from storage` | API returns correct content |
| `Fallback to worktree location` | Legacy artifact resolution |
| `Storage initialized on task creation` | Directories created automatically |
| `Agent receives correct env vars` | Environment variable injection |

### 7.3 E2E Tests

| Test | Description |
|------|-------------|
| `Complete phase writes artifacts to storage` | Full phase execution |
| `Worktree contains only code changes` | No .mark2/ in worktree |
| `Dependent task reads predecessor artifacts` | Cross-task artifact access |

---

## 8. Acceptance Criteria

### 8.1 Functional Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| F1 | Prompts written to `.mark2/storage/{taskId}/prompts/` | Integration test |
| F2 | Artifacts written to `.mark2/storage/{taskId}/artifacts/` | Integration test |
| F3 | Session logs saved to `.mark2/storage/{taskId}/sessions/` | Integration test |
| F4 | Worktrees contain no `.mark2/` directory | E2E test |
| F5 | Worktrees contain no test outputs | E2E test |
| F6 | Existing tasks with worktree artifacts still work | Integration test |
| F7 | Storage directories created on task creation | Unit test |

### 8.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NF1 | Path resolution latency | < 1ms |
| NF2 | Storage init latency | < 100ms |
| NF3 | No external dependencies | Pure Node.js fs |
| NF4 | Works on Linux, macOS, Windows | Path normalization |

---

## 9. Implementation Checklist

### 9.1 New Files

- [ ] `src/lib/utils/storage.ts` - Storage path utilities
- [ ] `tests/unit/utils/storage.test.ts` - Unit tests
- [ ] `tests/integration/storage.test.ts` - Integration tests
- [ ] `.mark2/.gitignore` - Storage gitignore rules

### 9.2 Modified Files

- [ ] `src/lib/orchestration/prompt-assembler.ts` - Write prompts to storage
- [ ] `src/lib/orchestration/phase-handlers/design.ts` - Storage paths
- [ ] `src/lib/orchestration/phase-handlers/coding.ts` - Storage paths
- [ ] `src/lib/orchestration/phase-handlers/testing.ts` - Storage paths
- [ ] `src/lib/orchestration/phase-handlers/code-review.ts` - Storage paths
- [ ] `src/lib/orchestration/phase-handlers/manual-testing.ts` - Storage paths
- [ ] `src/lib/orchestration/engine.ts` - Session log storage
- [ ] `src/lib/adapters/claude-code.ts` - Environment variables
- [ ] `src/app/api/tasks/[id]/artifacts/route.ts` - Path resolution
- [ ] `src/lib/services/task-service.ts` - Initialize storage on task creation

### 9.3 Prompt Updates

- [ ] Design phase prompt - Add file location instructions
- [ ] Coding phase prompt - Add file location instructions
- [ ] Testing phase prompt - Add file location instructions
- [ ] Code review phase prompt - Add file location instructions

---

## 10. Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Support non-submodule mode? | Yes, Phase 1 works without submodule. Submodule is Phase 2 optional enhancement. |
| Default retention for test-runs? | 7 days. Configurable in Phase 3. |
| Archive: compress or branch? | Compress and move to `.mark2/archive/`. Branches add complexity. |
| Migration of existing artifacts? | Fallback resolution maintains compatibility. Explicit migration command in future. |

---

## 11. References

- Plan Document: `.mark2/plans/task-storage-restructure.md`
- Current Implementation: `src/lib/orchestration/`
- Artifact API: `src/app/api/tasks/[id]/artifacts/route.ts`
