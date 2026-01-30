# Manual Testing Plan - Agents Page Feature

## Test Environment Status
- **Development Server**: Mark2 server running on http://localhost:3100
- **WebSocket Endpoint**: ws://localhost:3100/ws  
- **API Health Status**: ✅ Healthy (active_agents: 0, active_bakeoffs: 0)
- **Port Allocations**: None currently allocated

## Feature Overview
This test plan covers the new Agents Page feature that allows users to view, edit, and create agent definitions. Agents are configurations that combine:
- Agent name (lowercase alphanumeric with hyphens)
- CLI tool (claude-code, codex-cli, gemini-cli, opencode)
- Model specification
- Role prompt
- Timeout in minutes

## Current System State
The system currently has 3 predefined agents:
1. **claude-architect** - Claude Sonnet 4, 30min timeout, system architecture role
2. **claude-coder** - Claude Sonnet 4, 120min timeout, software engineering role  
3. **claude-reviewer** - Claude Sonnet 4, 30min timeout, security-focused code review role

---

## Test Cases

### Navigation Tests

#### TC-001: Access Agents Page via Direct URL
**Objective**: Verify agents page is accessible via direct navigation
**Steps**:
1. Open browser and navigate to `http://localhost:3100/agents`
2. Verify page loads successfully
3. Check that URL shows `/agents`

**Expected Results**:
- Page loads without errors
- Agents interface is displayed
- URL correctly shows `/agents` route

#### TC-002: Navigation Integration Check
**Objective**: Verify navigation to agents page from main application
**Steps**:
1. Navigate to `http://localhost:3100` (main board)
2. Look for navigation menu or link to Agents page
3. Click on agents navigation link/button
4. Verify successful navigation

**Expected Results**:
- Navigation element to agents page exists
- Clicking navigation successfully routes to `/agents`
- Navigation state is properly updated

### Agents List Display Tests

#### TC-003: Display Current Agents
**Objective**: Verify all existing agents are displayed correctly
**Steps**:
1. Navigate to agents page
2. Verify all 3 existing agents are displayed:
   - claude-architect
   - claude-coder  
   - claude-reviewer
3. Check that agent information is properly formatted

**Expected Results**:
- All 3 agents appear in the interface
- Agent names are displayed correctly
- CLI tools, models, and timeouts are shown
- Role prompts are visible (truncated if necessary)

#### TC-004: Empty State Handling
**Objective**: Verify behavior when no agents exist
**Steps**:
1. Temporarily remove all agents (via API: `DELETE /api/agents` or manual YAML edit)
2. Navigate to agents page
3. Observe empty state display
4. Restore agents afterward

**Expected Results**:
- Appropriate empty state message is shown
- UI remains stable with no agents
- Option to create first agent is available

### Agent Creation Tests

#### TC-005: Create New Agent - Valid Data
**Objective**: Test successful agent creation with valid input
**Steps**:
1. Click "Create Agent" or similar button
2. Fill in form with valid data:
   - Name: `test-agent`
   - CLI Tool: `claude-code`
   - Model: `claude-sonnet-4-20250514`
   - Role Prompt: `You are a test agent for validation.`
   - Timeout: `45`
3. Submit the form
4. Verify agent appears in the list

**Expected Results**:
- Form opens successfully
- All fields accept valid input
- Agent is created and appears in list
- Success message/feedback is shown
- Form closes/resets after creation

#### TC-006: Create Agent - Name Validation
**Objective**: Test name field validation rules
**Steps**:
1. Open agent creation form
2. Test invalid names:
   - `Test-Agent` (uppercase)
   - `test_agent` (underscore)
   - `test agent` (space)
   - `test@agent` (special characters)
3. Test valid names:
   - `test-agent`
   - `my-new-agent-123`
   - `agent1`

**Expected Results**:
- Invalid names show validation errors
- Error messages are clear and helpful
- Valid names are accepted
- Submit button is disabled for invalid names

#### TC-007: Create Agent - Required Fields
**Objective**: Test required field validation
**Steps**:
1. Open agent creation form
2. Try to submit with empty fields
3. Fill fields one by one and test partial submissions
4. Verify all required fields are enforced

**Expected Results**:
- Empty required fields show validation errors
- Form cannot be submitted with missing required data
- Clear indication of which fields are required
- Validation messages are helpful

