# Code Review: Task Archive Functionality (TASK-12)

## Summary

This PR implements the ability to archive tasks (soft delete) with the following features:
- Archive/restore task operations via service layer and API
- Filter toggle to switch between active and archived task views
- Permanent deletion only allowed for archived tasks
- Confirmation dialogs for destructive actions
- Comprehensive test coverage

**Overall Assessment**: The implementation is well-structured and follows existing patterns in the codebase. All 345 tests pass. A few issues need attention.

---

## P0 Issues (Must Fix)

*None identified.*

---

## P1 Issues (Should Fix)

### 1. Unrelated Changes to Phase Actions (ActionBar.tsx)

**Location**: `src/components/shared/ActionBar.tsx`

The diff includes changes unrelated to the archive feature:

```diff
-    { label: 'Approve Review', variant: 'success', target: { phase: 'manual_testing' } },
+    { label: 'Approve Review', variant: 'success', target: { phase: 'fix_review' } },
```

Additionally, new phase actions for `fix_review` and `final_testing` were added. While these may be valid improvements, they should be in a separate task/commit to maintain clear change tracking.

**Recommendation**: Revert the `code_review` target change and the new phase entries, or create a separate commit with a clear rationale for this workflow change.

---

### 2. Migration File Includes Unrelated Column

**Location**: `src/lib/db/migrations/0001_add_archive_fields.sql`

```sql
ALTER TABLE `tasks` ADD `auto_approve` integer DEFAULT false NOT NULL;  -- Unrelated!
ALTER TABLE `tasks` ADD `archived` integer DEFAULT false NOT NULL;
ALTER TABLE `tasks` ADD `archived_at` text;
```

The `auto_approve` column addition is unrelated to archive functionality and shouldn't be in this migration file.

**Recommendation**: Remove the `auto_approve` line from this migration file, or rename the migration to reflect all included changes.

---

## P2 Issues (Nice to Fix)

### 1. Missing Newlines at End of Files

The following files are missing trailing newlines:
- `src/app/api/tasks/[id]/archive/route.ts`
- `src/app/api/tasks/[id]/restore/route.ts`  
- `src/components/board/ArchiveFilter.tsx`
- `src/lib/db/migrations/0001_add_archive_fields.sql`

**Recommendation**: Add newlines at end of files for POSIX compliance.

---

### 2. Error Typing Uses `any`

**Location**: Archive and restore route handlers use `catch (error: any)`.

This is consistent with existing patterns in the codebase, but ideally would use a proper error type.

**Recommendation**: Low priority - matches existing patterns. Consider a future cleanup task to improve error typing across all routes.

---

## Positive Observations

### Well-Structured Implementation
- Follows existing service layer patterns
- Clean separation between archive (soft delete) and delete (hard delete)
- Proper validation requiring archive before permanent deletion

### Comprehensive Test Coverage
- Unit tests for TaskService archive/restore methods
- Integration tests for API endpoints
- Edge case coverage (idempotent operations, error handling)
- Workflow integration test covering full lifecycle

### Good UX Decisions
- Confirmation dialogs prevent accidental data loss
- Visual distinction for archived tasks (reduced opacity)
- Clear toggle between active/archived views
- Drag-and-drop disabled for archived tasks

### Database Design
- Proper index on `archived` column for query performance
- Timestamps tracked via `archived_at`
- Boolean storage as INTEGER for SQLite compatibility

---

## Files Changed

| Category | Files |
|----------|-------|
| Schema | `src/lib/db/schema.ts`, `src/lib/yaml/schemas.ts`, `src/lib/db/index.ts` |
| Service | `src/lib/services/task-service.ts` |
| API Routes | `src/app/api/tasks/[id]/archive/route.ts`, `src/app/api/tasks/[id]/restore/route.ts`, `src/app/api/tasks/route.ts` |
| Components | `Board.tsx`, `Card.tsx`, `Column.tsx`, `TaskDetail.tsx`, `ActionBar.tsx`, `ArchiveFilter.tsx`, `Dialog.tsx` |
| Hooks | `src/hooks/useTasks.ts` |
| Tests | `api-routes.test.ts`, `task-service.test.ts`, `task-archive-endpoints.test.ts` |

---

## Verdict

**[REVIEW_NEEDS_FIXES]**

The P1 issue regarding unrelated phase action changes should be addressed before merging to maintain a clean commit history and make the change set reviewable. The migration file issue is also worth fixing to avoid confusion.

The core archive functionality is solid and well-tested.
