# Session 2026-01-28: Bug Fixes and Safety Improvements

## Summary

This session identified and fixed several critical bugs in the Mark2 orchestration system.

---

## Bug 1: EndTokenWatcher Missing Tokens (P1)

### Symptom
TASK-33 showed `[CODING_COMPLETED]` in tmux output, but:
- Task didn't transition to next phase
- Session remained marked as "running"
- No `end_token_detected` event in activity log

### Root Cause
The `EndTokenWatcher.poll()` method used **string length comparison** to detect new content:
```typescript
// OLD (broken)
if (output.length > entry.lastCaptureLength) {
  newContent = output.slice(entry.lastCaptureLength);
} else {
  return; // Content hasn't grown — nothing new to scan
}
```

When the tmux pane is full and scrolling, **content changes but total length stays constant**, causing the check to return early and miss tokens.

### Fix
Changed to **content hash comparison** and scan full output:
```typescript
// NEW (fixed)
const currentHash = hashContent(output);
if (currentHash === entry.lastContentHash) {
  return; // Content unchanged
}
entry.lastContentHash = currentHash;

// Scan entire captured output for tokens
for (const token of tokens) {
  if (output.includes(token) && !entry.baselineTokens.has(token)) {
    // Found token that wasn't in baseline
  }
}
```

### Files Modified
- `src/lib/orchestration/end-token-watcher.ts`

---

## Bug 2: Serena Plugin Writing to Main Branch (P0 CRITICAL)

### Symptom
TASK-33's coding agent claimed to implement features, but:
- No code in worktree
- Code appeared in **main project** instead
- Complete bypass of worktree isolation

### Root Cause
1. **Serena plugin globally enabled** in `~/.claude/settings.json`
2. **Serena had main project activated**, not the task worktree
3. When orchestrated agent ran Claude Code in worktree, it inherited global Serena
4. **All Serena file operations went to main project**

Evidence:
```
Main project (WRONG - where code went):
  cli/commands/stop.ts     - NEW
  cli/commands/start.ts    - MODIFIED
  cli/index.ts             - MODIFIED

Worktree (CORRECT - where code should be):
  cli/commands/stop.ts     - MISSING
```

### Fix (Multi-layered)

#### Layer 1: Disable Serena globally
```bash
# Modified ~/.claude/settings.json
"enabledPlugins": {
  "serena@claude-plugins-official": false  # Was true
}
```

#### Layer 2: Prompt warning (defense in depth)
Added to `src/lib/orchestration/prompt-assembler.ts`:
```markdown
## CRITICAL: File Operations

You MUST use Claude Code's native file tools (Read, Write, Edit, Glob, Grep).
DO NOT use Serena/MCP file tools (plugin:serena) as they may write to WRONG location.
```

#### Layer 3: Safety checks before spawning agents
Created `src/lib/utils/worktree-safety.ts`:
- `validateWorktreePath()` - Ensures path is inside `.worktrees/`
- `checkMainBranchContamination()` - Detects uncommitted source files in main
- `isValidGitWorktree()` - Verifies it's a real git worktree
- `performSafetyChecks()` - Comprehensive check, throws on violations

Integrated into all phase handlers:
- `design.ts`
- `coding.ts`
- `testing.ts`
- `code-review.ts`
- `manual-testing.ts`

### Files Modified
- `~/.claude/settings.json` - Disabled Serena
- `src/lib/orchestration/prompt-assembler.ts` - Added warning
- `src/lib/utils/worktree-safety.ts` - NEW
- `src/lib/orchestration/phase-handlers/design.ts`
- `src/lib/orchestration/phase-handlers/coding.ts`
- `src/lib/orchestration/phase-handlers/testing.ts`
- `src/lib/orchestration/phase-handlers/code-review.ts`
- `src/lib/orchestration/phase-handlers/manual-testing.ts`

### Recovery for TASK-33
1. Copied contaminated code from main to worktree
2. Reverted main branch: `git checkout HEAD -- cli/ package.json`
3. Removed untracked `cli/commands/stop.ts` from main
4. Task can now continue normally

---

## Bug 3: Code Tab Not Scrollable

### Symptom
Code diff in sidebar couldn't be scrolled, making it impossible to review changes.

### Fix
- Added `h-full flex flex-col` to container
- Added `flex-1 overflow-auto min-h-0` to content area
- Added "Expand" button to open full-screen modal

### Files Modified
- `src/components/detail/CodeTab.tsx`

---

## Bug 4: No Full-Screen Diff View

### Symptom
Couldn't see full diff with proper side-by-side comparison.

### Fix
Created `DiffModal.tsx` with:
- Split view (side-by-side comparison)
- Unified view (traditional diff)
- File list sidebar
- View mode toggle
- Keyboard support (Escape to close)
- Proper diff parsing and line number display

### Files Created
- `src/components/detail/DiffModal.tsx`

---

## Bug 5: Diff Not Captured on Phase Completion

### Symptom
After coding phase completed, no diff was saved as artifact for review.

### Fix
Added automatic diff capture in `processEndToken()`:
```typescript
if (phase === 'coding' && token === '[CODING_COMPLETED]') {
  const diff = await this.captureAndSaveDiff(taskId, phase);
  // Saves to worktree as coding-diff.patch
  // Registers as artifact
}
```

Created `captureAndSaveDiff()` method that:
- Runs `git diff HEAD` for tracked changes
- Lists untracked files and formats as diff
- Saves to `{phase}-diff.patch` in worktree
- Registers as artifact via ArtifactService

### Files Modified
- `src/lib/orchestration/engine.ts`

---

## Bug 6: Diff API Endpoint Missing

### Symptom
`/api/worktrees/{id}/diff` returned 404.

### Fix
Created new endpoint that:
1. Checks for saved diff artifacts first
2. Falls back to live `git diff` from worktree
3. Handles both tracked and untracked files

### Files Created
- `src/app/api/worktrees/[id]/diff/route.ts`

---

## Test Status

All 262 tests passing after fixes.

---

## Remaining Known Issues

1. **Storage structure** - Task artifacts still in worktrees, causes merge conflicts
   - See: `.mark2/plans/task-storage-restructure.md`

2. **TASK-33 state** - Currently in `testing` phase, code is in worktree, ready to continue