#### TC-008: Create Agent - CLI Tool Selection
**Objective**: Test CLI tool dropdown/selection
**Steps**:
1. Open agent creation form
2. Click on CLI tool field
3. Verify available options:
   - claude-code
   - codex-cli
   - gemini-cli
   - opencode
4. Select each option and verify selection

**Expected Results**:
- All 4 CLI tools are available
- Selection works properly
- Selected value is properly displayed
- No invalid options are selectable

#### TC-009: Create Agent - Timeout Validation
**Objective**: Test timeout field validation
**Steps**:
1. Open agent creation form
2. Test invalid timeout values:
   - Negative numbers (-5)
   - Zero (0)
   - Non-integers (30.5)
   - Very large numbers (9999999)
3. Test valid timeouts: 1, 30, 60, 120, 240

**Expected Results**:
- Invalid timeouts show validation errors
- Only positive integers are accepted
- Reasonable upper limit is enforced
- Valid timeouts are accepted

### Agent Editing Tests

#### TC-010: Edit Existing Agent
**Objective**: Test editing agent properties
**Steps**:
1. Click edit button on an existing agent
2. Modify agent properties:
   - Change timeout from 30 to 60
   - Update role prompt
   - Change model if applicable
3. Save changes
4. Verify changes are reflected

**Expected Results**:
- Edit form opens with current values
- All fields are editable (except name if restricted)
- Changes save successfully
- Updated values appear in the list
- Original values are preserved if canceling

#### TC-011: Edit Agent - Name Restrictions
**Objective**: Test if agent names can be changed
**Steps**:
1. Edit an existing agent
2. Try to modify the agent name
3. Observe behavior (may be restricted for existing agents)

**Expected Results**:
- Behavior follows intended design
- If name editing is disabled, field is read-only
- If enabled, same validation rules apply as creation
- Clear indication of restrictions if any

#### TC-012: Cancel Edit Operation
**Objective**: Test canceling edit without saving
**Steps**:
1. Edit an existing agent
2. Make several changes to different fields
3. Click cancel/close without saving
4. Verify original values are preserved

**Expected Results**:
- Cancel operation works properly
- No changes are saved
- Original agent data is unchanged
- UI returns to list view

### Agent Deletion Tests

#### TC-013: Delete Agent
**Objective**: Test agent deletion functionality
**Steps**:
1. Click delete button on a test agent
2. Verify confirmation dialog appears
3. Confirm deletion
4. Verify agent is removed from list

**Expected Results**:
- Deletion requires confirmation
- Confirmation dialog is clear
- Agent is successfully removed
- List updates immediately

#### TC-014: Delete Confirmation Cancel
**Objective**: Test canceling deletion
**Steps**:
1. Click delete on an agent
2. Click "Cancel" in confirmation dialog
3. Verify agent remains in list

**Expected Results**:
- Cancel works properly
- Agent is not deleted
- No changes to agent list

#### TC-015: Delete Agent in Use
**Objective**: Test deletion of agents assigned to tasks
**Steps**:
1. Ensure an agent is assigned to a task
2. Try to delete that agent
3. Observe behavior (should show warning or prevent deletion)

**Expected Results**:
- System prevents deletion or shows warning
- Clear message about agent being in use
- Option to force delete or reassign tasks

### API Integration Tests

#### TC-016: API Error Handling - Server Down
**Objective**: Test behavior when API is unavailable
**Steps**:
1. Stop the development server
2. Try to perform agent operations (create, edit, delete)
3. Restart server and test recovery

**Expected Results**:
- Clear error messages for failed operations
- UI remains stable during errors
- Graceful recovery when server returns

#### TC-017: API Error Handling - Validation Errors
**Objective**: Test handling of server-side validation errors
**Steps**:
1. Use browser dev tools to modify form validation
2. Submit invalid data that bypasses client validation
3. Observe server error handling

**Expected Results**:
- Server validation errors are displayed
- User-friendly error messages
- Form remains usable after errors

### Data Persistence Tests

#### TC-018: Data Persistence Across Sessions
**Objective**: Verify agent data persists across browser sessions
**Steps**:
1. Create a new agent
2. Edit an existing agent
3. Close browser/tab
4. Reopen and navigate to agents page
5. Verify all changes persist

**Expected Results**:
- New agent still exists
- Edited changes are preserved
- No data loss occurs

