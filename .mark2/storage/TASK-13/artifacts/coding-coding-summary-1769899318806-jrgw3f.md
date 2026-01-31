# Coding Summary: Remove Legacy Agents System

## Overview

Successfully removed the entire legacy agents system from the Mark2 codebase while preserving the new roles system. This was a major refactoring that touched multiple layers of the application including UI components, API routes, database schema, orchestration logic, and type definitions.

## Technical Implementation Details

### 1. Navigation and UI Components Removed
- **TopNavigation.tsx**: Removed "Agents (Legacy)" link and updated interface types
- **PageHeader.tsx**: Updated currentPage type to remove 'agents' option
- **Deleted entire `/agents` page route** and all related components:
  - `src/app/agents/page.tsx`
  - `src/components/agents/AgentsPage.tsx`
  - `src/components/agents/CreateAgentDialog.tsx`
  - `src/components/agents/EditAgentDialog.tsx`
  - `src/components/agents/ImportAgentsDialog.tsx`
  - `src/components/agents/PhaseDefaultsSection.tsx`
  - `src/components/detail/AgentsTab.tsx`

### 2. API Routes Cleaned Up
- **Removed**: `src/app/api/agents/route.ts` - Complete agent REST API
- **Updated**: Multiple API routes that referenced agent sessions:
  - `src/app/api/tasks/[id]/activity/route.ts` - Updated to work without agent session DB
  - `src/app/api/tasks/[id]/session/route.ts` - Simplified to use tmux discovery only
  - `src/app/api/tasks/[id]/phase/hook-complete/route.ts` - Removed agent name resolution
  - `src/app/api/health/route.ts` - Fixed async session counting

### 3. Database Schema Modifications
- **Removed from tasks table**: `phase_agents_json` column (deprecated)
- **Removed from worktreeRecords table**: `agent_name` column
- **Completely removed**: `agentSessions` table and all references
- **Preserved**: `phase_overrides_json` column for the roles system

### 4. YAML Schema Updates
- **Removed Types**:
  - `AgentDefinitionSchema` and `AgentDefinition`
  - `AgentsFileSchema` and `AgentsFile`
  - `ResolvedAgent` interface
- **Preserved All Role Types**:
  - `RoleSchema` and `Role`
  - `RolesFileSchema` and `RolesFile`
  - `PhaseDefaultSchema` and `PhaseDefault`
  - `TaskPhaseOverrideSchema` and `TaskPhaseOverride`

### 5. Configuration Service Cleanup
- **Removed Methods**:
  - `getAgents()` - Agent data management
  - `updateAgents()` - Agent persistence
- **Preserved Methods**:
  - `getRoles()` - Role data management  
  - `updateRoles()` - Role persistence
  - `getRoleByName()` - Role lookup
- **Updated Imports**: Removed `AgentsFileSchema` and `AgentDefinition` imports

### 6. Orchestration Layer Refactoring
- **File Renamed**: `run-agent-phase.ts` → `run-phase.ts`
- **Interface Updates**:
  - `AgentLike` → `RoleConfig`
  - `RunAgentPhaseContext` → `RunPhaseContext`
  - `RunAgentPhaseOptions` → `RunPhaseOptions`
  - `runAgentPhase()` → `runPhase()`
- **Engine Updates**:
  - Replaced legacy agent resolution with roles-only approach
  - Updated method signature from `AgentDefinition` to `RoleConfig`
  - Removed database session reconciliation logic
  - Simplified error handling for roles system

### 7. Phase Handler Updates
All phase handler files updated to use the new role-based approach:
- `design.ts`, `coding.ts`, `testing.ts`, `code-review.ts`, `fix-review.ts`, `final-testing.ts`, `manual-testing.ts`
- **Changed**: Parameter types from `AgentDefinition` to `RoleConfig`
- **Updated**: All variable references from `agent.*` to `role.*`
- **Fixed**: Import statements and duplicate import issues

### 8. Prompt Assembler Modifications
- **Updated Method Signatures**: `buildAgentAndTaskPrompts()` and `assemble()` now use `RoleConfig`
- **Preserved Interface**: `AgentPromptParts` kept as it represents CLI tool prompt structure
- **Updated References**: All `agent.role_prompt` → `role.role_prompt`

### 9. TmuxManager Simplification
- **Removed Database Tracking**: All agent session database operations removed
- **Simplified Interface**: Now focuses purely on tmux session management
- **Preserved Core Functions**: `spawnAgent()`, `killAgent()`, `cleanupSessions()`
- **Removed Methods**: `markCompleted()`, `markFailed()`, `reconcile()`, `getSessionsForTask()`, etc.

### 10. Service Layer Updates
- **TaskService**: Removed all `phase_agents_json` database operations
- **ReindexService**: Updated to exclude deprecated agent fields
- **WorktreeService**: Removed `agent_name` tracking
- **ConfigService**: Removed agent-related methods entirely

### 11. File and Template Cleanup
- **Removed Files**:
  - `.mark2/agents.yaml` - Agent configuration
  - `cli/templates/agents.yaml` - Agent template
  - `src/hooks/useAgents.ts` - Agent React hook
  - `src/lib/constants/default-agents.ts` - Agent constants
- **Removed Tests**:
  - `tests/integration/api/agents.test.ts`
  - `tests/unit/schemas/agent-schemas.test.ts`
  - `tests/unit/services/config-service-agents.test.ts`

## Architecture Changes

### Before (Agents System)
```
Agent = Role + CLI Tool + Model + Phase (tightly coupled)
├── agents.yaml (single config file)
├── AgentDefinition type
├── Database session tracking
└── Phase-specific agent assignment
```

### After (Roles System)
```
Role (reusable) + CLI Tool + Model (decoupled)
├── roles.yaml (role definitions)
├── config.yaml phase_defaults (role + cli + model per phase)
├── Task phase_overrides (optional per-task overrides)
├── Simplified tmux-only session management
└── Flexible role assignment across phases
```

## Key Design Decisions

1. **Preserved Roles System Completely**: All role-related functionality remained untouched
2. **Backward Compatibility**: Kept `phase_agents` field in YAML schema as optional empty object
3. **Simplified Session Management**: Removed complex database tracking in favor of tmux-only approach
4. **Generic Orchestration**: Renamed files to be role-agnostic rather than agent-specific
5. **Clean Separation**: Ensured no role-related code was accidentally modified

## Testing Strategy

- **TypeScript Compilation**: All files compile without errors
- **Build Process**: Next.js build completes successfully  
- **Preserved Functionality**: Roles system remains fully operational
- **Clean Removal**: No remaining references to agent types or methods

## Migration Notes

Users upgrading to this version will need to:
1. **Remove `agents.yaml`** files from their projects
2. **Configure roles** in `roles.yaml` and `config.yaml` phase_defaults
3. **Update any existing** task `phase_overrides` to use the new format
4. **No database migration** required - removed columns/tables handled automatically

## Files Created/Modified Summary

### Major Deletions (9 files)
- All agent UI components and pages
- Agent API routes  
- Agent hooks and constants
- Agent test files

### Database Schema (1 file)
- `src/lib/db/schema.ts`: Removed agent tables and columns

### Core Logic Updates (15+ files)
- All orchestration phase handlers
- Engine and orchestration utilities
- YAML schemas and configuration
- Service layer files

### API Routes Updated (4 files)  
- Session management endpoints
- Activity logging
- Health checks
- Phase completion hooks

This was a comprehensive removal that successfully cleaned up legacy technical debt while preserving the new, more flexible roles-based architecture.