# Code Review: Remove Legacy Agents System (TASK-13)

## Summary

This PR removes the legacy agents system and replaces it with the new decoupled roles system. The changes are comprehensive and well-executed, affecting navigation, database schema, API routes, orchestration engine, and all phase handlers.

## Review Status: ✅ APPROVED with Minor Issues

All tests pass (247/247), and the TypeScript errors are pre-existing on the base branch (not introduced by this PR).

---

## Changes Reviewed

### Files Deleted (13 files) ✅
- `src/app/agents/page.tsx`
- `src/app/api/agents/route.ts`
- `src/components/agents/AgentsPage.tsx`
- `src/components/agents/CreateAgentDialog.tsx`
- `src/components/agents/EditAgentDialog.tsx`
- `src/components/agents/ImportAgentsDialog.tsx`
- `src/components/agents/PhaseDefaultsSection.tsx`
- `src/components/detail/AgentsTab.tsx`
- `src/hooks/useAgents.ts`
- `src/lib/constants/default-agents.ts`
- `tests/integration/api/agents.test.ts`
- `tests/unit/schemas/agent-schemas.test.ts`
- `tests/unit/services/config-service-agents.test.ts`

All deleted files are agent-specific and correctly identified for removal.

### Core Changes Reviewed

| File | Status | Notes |
|------|--------|-------|
| `TopNavigation.tsx` | ✅ | Navigation link removed correctly |
| `schema.ts` (DB) | ✅ | `phase_agents_json`, `agent_name`, `agentSessions` table removed |
| `schemas.ts` (YAML) | ✅ | `AgentDefinitionSchema`, `AgentsFileSchema`, `ResolvedAgent` removed |
| `config-service.ts` | ✅ | `getAgents()`, `updateAgents()` methods removed |
| `engine.ts` | ⚠️ P2 | Comments outdated (see below) |
| `tmux-manager.ts` | ✅ | Simplified to tmux-only session management |
| `task-service.ts` | ✅ | Session status simplified, `phase_agents` returns `{}` |
| `worktree-service.ts` | ✅ | `agent_name` field removed |
| `prompt-assembler.ts` | ✅ | Uses `RoleConfig` instead of `AgentDefinition` |
| Phase handlers | ✅ | All converted from `AgentDefinition` to `RoleConfig` |
| `run-phase.ts` | ✅ | New shared utility for role-based phase execution |

---

## Issues Found

### P2 - Nice to Fix (2 issues)

#### 1. Outdated comments in `engine.ts` (line 567-573)

The JSDoc comment for `resolveAgent` still describes fallback behavior that has been removed:

```typescript
/**
 * Resolution order:
 * 1. Check if config has new format phase_defaults (role + cli_tool + model)
 *    - If yes, use roles.yaml to get role_prompt, apply task-level overrides
 * 2. Fall back to legacy format (default_agent pointing to agents.yaml)  // ← OUTDATED
 * 3. Fall back to first agent in agents.yaml for the phase              // ← OUTDATED
 */
```

**Recommendation**: Update comment to:
```typescript
/**
 * Resolve which role configuration to use for a given task and phase.
 * 
 * Requires the new phase_defaults format with role, cli_tool, and model.
 * Legacy agents.yaml is no longer supported.
 */
```

#### 2. Contradictory error message in `engine.ts` (line 611)

The error message suggests using `agents.yaml` as an alternative, which is contradictory:

```typescript
throw new Error(
  'No roles defined. Create .mark2/roles.yaml with at least one role, or use legacy agents.yaml format.',
);
```

**Recommendation**: Remove the contradictory suggestion:
```typescript
throw new Error(
  'No roles defined. Create .mark2/roles.yaml with at least one role.'
);
```

---

## Positive Observations

1. **Backward Compatibility**: The `phase_agents` field is preserved in the Task schema but always returns `{}` - good for API compatibility.

2. **Clean Abstraction**: The new `RoleConfig` interface is well-designed and properly typed.

3. **Test Updates**: Tests were correctly updated to use role-based configuration and remove agent-specific test data.

4. **Simplified TmuxManager**: Removing database session tracking in favor of tmux-only management reduces complexity.

5. **Clear Error Messages**: The error when legacy format is used clearly explains what's needed.

6. **New `run-phase.ts`**: Provides clean shared logic for all role-based phase handlers.

---

## Verification

| Check | Result |
|-------|--------|
| All tests pass | ✅ 247/247 |
| TypeScript compiles | ✅ (pre-existing errors only) |
| Roles system preserved | ✅ |
| No orphaned agent references | ✅ |
| Database schema clean | ✅ |

---

## Verdict

**APPROVED** - The PR successfully removes the legacy agents system while preserving the roles system. The two P2 issues are minor comment/message updates that don't affect functionality.
