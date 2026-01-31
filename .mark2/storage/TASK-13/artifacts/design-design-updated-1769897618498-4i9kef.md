# Design Document: Remove Legacy Agents System (Updated)

## Overview

This document outlines the plan for removing the deprecated agents system from the Mark2 codebase while **preserving the new roles system**. The agents system has been replaced with a more flexible role-based system, and all legacy agent-related code needs to be removed.

## Critical Distinction: Agents vs Roles

### Legacy Agents System (TO BE REMOVED)
- Tightly coupled role, CLI tool, and model into a single "agent" entity
- Stored in `agents.yaml`
- Uses `AgentDefinition` type
- Located in `/agents` paths and components

### New Roles System (TO BE PRESERVED)
- Decoupled system with separate concepts:
  - **Roles**: Reusable role definitions with prompts (stored in `roles.yaml`)
  - **Phase Defaults**: Configuration for which role/CLI/model to use per phase
  - **Phase Overrides**: Task-specific overrides for role/CLI/model
- Uses `Role`, `PhaseDefault`, and `TaskPhaseOverride` types
- Located in `/roles` paths and components
- **ALL OF THIS MUST BE PRESERVED**

## Components to Remove (Agents Only)

### 1. Navigation
- **File**: `src/components/shared/TopNavigation.tsx`
- **Change**: Remove the "Agents (Legacy)" navigation link (line 50)
- **Preserve**: Keep any "Roles" navigation links

### 2. Frontend Components - AGENTS ONLY
Remove the following React components and pages:
- `src/app/agents/page.tsx` - Agents page route
- `src/components/agents/AgentsPage.tsx` - Main agents management page
- `src/components/agents/CreateAgentDialog.tsx` - Agent creation dialog
- `src/components/agents/EditAgentDialog.tsx` - Agent editing dialog  
- `src/components/agents/ImportAgentsDialog.tsx` - Import agents from templates
- `src/components/agents/PhaseDefaultsSection.tsx` - Legacy phase defaults for agents
- `src/components/detail/AgentsTab.tsx` - Agents tab in task detail view

**DO NOT REMOVE**:
- `src/app/roles/` - All roles pages
- `src/components/roles/` - All roles components including:
  - `RolesPage.tsx`
  - `CreateRoleDialog.tsx`
  - `EditRoleDialog.tsx`
  - `ImportRolesDialog.tsx`
  - `PhaseDefaultsSection.tsx` (roles version)

### 3. API Routes
- **Remove**: `src/app/api/agents/route.ts` - REST API endpoints for agents CRUD
- **Preserve**: `src/app/api/roles/` - All roles API endpoints

### 4. Hooks and Services
- **Remove**: 
  - `src/hooks/useAgents.ts` - React hook for agents data management
  - `src/lib/constants/default-agents.ts` - Default agent templates
- **Preserve**:
  - `src/hooks/useRoles.ts` - React hook for roles data management
  - Any role-related constants

### 5. Database Schema
Update `src/lib/db/schema.ts` to remove:
- `phase_agents_json` column from tasks table (line 29, marked as deprecated)
- `agent_name` column from `worktreeRecords` table (line 88)
- `agentSessions` table entirely (lines 100-117)

**DO NOT REMOVE**:
- `phase_overrides_json` column (this is for the new roles system)
- Any role-related columns or tables

### 6. YAML Schemas
Update `src/lib/yaml/schemas.ts`:
- **Remove**:
  - `AgentDefinitionSchema` (lines 40-48)
  - `AgentDefinition` type export (line 49)
  - `AgentsFileSchema` (lines 212-214)
  - `AgentsFile` type export (line 215)
  - `ResolvedAgent` interface if it's only used by agents
- **Preserve**:
  - `RoleSchema`
  - `Role` type
  - `RolesFileSchema`
  - `RolesFile` type
  - `PhaseDefaultSchema`
  - `PhaseDefault` type
  - `TaskPhaseOverrideSchema`
  - `TaskPhaseOverride` type
  - `isNewPhaseDefault` and `isLegacyPhaseDefault` functions

### 7. Config Service Methods
Update `src/lib/services/config-service.ts`:
- **Remove**:
  - `getAgents()` method (lines 84-116)
  - `updateAgents()` method (lines 122-132)
  - `AgentsFileSchema` and `AgentDefinition` imports
- **Preserve**:
  - `getRoles()` method
  - `updateRoles()` method
  - `getRoleByName()` method
  - All role-related functionality

### 8. Agent Files
- **Remove**:
  - `.mark2/agents.yaml` file
  - `cli/templates/agents.yaml` template file
- **Preserve**:
  - `.mark2/roles.yaml` file
  - Any role template files

### 9. Tests
- **Remove**:
  - `tests/integration/api/agents.test.ts`
  - `tests/unit/schemas/agent-schemas.test.ts`  
  - `tests/unit/services/config-service-agents.test.ts`
- **Update**:
  - Tests that reference `phase_agents` property
  - Tests that import `AgentDefinition` or `AgentsFile`
- **Preserve**:
  - All role-related tests
  - Tests for phase overrides

### 10. Orchestration Code
Review and update:
- `src/lib/orchestration/phase-handlers/run-agent-phase.ts` - Check if this is used by roles system
  - If it's generic and used by roles, rename to `run-phase.ts` or similar
  - If it's agent-specific, remove it
  - Check for `ResolvedAgent` usage - this might need to be updated to work with roles

## Migration Considerations

### Database Migration Required
A database migration will be needed to:
1. Drop the `phase_agents_json` column from tasks table
2. Drop the `agent_name` column from worktree_records table  
3. Drop the entire `agent_sessions` table
4. Ensure existing tasks with phase_overrides continue to work

### Type Imports to Update
Files that import agent types will need updating:
- Change `import type { AgentDefinition }` to appropriate role types
- Remove `AgentsFile` imports
- Update any `ResolvedAgent` references

### Backwards Compatibility
Since agents.yaml files may exist in projects:
1. Add a startup check that warns users if agents.yaml exists
2. Provide migration guide from agents to roles
3. Consider a migration utility to convert agents.yaml to roles.yaml format

## Implementation Steps

1. **Remove Navigation Link** - Quick win, immediately removes user access
2. **Remove Agent Frontend Components** - Remove all agent UI components (not roles!)
3. **Remove Agent API Routes** - Remove agent REST endpoints only
4. **Update Tests** - Remove agent-specific tests, update others
5. **Update YAML Schemas** - Remove agent types, preserve role types
6. **Update Config Service** - Remove deprecated agent methods
7. **Update Type Imports** - Fix all TypeScript imports
8. **Database Migration** - Create and test migration scripts
9. **Remove Agent Files** - Delete yaml files and templates
10. **Final Testing** - Ensure roles system works perfectly

## Testing Plan

1. **Roles System Verification**:
   - Create, edit, delete roles still works
   - Phase defaults can be configured with roles
   - Task overrides work correctly
2. **Unit Tests**: All remaining tests pass
3. **Integration Tests**: Full task lifecycle with roles
4. **Manual Testing**: 
   - Verify roles UI is intact
   - Test phase transitions with role assignments
   - Ensure no console errors
5. **Migration Testing**: Test on projects with existing agents.yaml

## Success Criteria

- All agent-related code is removed
- Roles system remains fully functional
- No TypeScript errors from missing types
- All tests pass
- Database migration completes cleanly
- Clear migration path for users with agents.yaml files