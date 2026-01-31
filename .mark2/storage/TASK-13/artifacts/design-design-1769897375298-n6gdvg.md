# Design Document: Remove Legacy Agents System

## Overview

This document outlines the plan for removing the deprecated agents system from the Mark2 codebase. The agents system has been replaced with a more flexible role-based system, and all legacy agent-related code, UI, and database structures need to be removed.

## Background

The project has migrated from a tightly-coupled "agents" model (where role, CLI tool, and model were bundled together) to a decoupled system using:
- **Roles**: Reusable role definitions with prompts
- **Phase Defaults**: Configuration for which role/CLI/model to use per phase
- **Phase Overrides**: Task-specific overrides for role/CLI/model

## Components to Remove

### 1. Navigation
- **File**: `src/components/shared/TopNavigation.tsx`
- **Change**: Remove the "Agents (Legacy)" navigation link (line 50)

### 2. Frontend Components
Remove the following React components and pages:
- `src/app/agents/page.tsx` - Agents page route
- `src/components/agents/AgentsPage.tsx` - Main agents management page
- `src/components/agents/CreateAgentDialog.tsx` - Agent creation dialog
- `src/components/agents/EditAgentDialog.tsx` - Agent editing dialog  
- `src/components/agents/ImportAgentsDialog.tsx` - Import agents from templates
- `src/components/agents/PhaseDefaultsSection.tsx` - Phase defaults UI (may need review)
- `src/components/detail/AgentsTab.tsx` - Agents tab in task detail view

### 3. API Routes
- `src/app/api/agents/route.ts` - REST API endpoints for agents CRUD

### 4. Hooks and Services
- `src/hooks/useAgents.ts` - React hook for agents data management
- `src/lib/constants/default-agents.ts` - Default agent templates

### 5. Database Schema
Update `src/lib/db/schema.ts` to remove:
- `phase_agents_json` column from tasks table (line 29, marked as deprecated)
- `agent_name` column from `worktreeRecords` table (line 88)
- `agentSessions` table entirely (lines 100-117)
- `agent_name` column from that table (line 106)

### 6. YAML Schemas
Update `src/lib/yaml/schemas.ts`:
- Remove `AgentDefinitionSchema` (lines 40-48)
- Remove `AgentDefinition` type export (line 49)
- Remove `AgentsFileSchema` (lines 212-214)
- Remove `AgentsFile` type export (line 215)
- Clean up import statements in files that import these types

### 7. Config Service Methods
Update `src/lib/services/config-service.ts`:
- Remove `getAgents()` method (lines 84-116)
- Remove `updateAgents()` method (lines 122-132)
- Remove `AgentsFileSchema` and `AgentDefinition` imports

### 8. Agent Files
- Remove `.mark2/agents.yaml` file
- Remove `cli/templates/agents.yaml` template file

### 9. Tests
Remove test files:
- `tests/integration/api/agents.test.ts`
- `tests/unit/schemas/agent-schemas.test.ts`  
- `tests/unit/services/config-service-agents.test.ts`

Update test files that reference agents:
- Update schema tests that use `phase_agents`
- Update any integration tests that reference `AgentDefinition` or `AgentsFile`

### 10. Orchestration Code
Review and possibly update:
- `src/lib/orchestration/phase-handlers/run-agent-phase.ts` - May need to be renamed or refactored

## Migration Considerations

### Database Migration Required
A database migration will be needed to:
1. Drop the `phase_agents_json` column from tasks table
2. Drop the `agent_name` column from worktree_records table
3. Drop the entire `agent_sessions` table

### Backwards Compatibility
Since agents.yaml files may exist in projects:
1. Consider adding a startup check that warns users if agents.yaml exists
2. Provide migration instructions in release notes
3. The config service already has deprecation warnings on agent methods

### Phase Defaults Section
The `PhaseDefaultsSection.tsx` component needs review - it may be used by the new roles system and might need to be moved rather than deleted.

## Implementation Steps

1. **Remove Navigation Link** - Quick win, immediately removes user access
2. **Remove Frontend Components** - Remove all UI components and pages
3. **Remove API Routes** - Remove REST endpoints
4. **Update Tests** - Remove agent-specific tests and update others
5. **Update Schemas** - Remove agent types from YAML schemas
6. **Update Config Service** - Remove deprecated methods
7. **Database Migration** - Create migration to drop columns/tables
8. **Clean Up Imports** - Find and remove all imports of deleted types
9. **Remove Agent Files** - Delete yaml files and templates
10. **Test Thoroughly** - Ensure roles system still works correctly

## Risks and Mitigations

### Risk 1: Breaking Existing Projects
**Mitigation**: Add clear migration instructions and deprecation warnings in release notes.

### Risk 2: Missing Agent References
**Mitigation**: Thorough code search for "agent", "Agent", "agents", "Agents" to catch all references.

### Risk 3: Database Migration Issues
**Mitigation**: Test migration thoroughly, provide rollback instructions.

## Testing Plan

1. **Unit Tests**: Ensure all remaining tests pass after removal
2. **Integration Tests**: Test full task lifecycle with roles system
3. **Manual Testing**: 
   - Verify navigation works without agents link
   - Test task creation and phase transitions with roles
   - Ensure no console errors or broken references
4. **Migration Testing**: Test database migration on sample data

## Success Criteria

- All agent-related code is removed
- No references to agents remain in the codebase
- All tests pass
- Roles system continues to function correctly
- Clean database schema without legacy columns