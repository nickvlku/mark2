# Manual Test Plan: Remove Legacy Agents System (TASK-13)

## Overview

This test plan verifies that the legacy agents system has been completely removed while the new roles system remains fully functional.

## Prerequisites

- Development server running at: **http://localhost:3113**
- Port in use: **3113**

## Test Cases

### 1. Navigation Verification

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Navigate to http://localhost:3113 | Page loads with Mark2 Board |
| 1.2 | Check the navigation bar | Should show only "Board" and "Roles" links |
| 1.3 | Verify "Agents (Legacy)" link is NOT present | No agents link should appear |

### 2. Roles Page Functionality

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Click "Roles" in the navigation | Navigate to /roles page |
| 2.2 | Verify "Phase Defaults" section is visible | Section shows configuration for all phases (Design, Coding, Testing, Code Review, Fix Review, Final Testing, Manual Testing) |
| 2.3 | Check each phase has Role, CLI Tool, and Model dropdowns | All three dropdowns should be present with options |
| 2.4 | Verify "All Roles" section shows roles | Should display 15 expert roles (system-architect, ui-ux-designer, api-designer, fullstack-coder, backend-coder, frontend-coder, security-coder, test-engineer, performance-tester, e2e-tester, code-reviewer, security-reviewer, style-reviewer, qa-analyst, accessibility-tester) |
| 2.5 | Click "Create Role" button | Should open create role dialog |
| 2.6 | Click "Import Templates" button | Should open import templates dialog |
| 2.7 | Click "Edit" button on any role | Should open edit role dialog |

### 3. Agents Page Removed

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Navigate directly to http://localhost:3113/agents | Should display 404 error page |
| 3.2 | Verify the 404 page shows "This page could not be found." | Standard Next.js 404 page |

### 4. API Endpoints

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Test `/api/roles` endpoint | Should return JSON array of roles (200 OK) |
| 4.2 | Test `/api/agents` endpoint | Should return 404 Not Found |

```bash
# Verify roles API works
curl http://localhost:3113/api/roles

# Verify agents API is removed
curl -w "\nHTTP Status: %{http_code}\n" http://localhost:3113/api/agents
```

### 5. Board Functionality (Regression Test)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Click "+ Task" button | Should open create task dialog |
| 5.2 | Create a new task with title and description | Task should appear in Pending column |
| 5.3 | Click on the task card | Should open task detail view |
| 5.4 | Verify task detail view has no "Agents" tab | Only expected tabs should be present |

### 6. Phase Defaults Configuration

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Go to /roles page | Page loads successfully |
| 6.2 | Change a role assignment in Phase Defaults | Should save without error |
| 6.3 | Change a CLI tool assignment | Should save without error |
| 6.4 | Change a model assignment | Should save without error |
| 6.5 | Toggle "Auto-advance" checkbox | Should save without error |
| 6.6 | Refresh the page | Settings should persist |

### 7. Console Error Check

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | Open browser developer tools (F12) | Console tab visible |
| 7.2 | Navigate through all pages | No JavaScript errors related to "agent" or "agents" |
| 7.3 | Check network tab for failed requests | No 404s for agent-related resources |

## Automated Verification Results

The following verifications were performed automatically:

- ✅ Navigation shows only "Board" and "Roles" (no "Agents (Legacy)")
- ✅ /agents page returns 404
- ✅ /api/agents endpoint returns 404
- ✅ /roles page loads and shows Phase Defaults with all phases
- ✅ /api/roles endpoint returns all 15 roles correctly
- ✅ Roles page displays all role cards with Edit/Delete buttons
- ✅ No console errors on page load

## Test Environment

- **Dev Server Port**: 3113
- **Dev Server URL**: http://localhost:3113
- **WebSocket URL**: ws://localhost:3113/ws

## Pass/Fail Criteria

- **PASS**: All test cases pass, no agent-related UI or API endpoints accessible
- **FAIL**: Any agent-related functionality is still accessible, or roles system is broken