#### TC-019: Real-time Updates
**Objective**: Test WebSocket updates if supported
**Steps**:
1. Open agents page in two browser tabs
2. Make changes in one tab
3. Observe if changes appear in other tab

**Expected Results**:
- If real-time updates are implemented, changes sync
- If not, manual refresh shows changes
- No UI corruption occurs

### UI/UX Tests

#### TC-020: Responsive Design
**Objective**: Test agents page on different screen sizes
**Steps**:
1. Test on desktop (1920x1080)
2. Test on tablet (768x1024)
3. Test on mobile (375x667)
4. Verify all functionality works

**Expected Results**:
- Interface adapts to different screen sizes
- All buttons and forms remain accessible
- Text remains readable at all sizes
- No horizontal scrolling required

#### TC-021: Form Usability
**Objective**: Test form interaction quality
**Steps**:
1. Test keyboard navigation through forms
2. Test tab order
3. Test enter/escape key behaviors
4. Test copy/paste in text fields

**Expected Results**:
- Logical tab order through form fields
- Enter submits forms appropriately
- Escape cancels/closes forms
- Standard keyboard shortcuts work

#### TC-022: Loading States
**Objective**: Test loading indicators and states
**Steps**:
1. Monitor network requests during operations
2. Look for loading spinners/indicators
3. Test behavior during slow network conditions

**Expected Results**:
- Clear loading indicators during API calls
- UI remains responsive during loading
- Appropriate timeouts for long operations

### Error Scenarios

#### TC-023: Network Connectivity Issues
**Objective**: Test behavior during network problems
**Steps**:
1. Disconnect network while using the page
2. Try to perform operations
3. Reconnect and test recovery

**Expected Results**:
- Clear error messages for network failures
- Graceful degradation of functionality
- Automatic recovery when possible

#### TC-024: Invalid JSON Responses
**Objective**: Test handling of malformed API responses
**Steps**:
1. Use browser dev tools to intercept API calls
2. Modify responses to return invalid data
3. Observe error handling

**Expected Results**:
- Application handles malformed responses
- No JavaScript errors in console
- User sees appropriate error messages

### Performance Tests

#### TC-025: Large Agent Lists
**Objective**: Test performance with many agents
**Steps**:
1. Create 20+ agents through the API or YAML
2. Load the agents page
3. Test scrolling and interactions

**Expected Results**:
- Page loads quickly even with many agents
- Smooth scrolling and interactions
- No performance degradation

#### TC-026: Form Performance
**Objective**: Test form responsiveness
**Steps**:
1. Type quickly in text fields
2. Switch between form fields rapidly
3. Submit forms multiple times

**Expected Results**:
- Forms remain responsive to input
- No input lag or delays
- Multiple rapid operations work correctly

---

## Test Execution Notes

### Prerequisites
- Mark2 development server running on localhost:3100
- Modern browser (Chrome, Firefox, Safari, Edge)
- Network connectivity for API calls

### Test Environment Setup
1. Ensure server is running: `npm run dev`
2. Verify health endpoint: `curl http://localhost:3100/api/health`
3. Back up current agents.yaml if testing destructive operations
4. Have browser dev tools ready for network monitoring

### Expected Overall Behavior
- Professional, dark-themed UI matching Mark2 design system
- Smooth navigation between board and agents pages
- Comprehensive CRUD operations for agent management
- Real-time updates via WebSocket (if implemented)
- Proper validation and error handling
- Mobile-responsive design

### Post-Testing Cleanup
- Remove any test agents created during testing
- Restore original agents.yaml if modified
- Verify main board functionality still works
- Document any bugs or issues found

---

## Success Criteria

The agents page feature is considered successfully implemented when:

1. ✅ Page is accessible via `/agents` URL
2. ✅ Navigation to/from agents page works seamlessly  
3. ✅ All existing agents display correctly
4. ✅ New agents can be created with proper validation
5. ✅ Existing agents can be edited and changes persist
6. ✅ Agents can be deleted with proper confirmation
7. ✅ Form validation prevents invalid data entry
8. ✅ Error handling is robust and user-friendly
9. ✅ UI is responsive and matches design system
10. ✅ Data persists correctly across sessions

**Critical Issues**: Any failures in core CRUD operations or navigation
**Major Issues**: Validation bypasses, poor error handling, data loss
**Minor Issues**: UI polish, minor UX improvements, edge case handling